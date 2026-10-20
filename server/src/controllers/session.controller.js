import Session from '../models/Session.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import Goal from '../models/Goal.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { recalculateGoalEfficiency } from '../services/efficiency.service.js';
import { getOwnedGoalOrFail } from './goal.controller.js';

const MIN_LOGGABLE_SECONDS = 30; // below this, treat as an accidental tap — discard entirely

const applySessionToNode = async (session) => {
  const node = await RoadmapNode.findByIdAndUpdate(
    session.nodeId,
    { $inc: { actualMinutesSpent: session.durationMinutes } },
    { new: true }
  );
  if (node) await recalculateGoalEfficiency(session.goalId);
};

const reverseSessionFromNode = async (session) => {
  const node = await RoadmapNode.findByIdAndUpdate(
    session.nodeId,
    { $inc: { actualMinutesSpent: -session.durationMinutes } },
    { new: true }
  );
  if (node) {
    // Never let a correction push time negative
    if (node.actualMinutesSpent < 0) {
      await RoadmapNode.findByIdAndUpdate(node._id, { actualMinutesSpent: 0 });
    }
    await recalculateGoalEfficiency(session.goalId);
  }
};

// A node must belong to one of the caller's own goals. Without this check any
// logged-in user could start, log or reset time on someone else's topic.
const getOwnedNodeOrFail = async (nodeId, userId) => {
  const node = await RoadmapNode.findById(nodeId);
  if (!node) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
  }
  await getOwnedGoalOrFail(node.goalId, userId);
  return node;
};

// Closes a running timer session. Used by "Stop" and by "close the old one
// and start this one", so both behave identically.
const finalizeSession = async (session, requestedEndedAt = null) => {
  const now = new Date();
  let endedAt = now;

  // An idle timer is trimmed to the user's last activity. The end can never be
  // in the future or before the session started.
  if (requestedEndedAt) {
    const requested = new Date(requestedEndedAt);
    if (!Number.isNaN(requested.getTime()) && requested < now) {
      endedAt = requested < session.startedAt ? session.startedAt : requested;
    }
  }

  const rawSeconds = Math.floor((endedAt - session.startedAt) / 1000);

  // Too short to be real study time — discard the session entirely
  // rather than counting it as a rounded-up minute. This is what
  // prevents quick node-switching (which auto-stops the timer) from
  // inflating actualMinutesSpent with several near-zero sessions.
  if (rawSeconds < MIN_LOGGABLE_SECONDS) {
    await session.deleteOne();
    return { session: null, discarded: true };
  }

  session.endedAt = endedAt;
  session.durationMinutes = Math.max(1, Math.round(rawSeconds / 60));
  await session.save();

  await applySessionToNode(session);

  return { session, discarded: false };
};

// What the UI needs to say WHICH session is running. Titles are null when the
// goal or topic has since been deleted.
const describeRunningSession = async (session) => {
  const [goal, node] = await Promise.all([
    Goal.findById(session.goalId).select('title'),
    RoadmapNode.findById(session.nodeId).select('title'),
  ]);

  return {
    sessionId: session._id,
    goalId: session.goalId,
    goalTitle: goal?.title ?? null,
    nodeId: session.nodeId,
    nodeTitle: node?.title ?? null,
    startedAt: session.startedAt,
    elapsedMinutes: Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 60000)),
  };
};

// ---------- GET /sessions/active ----------
// The single source of truth for "is a timer running, and on what?".
// (GET /sessions only lists FINISHED sessions, so it can never answer this.)

export const getActiveSession = asyncHandler(async (req, res) => {
  const running = await Session.findOne({ owner: req.user._id, endedAt: null }).sort({ startedAt: -1 });

  res.status(200).json(
    new ApiResponse(
      200,
      { session: running ? await describeRunningSession(running) : null },
      'Active session fetched'
    )
  );
});

// ---------- POST /sessions/start ----------
// 409 + details of the running session when one already exists.
// Send { force: true } to close it (its time is saved) and start this one.

export const startSession = asyncHandler(async (req, res) => {
  const { nodeId, force } = req.body;

  const node = await getOwnedNodeOrFail(nodeId, req.user._id);

  // Normally at most one, but older races could have left several open
  const runningSessions = await Session.find({ owner: req.user._id, endedAt: null }).sort({ startedAt: -1 });

  if (runningSessions.length > 0 && !force) {
    const activeSession = await describeRunningSession(runningSessions[0]);
    const what = activeSession.goalTitle ? `"${activeSession.goalTitle}"` : 'another topic';

    throw new ApiError(
      409,
      ErrorCodes.SESSION_ALREADY_RUNNING,
      `A session for ${what} is currently running. Stop it before starting another.`,
      { activeSession }
    );
  }

  // force: save and close whatever is running before starting the new one
  const closedSessions = [];
  for (const running of runningSessions) {
    const result = await finalizeSession(running);
    closedSessions.push({
      sessionId: running._id,
      discarded: result.discarded,
      durationMinutes: result.session?.durationMinutes ?? 0,
    });
  }

  const session = await Session.create({
    owner: req.user._id,
    goalId: node.goalId,
    nodeId: node._id,
    startedAt: new Date(),
    source: 'timer',
  });

  if (node.status === 'not_started') {
    node.status = 'in_progress';
    await node.save();
  }

  res.status(201).json(new ApiResponse(201, { session, closedSessions }, 'Session started'));
});

// ---------- POST /sessions/stop ----------

export const stopSession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.body.sessionId, owner: req.user._id });

  if (!session) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Session not found');
  }

  if (session.endedAt) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Session already stopped');
  }

  const result = await finalizeSession(session, req.body.endedAt);

  if (result.discarded) {
    return res
      .status(200)
      .json(new ApiResponse(200, { session: null, discarded: true }, 'Session too short to log — not recorded'));
  }

  res.status(200).json(new ApiResponse(200, { session: result.session, discarded: false }, 'Session stopped'));
});

// ---------- POST /sessions/manual ----------

export const logManualSession = asyncHandler(async (req, res) => {
  const { nodeId, durationMinutes, startedAt } = req.body;

  const node = await getOwnedNodeOrFail(nodeId, req.user._id);

  const started = new Date(startedAt);

  const session = await Session.create({
    owner: req.user._id,
    goalId: node.goalId,
    nodeId: node._id,
    startedAt: started,
    endedAt: new Date(started.getTime() + durationMinutes * 60000),
    durationMinutes,
    source: 'manual',
  });

  await applySessionToNode(session);

  res.status(201).json(new ApiResponse(201, { session }, 'Session logged'));
});

// ---------- GET /sessions ----------

export const getSessions = asyncHandler(async (req, res) => {
  const { goalId, nodeId } = req.query;

  const filter = { owner: req.user._id, durationMinutes: { $ne: null } };
  if (goalId) filter.goalId = goalId;
  if (nodeId) filter.nodeId = nodeId;

  const sessions = await Session.find(filter).sort({ startedAt: -1 }).limit(20);

  res.status(200).json(new ApiResponse(200, { sessions }, 'Sessions fetched successfully'));
});

// ---------- DELETE /sessions/:sessionId ----------
// Undo a single logged session — removes it and reverses its minutes
// from the node's total.

export const deleteSession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.sessionId, owner: req.user._id });

  if (!session) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Session not found');
  }

  if (session.durationMinutes) {
    await reverseSessionFromNode(session);
  }

  await session.deleteOne();

  res.status(200).json(new ApiResponse(200, null, 'Session removed'));
});

// ---------- DELETE /sessions/node/:nodeId/reset ----------
// Full reset — removes every logged session for this node and zeroes
// its actualMinutesSpent. The clean "something went wrong, start over"
// escape hatch.

export const resetNodeSessions = asyncHandler(async (req, res) => {
  const { nodeId } = req.params;

  const node = await getOwnedNodeOrFail(nodeId, req.user._id);

  await Session.deleteMany({ owner: req.user._id, nodeId });
  await RoadmapNode.findByIdAndUpdate(nodeId, { actualMinutesSpent: 0 });
  await recalculateGoalEfficiency(node.goalId);

  res.status(200).json(new ApiResponse(200, null, 'Time reset for this topic'));
});