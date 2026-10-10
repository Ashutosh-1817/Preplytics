

import Note from '../models/Note.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import File from '../models/File.model.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { getOwnedGoalOrFail } from '../controllers/goal.controller.js';

const FAILURE_MESSAGES = {
  DELIVERY_BLOCKED:
    'Storage is blocking PDF delivery, so this file could not be read. Enable "Allow delivery of PDF and ZIP files" in Cloudinary, then retry from the Files page.',
  NO_TEXT: 'This PDF has no selectable text (it looks like a scan), so the AI cannot read it.',
  PASSWORD_PROTECTED: 'This PDF is password protected, so the AI cannot read it.',
};

// The ONLY source of truth for what the AI sees. Content is always
// re-read from the database after an ownership check, never from the client.
export const resolveContext = async (contextType, contextId, userId, page = null) => {
  if (!contextType || contextType === 'none') {
    return { contextText: '', goalId: null, nodeId: null };
  }

  if (contextType === 'note') {
    const note = await Note.findOne({ _id: contextId, owner: userId });
    if (!note) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Note not found');

    return { contextText: note.contentText || '', goalId: note.goalId, nodeId: note.nodeId };
  }

  if (contextType === 'node') {
    const node = await RoadmapNode.findById(contextId);
    if (!node) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
    await getOwnedGoalOrFail(node.goalId, userId);

    return { contextText: node.title, goalId: node.goalId, nodeId: node._id };
  }

  if (contextType === 'file') {
    const file = await File.findOne({ _id: contextId, owner: userId }).select('+extractedPages');
    if (!file) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'File not found');

    if (file.fileType !== 'pdf') {
      throw new ApiError(
        400,
        ErrorCodes.INVALID_CONTEXT,
        'The AI can only read text-based PDFs for now. Images and Word files are stored but not readable by the AI yet.'
      );
    }
    if (file.extractionStatus === 'pending') {
      throw new ApiError(400, ErrorCodes.INVALID_CONTEXT, 'This file is still being read. Try again in a few seconds.');
    }
    if (file.extractionStatus !== 'completed') {
      throw new ApiError(
        400,
        ErrorCodes.INVALID_CONTEXT,
        FAILURE_MESSAGES[file.extractionError] || 'This file could not be read. Try again from the Files page.'
      );
    }

    const pages = file.extractedPages || [];
    let contextText;

    if (page) {
      if (page > pages.length) {
        throw new ApiError(
          400,
          ErrorCodes.INVALID_CONTEXT,
          `Page ${page} was not read (only the first ${pages.length} pages were extracted).`
        );
      }
      const text = pages[page - 1];
      contextText = `[Page ${page} of ${file.pageCount}]\n${
        text || '(This page has no selectable text. It may be an image or a scan.)'
      }`;
    } else {
      contextText = pages.map((text, i) => `[Page ${i + 1}]\n${text || '(no selectable text)'}`).join('\n\n');
    }

    return { contextText, goalId: file.goalId, nodeId: file.nodeId };
  }

  throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, `Unknown contextType: ${contextType}`);
};