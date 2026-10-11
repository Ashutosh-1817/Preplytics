
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';

const TAVILY_URL = 'https://api.tavily.com/search';
const TIMEOUT_MS = 25_000;
const MAX_CONTENT_CHARS = 1200;

export const CREDIT_COST = Object.freeze({ basic: 1, advanced: 2 });

// Tavily's "plan limit exceeded" (432/433). The caller locks search for the month.
export class TavilyQuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TavilyQuotaError';
  }
}

const readDetail = async (response) => {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail?.error === 'string') return detail.error;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).filter(Boolean).join('; ');
  } catch {
    // not JSON
  }
  return '';
};

const hostnameOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const normalizeResults = (results = []) => {
  const seen = new Set();
  const sources = [];

  for (const r of results) {
    // Only real https/http pages with text; no duplicates
    if (!r?.url || !r?.content || !/^https?:\/\//i.test(r.url) || seen.has(r.url)) continue;
    seen.add(r.url);

    sources.push({
      title: String(r.title || hostnameOf(r.url) || 'Untitled').slice(0, 200),
      url: r.url,
      domain: hostnameOf(r.url),
      content: String(r.content).slice(0, MAX_CONTENT_CHARS),
      publishedDate: r.published_date || '',
      score: typeof r.score === 'number' ? r.score : 0,
    });
  }

  return sources;
};

export const tavilySearch = async ({ query, depth, topic, timeRange, maxResults = 6 }) => {
  const body = {
    query,
    search_depth: depth,
    topic,
    max_results: maxResults,
    chunks_per_source: 3,
    include_answer: false, // we write our own cited, goal-aware answer
    include_published_date: true,
    include_usage: true,
    ...(timeRange !== 'any' && { time_range: timeRange }),
  };

  let response;
  try {
    response = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.search.tavilyApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[SEARCH] Could not reach Tavily:', err.message);
    throw new ApiError(503, ErrorCodes.SEARCH_UNAVAILABLE, 'Search is temporarily unavailable. Please try again shortly.');
  }

  if (response.ok) {
    const data = await response.json();
    return {
      sources: normalizeResults(data.results),
      credits: data.usage?.credits ?? CREDIT_COST[depth],
    };
  }

  const detail = await readDetail(response);
  console.error(`[SEARCH] Tavily returned ${response.status}: ${detail}`);

  if (response.status === 432 || response.status === 433) {
    throw new TavilyQuotaError(detail || 'Tavily plan limit exceeded');
  }
  if (response.status === 401) {
    throw new ApiError(503, ErrorCodes.SEARCH_NOT_CONFIGURED, 'Live search is misconfigured: the search API key was rejected.');
  }
  if (response.status === 429) {
    throw new ApiError(429, ErrorCodes.SEARCH_UNAVAILABLE, 'Search is busy right now. Try again in a minute.');
  }
  if (response.status === 400 || response.status === 422) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'The search provider could not process that query. Try rewording it.');
  }

  throw new ApiError(503, ErrorCodes.SEARCH_UNAVAILABLE, 'Search is temporarily unavailable. Please try again shortly.');
};