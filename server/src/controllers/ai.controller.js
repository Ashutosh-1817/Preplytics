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

// ---------- POST /ai/ask ----------

export const askAi = asyncHandler(async (req, res) => {
    const { action, contextType, contextId, contextPage, message, conversationId } = req.body;

  await enforceAiRateLimit(req.user);

  const { contextText, goalId, nodeId } = await resolveContext(contextType, contextId, req.user._id, contextPage);
  const systemPrompt = buildSystemPrompt(action, contextText);

  // ---------- Stateless quick actions ----------
  if (action !== 'chat') {
    const messages = [
      { role: 'system', content: systemPrompt },
      // A quick action can still carry an optional user instruction
      // (e.g. "focus on the second paragraph"), defaulting to a generic
      // trigger phrase if the user didn't type anything
      { role: 'user', content: message || `Please ${action.replace('_', ' ')} the above.` },
    ];

    const result = await generateCompletion(messages);

    // Shaped specifically so the frontend's "Save as Note" button has
    // everything it needs without a second round trip
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          result,
          action,
          suggestedTitle: `${action.replace('_', ' ')} — ${new Date().toLocaleDateString()}`,
          goalId,
          nodeId,
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

  if (!message) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'A message is required for chat');
  }

  const recentHistory = conversation.messages.slice(-CHAT_HISTORY_WINDOW).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [{ role: 'system', content: systemPrompt }, ...recentHistory, { role: 'user', content: message }];

  const result = await generateCompletion(messages);

  conversation.messages.push({ role: 'user', content: message });
  conversation.messages.push({ role: 'assistant', content: result });
  await conversation.save();

  res.status(200).json(
    new ApiResponse(
      200,
      { result, conversationId: conversation._id, goalId, nodeId },
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