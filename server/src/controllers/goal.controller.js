import Goal from '../models/Goal.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import File from '../models/File.model.js';
import cloudinary from '../config/cloudinary.js';
import { resolveCloudinaryResourceType } from '../utils/fileType.js';
import Note from '../models/Note.model.js';

// Shared ownership guard — every goal/node operation needs this, so it's
// centralized here rather than repeated per controller. Returns the goal
// if found and owned, otherwise throws. Deliberately 404 (not 403) when
// the goal exists but belongs to someone else — doesn't confirm to a
// requester whether a given goalId exists at all.
export const getOwnedGoalOrFail = async (goalId, userId) => {
  const goal = await Goal.findById(goalId);

  if (!goal || goal.owner.toString() !== userId.toString()) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Goal not found');
  }

  return goal;
};

// ---------- POST /goals ----------

export const createGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.create({
    ...req.body,
    owner: req.user._id,
  });

  res.status(201).json(new ApiResponse(201, { goal }, 'Goal created successfully'));
});

// ---------- GET /goals ----------

export const getGoals = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const filter = { owner: req.user._id };
  if (status) filter.status = status;

  const goals = await Goal.find(filter).sort({ createdAt: -1 });

  res.status(200).json(new ApiResponse(200, { goals }, 'Goals fetched successfully'));
});

// ---------- GET /goals/:goalId ----------

export const getGoalById = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  res.status(200).json(new ApiResponse(200, { goal }, 'Goal fetched successfully'));
});

// ---------- PATCH /goals/:goalId ----------

export const updateGoal = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  Object.assign(goal, req.body);
  await goal.save();

  res.status(200).json(new ApiResponse(200, { goal }, 'Goal updated successfully'));
});

// ---------- DELETE /goals/:goalId ----------

export const deleteGoal = asyncHandler(async (req, res) => {
  const goal = await getOwnedGoalOrFail(req.params.goalId, req.user._id);

  const deletedNodes = await RoadmapNode.deleteMany({ goalId: goal._id });
  const deletedNotes = await Note.deleteMany({ goalId: goal._id });

  const filesToDelete = await File.find({ goalId: goal._id });

  await Promise.all(
    filesToDelete.map((file) =>
      cloudinary.uploader
        .destroy(file.cloudinaryPublicId, {
          resource_type: resolveCloudinaryResourceType(file.fileType),
        })
        .catch((err) => console.error(`[CLOUDINARY CLEANUP FAILED] ${file.cloudinaryPublicId}`, err.message))
    )
  );

  const deletedFiles = await File.deleteMany({ goalId: goal._id });

  await goal.deleteOne();

  res.status(200).json(
    new ApiResponse(
      200,
      {
        deletedNodeCount: deletedNodes.deletedCount,
        deletedNoteCount: deletedNotes.deletedCount,
      },
      'Goal and all associated data deleted successfully'
    )
  );   
});