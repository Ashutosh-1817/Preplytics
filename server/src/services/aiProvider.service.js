// src/services/aiProvider.service.js
// FULL FILE: replace everything currently in this file with this.

import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { stripReasoningArtifacts } from '../utils/aiTextSanitizer.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`;

// Notes, quizzes and tables need real room, and reasoning models spend
// part of this budget thinking before they answer.
const DEFAULT_MAX_TOKENS = 4096;

// Structured JSON calls (syllabus) are small and should fail fast;
// chat answers can legitimately take longer to generate.
const timeoutFor = (options) => options.timeoutMs ?? (options.json ? 20_000 : 40_000);

const TOKEN_LIMIT_ERROR = /max[_ ]?tokens|context (?:length|window)|too many tokens|maximum context/i;

const fetchWithTimeout = async (url, init, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

// Both providers return { text, truncated } so the caller can tell
// when a reply was cut off by the token limit.

const callOpenRouter = async (model, messages, options) => {
  const { temperature = 0.7, maxTokens = DEFAULT_MAX_TOKENS } = options;

  const response = await fetchWithTimeout(
    OPENROUTER_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.openrouterApiKey}`,
        'HTTP-Referer': config.clientUrl,
        'X-Title': 'Preplytics',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    },
    timeoutFor(options)
  );

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`OpenRouter (${model}) failed: ${response.status} ${errorBody}`);
    err.statusCode = response.status;
    // A 400 about token/context limits is this model's ceiling, not a bug
    // in our request, so the next tier should get a chance.
    err.retryable = response.status === 400 && TOKEN_LIMIT_ERROR.test(errorBody);
    throw err;
  }

  const data = await response.json();

  // OpenRouter can answer 200 with an error object when the upstream provider fails
  if (data.error) {
    const err = new Error(`OpenRouter (${model}) error: ${data.error.message || 'unknown'}`);
    err.statusCode = Number(data.error.code) || 502;
    throw err;
  }

  if (config.nodeEnv === 'development') {
    console.info(`[AI] OpenRouter answered with model: ${data.model || model}`);
  }

  const choice = data.choices?.[0];
  return { text: choice?.message?.content ?? '', truncated: choice?.finish_reason === 'length' };
};

const callGemini = async (messages, options) => {
  const { temperature = 0.7, maxTokens = DEFAULT_MAX_TOKENS, json = false } = options;

  const systemMessage = messages.find((m) => m.role === 'system');
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const contents = conversationMessages.map((m, i) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: i === 0 && systemMessage ? `${systemMessage.content}\n\n${m.content}` : m.content }],
  }));

  const response = await fetchWithTimeout(
    GEMINI_URL(config.ai.geminiModel),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          ...(json && { responseMimeType: 'application/json' }),
        },
      }),
    },
    timeoutFor(options)
  );

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`Gemini failed: ${response.status} ${errorBody}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');

  if (!text) {
    const err = new Error('Gemini returned an empty or blocked response');
    err.statusCode = 500;
    throw err;
  }

  return { text, truncated: candidate?.finishReason === 'MAX_TOKENS' };
};

const isRetryable = (err) =>
  err.retryable === true ||
  !err.statusCode ||
  err.statusCode === 404 ||
  err.statusCode === 429 ||
  err.statusCode >= 500;

export const generateCompletion = async (messages, options = {}) => {
  const attempts = [
    { label: 'OpenRouter primary', fn: () => callOpenRouter(config.ai.openrouterPrimaryModel, messages, options) },
    { label: 'OpenRouter fallback', fn: () => callOpenRouter(config.ai.openrouterFallbackModel, messages, options) },
    { label: 'Gemini', fn: () => callGemini(messages, options) },
  ];

  let lastErr;

  for (const attempt of attempts) {
    try {
      const { text, truncated } = await attempt.fn();

      let cleaned = stripReasoningArtifacts(text);

      // A model that only emitted reasoning or a safety label has not
      // answered. Count it as a failed tier and try the next one.
      if (!cleaned) {
        const err = new Error('Model returned no usable text after cleanup');
        err.statusCode = 502;
        throw err;
      }

      if (truncated && !options.json) {
        cleaned += '\n\n*The reply was cut off. Ask me to continue.*';
      }

      return cleaned;
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err)) {
        console.error(`[AI] ${attempt.label} failed (not retryable):`, err.message);
        throw new ApiError(502, ErrorCodes.INTERNAL_SERVER_ERROR, 'AI request failed');
      }

      console.warn(`[AI] ${attempt.label} unavailable, trying next tier:`, err.message);
    }
  }

  console.error('[AI] All providers failed:', lastErr?.message);
  throw new ApiError(
    503,
    ErrorCodes.INTERNAL_SERVER_ERROR,
    'AI service is temporarily unavailable. Please try again shortly.'
  );
};