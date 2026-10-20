import Conversation from '../models/Conversation.model.js';
import Note from '../models/Note.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ErrorCodes from '../utils/errorCodes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { generateCompletion } from '../services/aiProvider.service.js';
import { resolveContext } from '../services/aiContext.service.js';
import { buildSystemPrompt } from '../services/promptTemplates.js';
import { enforceAiRateLimit } from '../services/rateLimit.service.js';

const CHAT_HISTORY_WINDOW = 6; // last N messages sent back to the LLM for continuity

// A whole PDF is a much larger prompt than a note, so give the model longer to answer
const LONG_CONTEXT_TIMEOUT_MS = 90_000;

// ---------- POST /ai/ask ----------

export const askAi = asyncHandler(async (req, res) => {
  const { action, contextType, contextId, contextPage, contextScope, message, conversationId } = req.body;

  // Checked up front so a missing message never leaves an empty conversation behind
  if (action === 'chat' && !message) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'A message is required for chat');
  }

  await enforceAiRateLimit(req.user);

  const { contextText, goalId, nodeId, contextInfo = null, maxContextChars } = await resolveContext(
    contextType,
    contextId,
    req.user._id,
    contextPage,
    contextScope
  );

  const systemPrompt = buildSystemPrompt(action, contextText, {
    maxChars: maxContextChars,
    scope: contextInfo?.scope ?? null,
  });
  const completionOptions = contextInfo?.scope === 'whole' ? { timeoutMs: LONG_CONTEXT_TIMEOUT_MS } : {};

  // ---------- Stateless quick actions ----------
    // ---------- Quick actions (now saved to chat history too) ----------
  if (action !== 'chat') {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message || `Please ${action.replace('_', ' ')} the above.` },
    ];

    const result = await generateCompletion(messages, completionOptions);

    const label = action.replace('_', ' ');
    const userText = message ? `${label}: ${message}` : `Please ${label} this.`;

    let conversation = null;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, owner: req.user._id });
    }
    if (!conversation) {
      conversation = await Conversation.create({
        owner: req.user._id,
        contextType,
        contextId,
        title: userText.slice(0, 60),
      });
    }
    conversation.messages.push({ role: 'user', content: userText });
    conversation.messages.push({ role: 'assistant', content: result });
    await conversation.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          result,
          action,
          conversationId: conversation._id,
          suggestedTitle: `${label} — ${new Date().toLocaleDateString()}`,
          goalId,
          nodeId,
          contextInfo,
        },
        'AI response generated'
      )
    );
  }

  // ---------- Stateful chat ----------
  let conversation;

  if (conversationId) {
    conversation = await Conversation.findOne({ _id: conversationId, owner: req.user._id });
    if (!conversation) {
      throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Conversation not found');
    }
  } else {
    conversation = await Conversation.create({
      owner: req.user._id,
      contextType,
      contextId,
      title: message.slice(0, 60) || 'New conversation',
    });
  }

  const recentHistory = conversation.messages.slice(-CHAT_HISTORY_WINDOW).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [{ role: 'system', content: systemPrompt }, ...recentHistory, { role: 'user', content: message }];

  const result = await generateCompletion(messages, completionOptions);

  conversation.messages.push({ role: 'user', content: message });
  conversation.messages.push({ role: 'assistant', content: result });
  await conversation.save();

  res.status(200).json(
    new ApiResponse(
      200,
      { result, conversationId: conversation._id, goalId, nodeId, contextInfo },
      'AI response generated'
    )
  );
});

// ---------- POST /ai/save-as-note ----------

export const saveAiResultAsNote = asyncHandler(async (req, res) => {
  const { content, contentJSON, title, goalId, nodeId } = req.body;

  const note = await Note.create({
    owner: req.user._id,
    goalId: goalId || null,
    nodeId: nodeId || null,
    title: title || 'AI-generated note',
    contentText: content,
    contentJSON: contentJSON || null,
  });

  res.status(201).json(new ApiResponse(201, { note }, 'Saved as note successfully'));
});

// ---------- GET /ai/conversations ----------

export const getConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ owner: req.user._id })
    .select('title contextType contextId updatedAt')
    .sort({ updatedAt: -1 });

  res.status(200).json(new ApiResponse(200, { conversations }, 'Conversations fetched successfully'));
});

// ---------- GET /ai/conversations/:conversationId ----------

export const getConversationById = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({
    _id: req.params.conversationId,
    owner: req.user._id,
  });

  if (!conversation) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Conversation not found');
  }

  res.status(200).json(new ApiResponse(200, { conversation }, 'Conversation fetched successfully'));
});

// ---------- DELETE /ai/conversations/:conversationId ----------

export const deleteConversation = asyncHandler(async (req, res) => {
  // owner in the filter: other users' conversations simply look like "not found"
  const result = await Conversation.deleteOne({
    _id: req.params.conversationId,
    owner: req.user._id,
  });

  if (result.deletedCount === 0) {
    throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Conversation not found');
  }

  res.status(200).json(new ApiResponse(200, null, 'Conversation deleted'));
});

// ---------- DELETE /ai/conversations ----------

export const deleteAllConversations = asyncHandler(async (req, res) => {
  const result = await Conversation.deleteMany({ owner: req.user._id });

  res
    .status(200)
    .json(new ApiResponse(200, { deleted: result.deletedCount }, 'All conversations deleted'));
});