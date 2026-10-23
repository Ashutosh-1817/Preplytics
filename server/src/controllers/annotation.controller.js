import mongoose from 'mongoose';
import Annotation from '../models/Annotation.model.js';
import File from '../models/File.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';

const MAX_PER_FILE = 3000;

const getOwnedPdfOrFail = async (fileId, userId) => {
  const file = await File.findOne({ _id: fileId, owner: userId });
  if (!file) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'File not found');
  if (file.fileType !== 'pdf') {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Annotations are only available on PDFs');
  }
  return file;
};

const getOwnedAnnotationOrFail = async (id, userId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Annotation not found');
  }
  const annotation = await Annotation.findOne({ _id: id, owner: userId });
  if (!annotation) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Annotation not found');
  return annotation;
};

// ---------- GET /annotations?fileId= ----------
export const getAnnotations = asyncHandler(async (req, res) => {
  await getOwnedPdfOrFail(req.query.fileId, req.user._id);

  const annotations = await Annotation.find({ owner: req.user._id, fileId: req.query.fileId })
    .sort({ page: 1, createdAt: 1 })
    .lean();

  res.status(200).json(new ApiResponse(200, { annotations }, 'Annotations fetched successfully'));
});

// ---------- POST /annotations ----------
export const createAnnotation = asyncHandler(async (req, res) => {
  const { fileId, page, type, color, rects, quote, comment } = req.body;
  const file = await getOwnedPdfOrFail(fileId, req.user._id);

  if (file.pageCount > 0 && page > file.pageCount) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'That page does not exist in this PDF');
  }
  if (type === 'area' && rects.length !== 1) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'An area highlight is a single box');
  }

  const count = await Annotation.countDocuments({ owner: req.user._id, fileId });
  if (count >= MAX_PER_FILE) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'This PDF has reached its annotation limit');
  }

  const annotation = await Annotation.create({
    owner: req.user._id,
    fileId,
    // Always derived from the file, never trusted from the client
    goalId: file.goalId,
    nodeId: file.nodeId,
    page,
    type,
    color,
    rects,
    quote: type === 'area' ? '' : quote,
    comment,
  });

  res.status(201).json(new ApiResponse(201, { annotation }, 'Annotation created successfully'));
});

// ---------- PATCH /annotations/:annotationId ----------
export const updateAnnotation = asyncHandler(async (req, res) => {
  const annotation = await getOwnedAnnotationOrFail(req.params.annotationId, req.user._id);

  if (req.body.color !== undefined) annotation.color = req.body.color;
  if (req.body.comment !== undefined) annotation.comment = req.body.comment;
  await annotation.save();

  res.status(200).json(new ApiResponse(200, { annotation }, 'Annotation updated successfully'));
});

// ---------- DELETE /annotations/:annotationId ----------
export const deleteAnnotation = asyncHandler(async (req, res) => {
  const annotation = await getOwnedAnnotationOrFail(req.params.annotationId, req.user._id);
  await annotation.deleteOne();

  res.status(200).json(new ApiResponse(200, null, 'Annotation deleted successfully'));
});