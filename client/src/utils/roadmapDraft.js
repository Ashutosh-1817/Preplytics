
// Pure logic behind the roadmap review screens (no React, no network), so it can be
// unit-tested with `node --test` from the client folder.
//
// A "draft" is a list of subjects the learner is reviewing:
//   subject: { uid, title, level|null, status?, chapters: [chapter] }
//   chapter: { uid, title, level|null, subtopics: [topic] }
//   topic:   { uid, title, baseMinutes, kind, priority, lockedMinutes? }
//
// Rules this file enforces for the UI:
//   - a level (or a deadline) only changes the TIME of a topic, never whether it exists
//   - a topic leaves the roadmap only when the learner removes it on purpose
//   - a time the learner typed is "locked": it is sent as lockedMinutes and never squeezed

export const DEFAULT_LEVEL = 'heard_of_it';

export const LEVEL_OPTIONS = [
  { id: 'brand_new', label: 'Brand new', hint: 'Never studied it. A little extra time for the concepts.' },
  { id: 'heard_of_it', label: 'Heard of it', hint: 'Some exposure. The standard time for each topic.' },
  { id: 'rusty', label: 'Rusty', hint: 'Studied it before and need a refresh. Noticeably shorter.' },
  { id: 'know_concepts', label: 'Know the concepts', hint: 'You understand it. Mostly practice and recall time.' },
  { id: 'revision', label: 'Revision only', hint: 'Just revising. The shortest time, but every topic stays on your roadmap.' },
];

export const KIND_OPTIONS = [
  { id: 'concept', label: 'Concept' },
  { id: 'practice', label: 'Practice' },
  { id: 'memorize', label: 'Memorize' },
];

export const PRIORITY_OPTIONS = [
  { id: 'core', label: 'Core' },
  { id: 'important', label: 'Important' },
  { id: 'optional', label: 'Optional' },
];

// Must match server/src/config/estimation.config.js
export const LIMITS = Object.freeze({
  subjects: 12,
  chapters: 10,
  subtopics: 12,
  minBaseMinutes: 10,
  maxBaseMinutes: 240,
  maxSavedMinutes: 600,
});

const LEVEL_IDS = LEVEL_OPTIONS.map((l) => l.id);
const KIND_IDS = KIND_OPTIONS.map((k) => k.id);
const PRIORITY_IDS = PRIORITY_OPTIONS.map((p) => p.id);

export const levelLabel = (id) => LEVEL_OPTIONS.find((l) => l.id === id)?.label ?? 'Heard of it';

// ---------- Building draft items ----------

let counter = 0;
export const makeUid = (prefix = 'n') => `${prefix}-${Date.now().toString(36)}-${counter++}`;

const roundTo5 = (n) => Math.round(n / 5) * 5;

export const clampBase = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.min(LIMITS.maxBaseMinutes, Math.max(LIMITS.minBaseMinutes, roundTo5(n)));
};

export const newTopic = (title = 'New topic') => ({
  uid: makeUid('t'),
  title,
  baseMinutes: 60,
  kind: 'concept',
  priority: 'important',
});

// A topic exactly as the AI endpoints return it
export const topicFromAi = (t) => ({
  uid: makeUid('t'),
  title: t.title,
  baseMinutes: clampBase(t.baseMinutes ?? t.estimatedMinutes),
  kind: KIND_IDS.includes(t.kind) ? t.kind : 'concept',
  priority: PRIORITY_IDS.includes(t.priority) ? t.priority : 'important',
});

export const chapterFromAi = (c) => ({
  uid: makeUid('c'),
  title: c.title,
  level: null,
  subtopics: c.subtopics.map(topicFromAi),
});

// ---------- Locked (manually typed) times ----------

// lockedMinutes === null/undefined means "automatic". A number, even 0 while the
// learner is mid-typing, means "the learner set this".
export const isLocked = (topic) => topic.lockedMinutes !== null && topic.lockedMinutes !== undefined;

const validLocked = (topic) => {
  const n = Number(topic.lockedMinutes);
  return isLocked(topic) && Number.isFinite(n) && n > 0 ? Math.min(LIMITS.maxSavedMinutes, Math.round(n)) : 0;
};

// ---------- The estimate request ----------

const textOr = (value, max) => String(value ?? '').trim().slice(0, max) || 'Untitled';

// Turns the draft into the body of POST /ai-syllabus/estimate.
// Empty chapters and subjects (and subjects still loading) are left out, because the
// server wants at least one topic per chapter. Nothing else is ever filtered out.
// `shape` records which draft uids sit at which position of the request, so the
// answer can be matched back to topics by uid, not by index.
export const buildEstimateRequest = (subjects, defaultLevel = DEFAULT_LEVEL, subjectNodeId = null) => {
  const request = {
    subjects: [],
    defaultLevel: LEVEL_IDS.includes(defaultLevel) ? defaultLevel : DEFAULT_LEVEL,
  };
  if (subjectNodeId) request.subjectNodeId = String(subjectNodeId);

  const shape = [];

  for (const subject of subjects) {
    if (subject.status && subject.status !== 'ready') continue;

    const chapters = [];
    const shapeChapters = [];

    for (const chapter of subject.chapters) {
      if (chapter.subtopics.length === 0) continue;

      chapters.push({
        title: textOr(chapter.title, 150),
        ...(LEVEL_IDS.includes(chapter.level) && { level: chapter.level }),
        subtopics: chapter.subtopics.map((t) => ({
          title: textOr(t.title, 150),
          baseMinutes: clampBase(t.baseMinutes),
          kind: KIND_IDS.includes(t.kind) ? t.kind : 'concept',
          priority: PRIORITY_IDS.includes(t.priority) ? t.priority : 'important',
          ...(validLocked(t) && { lockedMinutes: validLocked(t) }),
        })),
      });
      shapeChapters.push({ uid: chapter.uid, topics: chapter.subtopics.map((t) => t.uid) });
    }

    if (chapters.length === 0) continue;

    request.subjects.push({
      title: textOr(subject.title, 100),
      ...(LEVEL_IDS.includes(subject.level) && { level: subject.level }),
      chapters,
    });
    shape.push({ uid: subject.uid, chapters: shapeChapters });
  }

  return { request, shape };
};

// Typing in a title must not trigger a new estimate: titles are left out of the key
export const estimateSignature = (request) => JSON.stringify(request, (key, value) => (key === 'title' ? undefined : value));

// Matches the server's answer back to topics, by uid. Returns null if the answer
// does not line up with what was asked (never guess).
export const indexEstimate = (shape, response) => {
  const subjects = response?.subjects;
  if (!Array.isArray(subjects) || subjects.length !== shape.length || !response.summary) return null;

  const topics = {};

  for (let s = 0; s < shape.length; s += 1) {
    const chapters = subjects[s]?.chapters;
    if (!Array.isArray(chapters) || chapters.length !== shape[s].chapters.length) return null;

    for (let c = 0; c < chapters.length; c += 1) {
      const answered = chapters[c]?.subtopics;
      const asked = shape[s].chapters[c].topics;
      if (!Array.isArray(answered) || answered.length !== asked.length) return null;

      for (let t = 0; t < asked.length; t += 1) {
        const item = answered[t];
        topics[asked[t]] = {
          comfortable: item.comfortableMinutes,
          fitted: item.fittedMinutes,
          compressed: Boolean(item.compressed),
          locked: Boolean(item.locked),
          level: item.level,
          baseMinutes: item.baseMinutes,
          kind: item.kind,
          priority: item.priority,
        };
      }
    }
  }

  return { topics, summary: response.summary };
};

// ---------- Showing and saving times ----------

// mode: 'fit' = shortened to the deadline, 'comfortable' = full personalised time
export const displayMinutes = (topic, indexed, mode = 'fit') => {
  if (isLocked(topic)) return Number(topic.lockedMinutes) || 0;
  const info = indexed?.topics?.[topic.uid];
  if (!info) return topic.baseMinutes;
  return mode === 'comfortable' ? info.comfortable : info.fitted;
};

export const sumMinutes = (topics, indexed, mode = 'fit') =>
  topics.reduce((total, t) => total + (Number(displayMinutes(t, indexed, mode)) || 0), 0);

export const countTopics = (subjects) =>
  subjects.reduce((n, s) => n + s.chapters.reduce((m, c) => m + c.subtopics.length, 0), 0);

// True when something the learner typed cannot be saved yet
export const hasInvalidDraft = (subjects) =>
  subjects.some(
    (s) =>
      !String(s.title ?? '').trim() ||
      s.chapters.some(
        (c) =>
          c.subtopics.length > 0 &&
          (!String(c.title ?? '').trim() ||
            c.subtopics.some((t) => !String(t.title ?? '').trim() || (isLocked(t) && validLocked(t) === 0)))
      )
  );

// The body for the save endpoints. null until a matching estimate is available.
export const buildSavePayload = (subjects, indexed, mode = 'fit') => {
  if (!indexed) return null;
  const payload = [];

  for (const subject of subjects) {
    const chapters = [];

    for (const chapter of subject.chapters) {
      if (chapter.subtopics.length === 0) continue;

      const subtopics = [];
      for (const topic of chapter.subtopics) {
        const info = indexed.topics[topic.uid];
        if (!info) return null;

        const minutes = validLocked(topic) || (mode === 'comfortable' ? info.comfortable : info.fitted);
        subtopics.push({
          title: String(topic.title).trim(),
          estimatedMinutes: Math.min(LIMITS.maxSavedMinutes, Math.max(1, Math.round(minutes))),
          baseMinutes: info.baseMinutes,
          kind: info.kind,
          priority: info.priority,
          level: info.level,
          ...(validLocked(topic) && { locked: true }), // so a later "Change level" leaves this time alone
        });
      }
      chapters.push({ title: String(chapter.title).trim(), subtopics });
    }

    if (chapters.length > 0) payload.push({ title: String(subject.title).trim(), chapters });
  }

  return payload;
};

// ---------- The deadline banner ----------

// Does the learner have a real choice between "fit to deadline" and "full time"?
export const needsFitChoice = (summary) => Boolean(summary?.hasDeadline && !summary.comfortable.fits);

// What the banner should say. kinds:
//   no-deadline | ok | squeezed | short (even the minimum does not fit; still savable)
//   over (full time chosen, does not fit; still savable) | blocked (over the hard daily limit)
// "blocked" uses the same rule the save endpoint uses, so the screen and the server agree.
export const planView = (summary, mode = 'fit') => {
  if (!summary) return null;
  if (!summary.hasDeadline) return { kind: 'no-deadline', totalMinutes: summary.fitted.totalMinutes };

  const cap = summary.capacity;
  const comfortable = summary.comfortable;
  const fitted = summary.fitted;
  const useComfortable = mode === 'comfortable';

  const totalMinutes = useComfortable ? comfortable.totalMinutes : fitted.totalMinutes;
  const requiredDailyMinutes = Math.ceil((cap.existingRemainingMinutes + totalMinutes) / cap.daysLeft);

  const view = {
    totalMinutes,
    comfortableMinutes: comfortable.totalMinutes,
    minimumNeededMinutes: fitted.minimumNeededMinutes,
    availableMinutes: cap.availableForNewMinutes,
    existingMinutes: cap.existingRemainingMinutes,
    days: cap.daysLeft,
    compressedCount: useComfortable ? 0 : fitted.compressedCount,
    requiredDailyMinutes,
    requiredDailyComfortable: comfortable.requiredDailyMinutes,
    requiredDailyAtMinimum: fitted.requiredDailyAtMinimumMinutes,
    extraDaysAtMinimum: fitted.extraDaysNeededAtMinimum,
    maxDailyMinutes: cap.maxDailyMinutes,
  };

  if (requiredDailyMinutes > cap.maxDailyMinutes) {
    return {
      ...view,
      kind: 'blocked',
      hardLimitOverBy: Math.max(0, cap.existingRemainingMinutes + totalMinutes - cap.maxDailyMinutes * cap.daysLeft),
    };
  }
  if (comfortable.fits) return { ...view, kind: 'ok' };
  if (useComfortable) return { ...view, kind: 'over' };
  return { ...view, kind: fitted.fits ? 'squeezed' : 'short' };
};