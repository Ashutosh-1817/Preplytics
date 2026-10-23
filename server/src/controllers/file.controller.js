

import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import cloudinary from '../config/cloudinary.js';
import config from '../config/env.js';
import File from '../models/File.model.js';
import Note from '../models/Note.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import {
  MAX_FILE_BYTES,
  resolveFileType,
  resolveCloudinaryResourceType,
  resolveRawExtension,
} from '../utils/fileType.js';
import { extractPdfFromUrl, ExtractionError } from '../services/pdfExtract.service.js';
import { getOwnedGoalOrFail } from './goal.controller.js';
import Annotation from '../models/Annotation.model.js';

const userFolder = (userId) => `preplytics/${userId}`;
const STALE_PENDING_MS = 90 * 1000;

const getOwnedFileOrFail = async (fileId, userId) => {
  const file = await File.findOne({ _id: fileId, owner: userId });
  if (!file) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'File not found');
  return file;
};

const discardAsset = (publicId, resourceType) =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => {});

// Every link a client sends is verified against the signed-in user.
// Precedence: topic > goal > the note's own links.
const resolveLinks = async ({ goalId, nodeId, noteId }, userId) => {
  const links = { goalId: null, nodeId: null, noteId: null };

  let note = null;
  if (noteId) {
    note = await Note.findOne({ _id: noteId, owner: userId });
    if (!note) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Note not found');
    links.noteId = note._id;
  }

  if (nodeId) {
    const node = await RoadmapNode.findById(nodeId);
    if (!node) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
    await getOwnedGoalOrFail(node.goalId, userId);
    links.nodeId = node._id;
    links.goalId = node.goalId;
  } else if (goalId) {
    const goal = await getOwnedGoalOrFail(goalId, userId);
    links.goalId = goal._id;
  } else if (note) {
    links.goalId = note.goalId;
    links.nodeId = note.nodeId;
  }

  return links;
};

const runExtraction = async (fileId) => {
  try {
    const file = await File.findById(fileId);
    if (!file) return;

    const { pages, pageCount } = await extractPdfFromUrl(file.url);

    await File.findByIdAndUpdate(fileId, {
      extractedPages: pages,
      pageCount,
      extractionStatus: 'completed',
      extractionError: '',
    });
  } catch (err) {
    const known = err instanceof ExtractionError;
    const code = known ? err.code : 'PARSE_FAILED';
    console.error(`[PDF EXTRACTION FAILED] fileId=${fileId} code=${code}: ${err.message}`);

    await File.findByIdAndUpdate(fileId, {
      extractedPages: [],
      pageCount: known ? (err.meta?.pageCount ?? 0) : 0,
      extractionStatus: 'failed',
      extractionError: code,
    }).catch(() => {});
  }
};

// ---------- POST /files/signature ----------
// The server chooses the storage name, so the browser can only upload
// to the exact public id this signature authorizes.

export const getUploadSignature = asyncHandler(async (req, res) => {
  const { mimeType } = req.body;

  const fileType = resolveFileType(mimeType);
  if (!fileType) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, `Unsupported file type: ${mimeType}`);
  }

  const resourceType = resolveCloudinaryResourceType(fileType);
  const extension = resourceType === 'raw' ? resolveRawExtension(mimeType) : '';
  const publicId = `${userFolder(req.user._id)}/${crypto.randomUUID()}${extension}`;
  const timestamp = Math.round(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, timestamp },
    config.cloudinary.apiSecret
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        signature,
        timestamp,
        publicId,
        apiKey: config.cloudinary.apiKey,
        cloudName: config.cloudinary.cloudName,
        resourceType,
      },
      'Upload signature generated'
    )
  );
});

// ---------- POST /files/confirm ----------

export const confirmUpload = asyncHandler(async (req, res) => {
  const { cloudinaryPublicId, fileName, mimeType, goalId, nodeId, noteId } = req.body;

  if (!cloudinaryPublicId.startsWith(`${userFolder(req.user._id)}/`)) {
    throw new ApiError(403, ErrorCodes.UNAUTHORIZED, 'This file does not belong to you');
  }

  // Confirming the same upload twice just returns the existing record
  const existing = await File.findOne({ cloudinaryPublicId });
  if (existing) {
    return res.status(200).json(new ApiResponse(200, { file: existing }, 'File already registered'));
  }

  const fileType = resolveFileType(mimeType);
  if (!fileType) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, `Unsupported file type: ${mimeType}`);
  }
  const resourceType = resolveCloudinaryResourceType(fileType);

  let links;
  try {
    links = await resolveLinks({ goalId, nodeId, noteId }, req.user._id);
  } catch (err) {
    await discardAsset(cloudinaryPublicId, resourceType);
    throw err;
  }

  let resource;
  try {
    resource = await cloudinary.api.resource(cloudinaryPublicId, { resource_type: resourceType });
  } catch {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Uploaded file not found on storage provider');
  }

  // The client's declared size is never trusted; this is the real one
  if (resource.bytes > MAX_FILE_BYTES) {
    await discardAsset(cloudinaryPublicId, resourceType);
    throw new ApiError(400, ErrorCodes.FILE_TOO_LARGE, 'File size cannot exceed 10MB');
  }

  let file;
  try {
    file = await File.create({
      owner: req.user._id,
      ...links,
      fileName,
      fileType,
      mimeType,
      fileSize: resource.bytes,
      cloudinaryPublicId,
      url: resource.secure_url,
      extractionStatus: fileType === 'pdf' ? 'pending' : 'not_applicable',
    });
  } catch (err) {
    if (err.code === 11000) {
      const duplicate = await File.findOne({ cloudinaryPublicId });
      return res.status(200).json(new ApiResponse(200, { file: duplicate }, 'File already registered'));
    }
    throw err;
  }

  res.status(201).json(new ApiResponse(201, { file }, 'File uploaded successfully'));

  // After the response, so the upload never waits on PDF parsing
  if (fileType === 'pdf') runExtraction(file._id);
});

// ---------- GET /files ----------

export const getFiles = asyncHandler(async (req, res) => {
  const { goalId, nodeId, noteId, type } = req.query;

  const filter = { owner: req.user._id };
  if (goalId) filter.goalId = goalId;
  if (nodeId) filter.nodeId = nodeId;
  if (noteId) filter.noteId = noteId;
  if (['pdf', 'image', 'document'].includes(type)) filter.fileType = type;

  const files = await File.find(filter).sort({ createdAt: -1 });

  res.status(200).json(new ApiResponse(200, { files }, 'Files fetched successfully'));
});

// ---------- GET /files/:fileId ----------

export const getFileById = asyncHandler(async (req, res) => {
  const file = await getOwnedFileOrFail(req.params.fileId, req.user._id);
  res.status(200).json(new ApiResponse(200, { file }, 'File fetched successfully'));
});

// ---------- GET /files/:fileId/content ----------
// Streams the bytes through the API so only the owner can read a file.
// There is no public link, and the browser needs no storage CORS rules.

export const streamFileContent = asyncHandler(async (req, res) => {
  const file = await getOwnedFileOrFail(req.params.fileId, req.user._id);

  let upstream;
  try {
    upstream = await fetch(file.url, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ApiError(502, ErrorCodes.STORAGE_UNAVAILABLE, 'Could not reach file storage. Please try again.');
  }

  if (upstream.status === 401 || upstream.status === 403) {
    throw new ApiError(
      502,
      ErrorCodes.STORAGE_DELIVERY_BLOCKED,
      'Cloudinary is blocking delivery of this PDF. Turn on "Allow delivery of PDF and ZIP files" in Cloudinary Settings → Security, then try again.'
    );
  }
  if (!upstream.ok || !upstream.body) {
    throw new ApiError(502, ErrorCodes.STORAGE_UNAVAILABLE, 'Could not retrieve this file from storage.');
  }

  const asciiName = file.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  const length = upstream.headers.get('content-length');

  res.setHeader('Content-Type', file.mimeType);
  if (length) res.setHeader('Content-Length', length);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
  );
  res.setHeader('Cache-Control', 'private, max-age=300');

  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    // The client navigated away mid-download; nothing to clean up
  }
});

// ---------- POST /files/:fileId/reextract ----------

export const reextractFile = asyncHandler(async (req, res) => {
  const file = await getOwnedFileOrFail(req.params.fileId, req.user._id);

  if (file.fileType !== 'pdf') {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Only PDF files can be read by the AI.');
  }

  const freshPending =
    file.extractionStatus === 'pending' && Date.now() - file.updatedAt.getTime() < STALE_PENDING_MS;

  if (!freshPending) {
    file.extractionStatus = 'pending';
    file.extractionError = '';
    await file.save();
    runExtraction(file._id);
  }

  res.status(202).json(new ApiResponse(202, { file }, 'Reading started'));
});

// ---------- DELETE /files/:fileId ----------

export const deleteFile = asyncHandler(async (req, res) => {
  const file = await getOwnedFileOrFail(req.params.fileId, req.user._id);

  try {
    await cloudinary.uploader.destroy(file.cloudinaryPublicId, {
      resource_type: resolveCloudinaryResourceType(file.fileType),
    });
  } catch (err) {
    // Don't strand the database record because storage cleanup hiccuped
    console.error(`[CLOUDINARY CLEANUP FAILED] ${file.cloudinaryPublicId}`, err.message);
  }

  await Annotation.deleteMany({ owner: req.user._id, fileId: file._id });

  await file.deleteOne();

  res.status(200).json(new ApiResponse(200, null, 'File deleted successfully'));
});