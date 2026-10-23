// Personalised study-time estimation. PURE functions only: no database, no
// network, no clock. Everything is deterministic and unit-tested
// (see server/tests/estimation.test.js).
//
// Pipeline for every topic:
//   1. the AI supplies baseMinutes (an average beginner), kind and priority
//   2. adjustMinutes()  scales it by the learner's level  -> "comfortable" time
//   3. squeezeToFit()   shrinks it to fit the deadline    -> "fitted" time
// No step ever removes a topic: the floor is always MIN_TOPIC_MINUTES.

import {
  LEVELS,
  DEFAULT_LEVEL,
  KINDS,
  DEFAULT_KIND,
  PRIORITIES,
  DEFAULT_PRIORITY,
  LEVEL_MULTIPLIERS,
  ROUND_TO_MINUTES,
  MIN_TOPIC_MINUTES,
  DEFAULT_BASE_MINUTES,
  MAX_BASE_MINUTES,
  MAX_TOPIC_MINUTES,
  BUFFER_RATIO,
  SQUEEZE_FLOOR_RATIO,
  SQUEEZE_WEIGHTS,
  MIN_EFFICIENCY_RATIO,
  MAX_EFFICIENCY_RATIO,
  DEFAULT_MAX_DAILY_MINUTES,
} from '../config/estimation.config.js';

// ---------- Small helpers ----------

const EPSILON = 1e-9;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const roundTo = (n, step = ROUND_TO_MINUTES) => Math.round(n / step) * step;
const ceilTo = (n, step = ROUND_TO_MINUTES) => Math.ceil(n / step - EPSILON) * step;
const sum = (list) => list.reduce((total, n) => total + n, 0);

const pickLevel = (level) => (LEVELS.includes(level) ? level : DEFAULT_LEVEL);
const pickKind = (kind) => (KINDS.includes(kind) ? kind : DEFAULT_KIND);
const pickPriority = (priority) => (PRIORITIES.includes(priority) ? priority : DEFAULT_PRIORITY);

const isPositiveNumber = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;

// ---------- Step 1: clean the AI's number ----------

// Takes the first usable candidate (so an older `estimatedMinutes` still works
// when `baseMinutes` is missing), rounds it and keeps it in a sane range.
export const normalizeBaseMinutes = (...candidates) => {
  for (const candidate of candidates) {
    if (isPositiveNumber(candidate)) {
      return clamp(roundTo(Number(candidate)), MIN_TOPIC_MINUTES, MAX_BASE_MINUTES);
    }
  }
  return DEFAULT_BASE_MINUTES;
};

// ---------- Step 2: level adjustment ----------

export const adjustMinutes = ({ baseMinutes, kind, level } = {}) => {
  const base = normalizeBaseMinutes(baseMinutes);
  const multiplier = LEVEL_MULTIPLIERS[pickLevel(level)][pickKind(kind)];
  return clamp(roundTo(base * multiplier), MIN_TOPIC_MINUTES, MAX_TOPIC_MINUTES);
};

// What the AI generation endpoints return per topic: the personalised time
// plus the raw material needed to re-personalise later without another AI call.
export const personalizeTopic = ({ title, baseMinutes, kind, priority }, level = DEFAULT_LEVEL) => {
  const resolvedLevel = pickLevel(level);
  const resolvedKind = pickKind(kind);

  return {
    title,
    estimatedMinutes: adjustMinutes({ baseMinutes, kind: resolvedKind, level: resolvedLevel }),
    baseMinutes: normalizeBaseMinutes(baseMinutes),
    kind: resolvedKind,
    priority: pickPriority(priority),
    level: resolvedLevel,
  };
};

// ---------- Capacity ----------

// How much study time the learner really has between now and the deadline.
export const computeCapacity = ({
  daysLeft,
  dailyMinutes,
  efficiencyRatio = 1,
  restDaysPerWeek = 0,
  bufferRatio = BUFFER_RATIO,
} = {}) => {
  const days = Math.max(1, Math.floor(Number(daysLeft)) || 1);
  const daily = Math.max(0, Number(dailyMinutes) || 0);
  const efficiency = clamp(Number(efficiencyRatio) || 1, MIN_EFFICIENCY_RATIO, MAX_EFFICIENCY_RATIO);
  const restDays = clamp(Math.floor(Number(restDaysPerWeek)) || 0, 0, 6);
  const buffer = Number.isFinite(Number(bufferRatio)) ? clamp(Number(bufferRatio), 0, 0.5) : BUFFER_RATIO;

  const studyDays = (days * (7 - restDays)) / 7;
  const effectiveDailyMinutes = daily * efficiency * (1 - buffer);

  return {
    days,
    restDays,
    studyDays,
    efficiency,
    bufferRatio: buffer,
    effectiveDailyMinutes,
    availableMinutes: Math.floor(studyDays * effectiveDailyMinutes + EPSILON),
  };
};

// Daily minutes the learner would need to set to finish `totalMinutes` in time
const requiredDailyFor = (capacity, totalMinutes) =>
  totalMinutes <= 0
    ? 0
    : Math.ceil(totalMinutes / (capacity.studyDays * capacity.efficiency * (1 - capacity.bufferRatio)) - EPSILON);

// Extra calendar days needed at the learner's CURRENT daily time (null = cannot ever finish)
const extraDaysFor = (capacity, totalMinutes) => {
  if (totalMinutes <= 0) return 0;
  if (capacity.effectiveDailyMinutes <= 0) return null;
  const neededStudyDays = totalMinutes / capacity.effectiveDailyMinutes;
  const neededCalendarDays = Math.ceil((neededStudyDays * 7) / (7 - capacity.restDays) - EPSILON);
  return Math.max(0, neededCalendarDays - capacity.days);
};

// ---------- Step 3: deadline squeeze ----------

// items: [{ minutes, priority, locked }]  ->  shrinks time, never drops an item.
//  - a topic never goes below max(MIN_TOPIC_MINUTES, half its time)
//  - core topics give up the least, optional topics the most
//  - locked topics (typed in by the learner) are never touched
//  - if even the floors do not fit, returns the floors with fits: false
export const squeezeToFit = (items, availableMinutes) => {
  const minutes = items.map((item) => Math.max(0, Number(item.minutes) || 0));
  const available = Math.max(0, Math.floor(Number(availableMinutes) || 0));

  const weights = items.map((item) =>
    item.locked ? 0 : SQUEEZE_WEIGHTS[item.priority] ?? SQUEEZE_WEIGHTS[DEFAULT_PRIORITY]
  );
  const floors = minutes.map((m, i) =>
    items[i].locked ? m : Math.min(m, Math.max(MIN_TOPIC_MINUTES, ceilTo(m * SQUEEZE_FLOOR_RATIO)))
  );

  const totalBefore = sum(minutes);
  const totalAtFloor = sum(floors);

  const finish = (final) => {
    const totalAfter = sum(final);
    return {
      minutes: final,
      compressed: final.map((m, i) => m < minutes[i]),
      totalBefore,
      totalAfter,
      totalAtFloor,
      fits: totalAfter <= available,
      shortfallMinutes: Math.max(0, totalAfter - available),
    };
  };

  if (totalBefore <= available) return finish(minutes);
  if (totalAtFloor >= available) return finish(floors);

  // Find the smallest squeeze strength where everything fits. The total only
  // goes down as the strength rises, so bisection converges.
  const valuesAt = (lambda) => minutes.map((m, i) => Math.max(floors[i], m * (1 - lambda * weights[i])));
  const smallestWeight = Math.min(...Object.values(SQUEEZE_WEIGHTS));

  let low = 0;
  let high = 1 / smallestWeight; // here every squeezable topic sits at its floor
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (sum(valuesAt(mid)) <= available) high = mid;
    else low = mid;
  }

  const final = valuesAt(high).map((value, i) =>
    items[i].locked ? minutes[i] : clamp(roundTo(value), floors[i], minutes[i])
  );

  // Rounding can overshoot by a few minutes: shave from the most squeezable topics first
  let total = sum(final);
  let guard = items.length * 200;
  while (total > available && guard-- > 0) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < final.length; i++) {
      const room = final[i] - floors[i];
      if (items[i].locked || room <= 0) continue;
      const score = weights[i] * 1e6 + room;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best === -1) break;
    const cut = Math.min(ROUND_TO_MINUTES, final[best] - floors[best]);
    final[best] -= cut;
    total -= cut;
  }

  // ...or undershoot: give the minutes back to core topics first
  guard = items.length * 200;
  while (guard-- > 0) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < final.length; i++) {
      const gap = minutes[i] - final[i];
      if (items[i].locked || gap <= 0) continue;
      if (total + Math.min(ROUND_TO_MINUTES, gap) > available) continue;
      const score = (10 - weights[i]) * 1e6 + gap;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best === -1) break;
    const add = Math.min(ROUND_TO_MINUTES, minutes[best] - final[best]);
    final[best] += add;
    total += add;
  }

  return finish(final);
};

// ---------- The planner ----------

// topics: [{ baseMinutes, kind, priority, level, lockedMinutes }]
// constraints (optional, null when the goal has no deadline):
//   { daysLeft, dailyMinutes, efficiencyRatio, restDaysPerWeek, bufferRatio,
//     existingRemainingMinutes, maxDailyMinutes }
export const planTopics = ({ topics, defaultLevel = DEFAULT_LEVEL, constraints = null } = {}) => {
  const resolved = (topics ?? []).map((topic) => {
    const locked = isPositiveNumber(topic.lockedMinutes);
    const baseMinutes = normalizeBaseMinutes(topic.baseMinutes);
    const kind = pickKind(topic.kind);
    const level = pickLevel(topic.level ?? defaultLevel);

    return {
      level,
      kind,
      priority: pickPriority(topic.priority),
      baseMinutes,
      locked,
      comfortableMinutes: locked
        ? Math.round(Number(topic.lockedMinutes))
        : adjustMinutes({ baseMinutes, kind, level }),
    };
  });

  const comfortableTotal = sum(resolved.map((t) => t.comfortableMinutes));

  // No deadline: nothing to fit against
  if (!constraints) {
    return {
      topics: resolved.map((t) => ({ ...t, fittedMinutes: t.comfortableMinutes, compressed: false })),
      summary: {
        hasDeadline: false,
        comfortable: { totalMinutes: comfortableTotal },
        fitted: { totalMinutes: comfortableTotal, fits: true, compressedCount: 0 },
      },
    };
  }

  const capacity = computeCapacity(constraints);
  const existing = Math.max(0, Number(constraints.existingRemainingMinutes) || 0);
  const maxDaily = Number(constraints.maxDailyMinutes) > 0 ? Number(constraints.maxDailyMinutes) : DEFAULT_MAX_DAILY_MINUTES;
  const availableForNew = Math.max(0, capacity.availableMinutes - existing);

  const squeeze = squeezeToFit(
    resolved.map((t) => ({ minutes: t.comfortableMinutes, priority: t.priority, locked: t.locked })),
    availableForNew
  );

  const comfortableDaily = requiredDailyFor(capacity, existing + comfortableTotal);
  const minimumDaily = requiredDailyFor(capacity, existing + squeeze.totalAtFloor);

  return {
    topics: resolved.map((t, i) => ({
      ...t,
      fittedMinutes: squeeze.minutes[i],
      compressed: squeeze.compressed[i],
    })),
    summary: {
      hasDeadline: true,
      capacity: {
        daysLeft: capacity.days,
        restDaysPerWeek: capacity.restDays,
        bufferRatio: capacity.bufferRatio,
        effectiveDailyMinutes: Math.round(capacity.effectiveDailyMinutes),
        availableMinutes: capacity.availableMinutes,
        availableForNewMinutes: availableForNew,
        existingRemainingMinutes: existing,
        maxDailyMinutes: maxDaily,
      },
      comfortable: {
        totalMinutes: comfortableTotal,
        fits: comfortableTotal <= availableForNew,
        requiredDailyMinutes: comfortableDaily,
        exceedsMaxDaily: comfortableDaily > maxDaily,
        extraDaysNeeded: extraDaysFor(capacity, existing + comfortableTotal),
      },
      fitted: {
        totalMinutes: squeeze.totalAfter,
        fits: squeeze.fits,
        compressedCount: squeeze.compressed.filter(Boolean).length,
        minimumNeededMinutes: squeeze.totalAtFloor,
        shortfallMinutes: squeeze.shortfallMinutes,
        requiredDailyAtMinimumMinutes: minimumDaily,
        exceedsMaxDailyAtMinimum: minimumDaily > maxDaily,
        extraDaysNeededAtMinimum: extraDaysFor(capacity, existing + squeeze.totalAtFloor),
      },
    },
  };
};

// Same planner, for the nested subject -> chapter -> subtopic shape the
// roadmap screens use. Level resolves topic > chapter > subject > default.
export const planRoadmap = ({ subjects, defaultLevel = DEFAULT_LEVEL, constraints = null } = {}) => {
  const flat = [];
  subjects.forEach((subject) =>
    subject.chapters.forEach((chapter) =>
      chapter.subtopics.forEach((subtopic) =>
        flat.push({ ...subtopic, level: subtopic.level ?? chapter.level ?? subject.level ?? defaultLevel })
      )
    )
  );

  const plan = planTopics({ topics: flat, defaultLevel, constraints });

  let cursor = 0;
  const outSubjects = subjects.map((subject) => {
    const chapters = subject.chapters.map((chapter) => {
      const subtopics = chapter.subtopics.map((subtopic) => ({
        title: subtopic.title,
        ...plan.topics[cursor++],
      }));
      return {
        title: chapter.title,
        comfortableMinutes: sum(subtopics.map((s) => s.comfortableMinutes)),
        fittedMinutes: sum(subtopics.map((s) => s.fittedMinutes)),
        subtopics,
      };
    });

    return {
      title: subject.title,
      comfortableMinutes: sum(chapters.map((c) => c.comfortableMinutes)),
      fittedMinutes: sum(chapters.map((c) => c.fittedMinutes)),
      chapters,
    };
  });

  return { subjects: outSubjects, summary: plan.summary };
};