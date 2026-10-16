import Note from '../models/Note.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import File from '../models/File.model.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { getOwnedGoalOrFail } from '../controllers/goal.controller.js';

// How much of a PDF a "whole PDF" request may send to the model (about 20k
// tokens, roughly 30 pages of normal text). Raise it if your models allow more;
// lower it if you see context-length errors. Pages are added whole, never cut mid-page.
const WHOLE_PDF_MAX_CHARS = 80_000;

const FAILURE_MESSAGES = {
  DELIVERY_BLOCKED:
    'Storage is blocking PDF delivery, so this file could not be read. Enable "Allow delivery of PDF and ZIP files" in Cloudinary, then retry from the Files page.',
  NO_TEXT: 'This PDF has no selectable text (it looks like a scan), so the AI cannot read it.',
  PASSWORD_PROTECTED: 'This PDF is password protected, so the AI cannot read it.',
};

// The ONLY source of truth for what the AI sees. Content is always
// re-read from the database after an ownership check, never from the client.
//
// scope (PDFs only): 'page'  = just the page in `page`
//                    'whole' = every page, up to WHOLE_PDF_MAX_CHARS
// A PDF with no page given is always read as a whole.
//
// Returns { contextText, goalId, nodeId, contextInfo, maxContextChars? }.
// contextInfo describes what the AI actually received, so the UI can say so.
export const resolveContext = async (contextType, contextId, userId, page = null, scope = null) => {
  if (!contextType || contextType === 'none') {
    return { contextText: '', goalId: null, nodeId: null, contextInfo: null };
  }

  if (contextType === 'note') {
    const note = await Note.findOne({ _id: contextId, owner: userId });
    if (!note) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Note not found');

    return { contextText: note.contentText || '', goalId: note.goalId, nodeId: note.nodeId, contextInfo: null };
  }

  if (contextType === 'node') {
    const node = await RoadmapNode.findById(contextId);
    if (!node) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Roadmap node not found');
    await getOwnedGoalOrFail(node.goalId, userId);

    return { contextText: node.title, goalId: node.goalId, nodeId: node._id, contextInfo: null };
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
    const totalPages = file.pageCount || pages.length;
    const wantsWhole = scope === 'whole' || !page;

    // ---------- Just one page ----------
    if (!wantsWhole) {
      if (page > pages.length) {
        throw new ApiError(
          400,
          ErrorCodes.INVALID_CONTEXT,
          `Page ${page} was not read (only the first ${pages.length} pages were extracted).`
        );
      }
      const text = pages[page - 1];

      return {
        contextText: `[Page ${page} of ${totalPages}]\n${
          text || '(This page has no selectable text. It may be an image or a scan.)'
        }`,
        goalId: file.goalId,
        nodeId: file.nodeId,
        contextInfo: { scope: 'page', page, totalPages, pagesIncluded: 1, truncated: false },
      };
    }

    // ---------- The whole PDF, as many whole pages as fit ----------
    const blocks = [];
    let used = 0;

    for (let i = 0; i < pages.length; i++) {
      const block = `[Page ${i + 1}]\n${pages[i] || '(no selectable text)'}`;

      if (used + block.length > WHOLE_PDF_MAX_CHARS) {
        // Never send nothing: if even the first page is huge, cut that page instead
        if (blocks.length === 0) blocks.push(block.slice(0, WHOLE_PDF_MAX_CHARS));
        break;
      }

      blocks.push(block);
      used += block.length + 2;
    }

    return {
      contextText: blocks.join('\n\n'),
      goalId: file.goalId,
      nodeId: file.nodeId,
      // The prompt builder must not cut this a second time
      maxContextChars: WHOLE_PDF_MAX_CHARS + 500,
      contextInfo: {
        scope: 'whole',
        page: null,
        totalPages,
        pagesIncluded: blocks.length,
        truncated: blocks.length < totalPages,
      },
    };
  }

  throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, `Unknown contextType: ${contextType}`);
};