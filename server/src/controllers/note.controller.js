import mongoose from 'mongoose';
import Note from '../models/Note.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import File from '../models/File.model.js';

const getOwnedNoteOrFail = async (noteId, userId) => {
  const note = await Note.findOne({ _id: noteId, owner: userId });

  if (!note) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Note not found');
  }

  return note;
};

// ---------- POST /notes ----------

export const createNote = asyncHandler(async (req, res) => {
  const { nodeId, goalId, ...rest } = req.body;

  let resolvedGoalId = goalId;

  // If a nodeId is given, goalId is always derived from it server-side —
  // never trusted from client input, so the two can never disagree.
  if (nodeId) {
    const node = await RoadmapNode.findById(nodeId);

    if (!node) {
      throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
    }

    resolvedGoalId = node.goalId;
  }

  const note = await Note.create({
    ...rest,
    owner: req.user._id,
    goalId: resolvedGoalId,
    nodeId: nodeId || null,
  });

  res.status(201).json(new ApiResponse(201, { note }, 'Note created successfully'));
});

// ---------- GET /notes ----------
// Supports optional ?goalId=, ?nodeId=, ?tag= filtering — all scoped to
// the authenticated user regardless of what's passed in query params

export const getNotes = asyncHandler(async (req, res) => {
  const { goalId, nodeId, tag } = req.query;

  const filter = { owner: req.user._id };
  if (goalId) filter.goalId = goalId;
  if (nodeId) filter.nodeId = nodeId;
  if (tag) filter.tags = tag.trim().toLowerCase();

  const notes = await Note.find(filter).sort({ updatedAt: -1 });

  res.status(200).json(new ApiResponse(200, { notes }, 'Notes fetched successfully'));
});

// ---------- GET /notes/:noteId ----------

export const getNoteById = asyncHandler(async (req, res) => {
  const note = await getOwnedNoteOrFail(req.params.noteId, req.user._id);

  res.status(200).json(new ApiResponse(200, { note }, 'Note fetched successfully'));
});

// ---------- PATCH /notes/:noteId ----------
// The autosave endpoint — expected to be called frequently with partial bodies

export const updateNote = asyncHandler(async (req, res) => {
  const note = await getOwnedNoteOrFail(req.params.noteId, req.user._id);

  if (req.body.baseUpdatedAt) {
    const base = new Date(req.body.baseUpdatedAt).getTime();
    if (note.updatedAt.getTime() > base) {
      throw new ApiError(
        409,
        ErrorCodes.NOTE_CONFLICT,
        'This note was changed somewhere else since you opened it.',
        { updatedAt: note.updatedAt }
      );
    }
  }


  // Re-linking to a different node re-derives goalId the same way
  // creation does — never trust a client-sent goalId alongside nodeId
  if (req.body.nodeId !== undefined) {
    if (req.body.nodeId === null) {
      note.nodeId = null;
      // Deliberately: goalId is left untouched when unlinking a node.
      // The note stays associated with the goal, just no longer with
      // one specific topic within it.
    } else {
      const node = await RoadmapNode.findById(req.body.nodeId);
      if (!node) {
        throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
      }
      note.nodeId = node._id;
      note.goalId = node.goalId;
    }
  }

  const { nodeId, ...rest } = req.body;
  delete rest.baseUpdatedAt;
  Object.assign(note, rest);

  await note.save();

  res.status(200).json(new ApiResponse(200, { note }, 'Note updated successfully'));
});

// ---------- DELETE /notes/:noteId ----------

export const deleteNote = asyncHandler(async (req, res) => {
  const note = await getOwnedNoteOrFail(req.params.noteId, req.user._id);

  await File.updateMany({ noteId: note._id }, { $set: { noteId: null } });
  await note.deleteOne();

  res.status(200).json(new ApiResponse(200, null, 'Note deleted successfully'));
});