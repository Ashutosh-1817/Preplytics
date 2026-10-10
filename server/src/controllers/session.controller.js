import Session from '../models/Session.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { recalculateGoalEfficiency } from '../services/efficiency.service.js';

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

// ---------- POST /sessions/start ----------

export const startSession = asyncHandler(async (req, res) => {
  const { nodeId } = req.body;

  const node = await RoadmapNode.findOne({ _id: nodeId });
  if (!node) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
  }

  const activeSession = await Session.findOne({ owner: req.user._id, endedAt: null });
  if (activeSession) {
    throw new ApiError(
      400,
      ErrorCodes.VALIDATION_ERROR,
      'A session is already running. Stop it before starting another.'
    );
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

  res.status(201).json(new ApiResponse(201, { session }, 'Session started'));
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

  const endedAt = new Date();
  const rawSeconds = Math.floor((endedAt - session.startedAt) / 1000);

  // Too short to be real study time — discard the session entirely
  // rather than counting it as a rounded-up minute. This is what
  // prevents quick node-switching (which auto-stops the timer) from
  // inflating actualMinutesSpent with several near-zero sessions.
  if (rawSeconds < MIN_LOGGABLE_SECONDS) {
    await session.deleteOne();
    return res
      .status(200)
      .json(new ApiResponse(200, { session: null, discarded: true }, 'Session too short to log — not recorded'));
  }

  session.endedAt = endedAt;
  session.durationMinutes = Math.max(1, Math.round(rawSeconds / 60));
  await session.save();

  await applySessionToNode(session);

  res.status(200).json(new ApiResponse(200, { session, discarded: false }, 'Session stopped'));
});

// ---------- POST /sessions/manual ----------

export const logManualSession = asyncHandler(async (req, res) => {
  const { nodeId, durationMinutes, startedAt } = req.body;

  const node = await RoadmapNode.findOne({ _id: nodeId });
  if (!node) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
  }

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

  const node = await RoadmapNode.findOne({ _id: nodeId });
  if (!node) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
  }

  await Session.deleteMany({ owner: req.user._id, nodeId });
  await RoadmapNode.findByIdAndUpdate(nodeId, { actualMinutesSpent: 0 });
  await recalculateGoalEfficiency(node.goalId);

  res.status(200).json(new ApiResponse(200, null, 'Time reset for this topic'));
});