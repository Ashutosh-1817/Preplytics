import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import buildTree from '../utils/buildTree.js';
import { getOwnedGoalOrFail } from './goal.controller.js';
import File from '../models/File.model.js';
import { syncTaskFromNodeStatus } from '../services/statusSync.service.js';
import Note from '../models/Note.model.js';


const MAX_DEPTH = 3;

// ---------- POST /goals/:goalId/nodes ----------

export const createNode = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);
  const { parentId, title, estimatedMinutes, order } = req.body;

  let level = 1;
  let parent = null;

  if (parentId) {
    parent = await RoadmapNode.findById(parentId);

    if (!parent) {
      throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Parent node not found');
    }

    // Guard against attaching a node under a parent that belongs to a
    // different goal — prevents cross-goal tree corruption
    if (parent.goalId.toString() !== goal._id.toString()) {
      throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Parent node belongs to a different goal');
    }

    if (parent.level >= MAX_DEPTH) {
      throw new ApiError(
        400,
        ErrorCodes.VALIDATION_ERROR,
        `Maximum roadmap depth (${MAX_DEPTH} levels) reached — cannot add a child to this node`
      );
    }

    level = parent.level + 1;
  }

  // Auto-compute sibling order if not explicitly provided: place after
  // the current last sibling under the same parent
  let computedOrder = order;
  if (computedOrder === undefined) {
    const lastSibling = await RoadmapNode.findOne({ goalId: goal._id, parentId: parentId || null })
      .sort({ order: -1 })
      .select('order');
    computedOrder = lastSibling ? lastSibling.order + 1 : 0;
  }

  const node = await RoadmapNode.create({
    goalId: goal._id,
    parentId: parentId || null,
    level,
    title,
    estimatedMinutes: estimatedMinutes ?? null,
    order: computedOrder,
  });

  // The new node has a parent now — that parent is no longer a leaf
  if (parentId) {
    await RoadmapNode.syncParentActionableStatus(parentId);
  }

  res.status(201).json(new ApiResponse(201, { node }, 'Roadmap node created successfully'));
});

// ---------- GET /goals/:goalId/nodes ----------

export const getRoadmapTree = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  const nodes = await RoadmapNode.find({ goalId: goal._id });
  const tree = buildTree(nodes);

  res.status(200).json(new ApiResponse(200, { tree }, 'Roadmap tree fetched successfully'));
});

// ---------- Shared ownership guard for single-node operations ----------

const getOwnedNodeOrFail = async (nodeId, userId) => {
  const node = await RoadmapNode.findById(nodeId);

  if (!node) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
  }

  // A node has no owner field of its own — ownership is derived through
  // its goal, so this does cost one extra query. Worth it for correctness.
  await getOwnedGoalOrFail(node.goalId, userId);

  return node;
};

// ---------- PATCH /nodes/:nodeId ----------

 // actualMinutesSpent is deliberately excluded from req.body by the
  // validator schema itself (updateNodeSchema has no such field) — this
  // comment flags why, not a runtime check

export const updateNode = asyncHandler(async (req, res) => {
  const node = await getOwnedNodeOrFail(req.params.nodeId, req.user._id);
  const previousStatus = node.status;

  Object.assign(node, req.body);
  await node.save();

  if (req.body.status !== undefined) {
    await syncTaskFromNodeStatus(node, previousStatus);
  }

  res.status(200).json(new ApiResponse(200, { node }, 'Roadmap node updated successfully'));
});

// ---------- DELETE /nodes/:nodeId ----------

export const deleteNode = asyncHandler(async (req, res) => {
  await getOwnedNodeOrFail(req.params.nodeId, req.user._id);

  const result = await RoadmapNode.cascadeDelete(req.params.nodeId);

  // Orphan any notes that were linked to the deleted nodes — null out
  // nodeId, goalId is left untouched, per our "safe data" decision
  await Note.updateMany(
    { nodeId: { $in: result.deletedIds } },
    { $set: { nodeId: null } }
  );

  await File.updateMany(
    { nodeId: { $in: result.deletedIds } },
    { $set: { nodeId: null } }
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { deletedCount: result.deletedCount },
        'Node and all sub-nodes deleted successfully'
      )
    );
});