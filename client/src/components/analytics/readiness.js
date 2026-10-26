import { formatDuration } from '../../utils/formatDuration.js';

// Preparation score: a transparent blend of five signals, each 0-100.
// If a signal has no data yet it is left out and the remaining weights are re-normalised,
// so a new user is never penalised for data that does not exist.
const WEIGHTS = { progress: 0.30, pace: 0.25, consistency: 0.20, adherence: 0.15, accuracy: 0.10 };

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const fmt = formatDuration;

export function overallCoverage(coverage) {
  if (!coverage?.length) return null;
  const total = coverage.reduce((s, c) => s + c.totalMinutes, 0);
  const done = coverage.reduce((s, c) => s + c.doneMinutes, 0);
  return total > 0 ? { total, done, ratio: done / total } : null;
}

export function computeReadiness(data) {
  const { burndown: b, streak, summary, range, plan, efficiency, coverage } = data;
  const components = [];

  // 1. Progress: how much of the roadmap is done
  const cov = overallCoverage(coverage);
  const progress = b?.available && b.totalMinutes > 0
    ? { ratio: b.completedMinutes / b.totalMinutes, done: b.completedMinutes, total: b.totalMinutes }
    : cov;
  if (progress) {
    components.push({
      key: 'progress', label: 'Syllabus progress', weight: WEIGHTS.progress,
      score: clamp(progress.ratio * 100),
      detail: `${fmt(progress.done)} of ${fmt(progress.total)} done`,
    });
  }

  // 2. Pace: are you finishing work fast enough for the deadline
  if (b?.available) {
    let score;
    let detail;
    if (b.status === 'complete') { score = 100; detail = 'Roadmap complete'; }
    else if (b.status === 'overdue') { score = 10; detail = 'Past the deadline'; }
    else if (b.requiredDailyMinutes > 0) {
      score = clamp((b.velocityPerDay / b.requiredDailyMinutes) * 100);
      detail = `${b.velocityPerDay > 0 ? fmt(b.velocityPerDay) : '0m'}/day vs ${fmt(b.requiredDailyMinutes)}/day needed`;
    } else { score = 90; detail = 'On track'; }
    components.push({ key: 'pace', label: 'Pace to deadline', weight: WEIGHTS.pace, score, detail });
  }

  // 3. Consistency: how many days you show up, with a nudge for a live streak
  if (range?.days > 0 && summary) {
    const active = summary.activeDays / range.days;
    const score = clamp((0.75 * active + 0.25 * Math.min(1, (streak?.current ?? 0) / 7)) * 100);
    components.push({
      key: 'consistency', label: 'Consistency', weight: WEIGHTS.consistency, score,
      detail: `${summary.activeDays} of ${range.days} days · ${streak?.current ?? 0}-day streak`,
    });
  }

  // 4. Plan adherence
  if (plan && plan.adherenceRate !== null && plan.adherenceRate !== undefined) {
    const due = plan.completed + plan.missed + plan.overdue;
    components.push({
      key: 'adherence', label: 'Plan adherence', weight: WEIGHTS.adherence,
      score: clamp(plan.adherenceRate * 100),
      detail: `${plan.completed} of ${due} due tasks done`,
    });
  }

  // 5. Estimate accuracy: finishing faster than estimated is full marks, running slower costs points
  if (efficiency?.ratio) {
    const r = efficiency.ratio;
    components.push({
      key: 'accuracy', label: 'Estimate accuracy', weight: WEIGHTS.accuracy,
      score: r >= 1 ? 100 : clamp(r * 100),
      detail: `${r.toFixed(2)}× your estimates`,
    });
  }

  if (components.length < 2) return { ready: false, components };

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const normalised = components.map((c) => ({ ...c, share: c.weight / totalWeight }));
  const score = Math.round(normalised.reduce((s, c) => s + c.score * c.share, 0));

  const band =
    score >= 80 ? { label: 'Strong', tone: 'good' }
    : score >= 60 ? { label: 'On the right track', tone: 'good' }
    : score >= 40 ? { label: 'Needs focus', tone: 'warn' }
    : { label: 'At risk', tone: 'bad' };

  // The component that costs the most points is the best lever to pull
  const lever = [...normalised].sort((a, b2) => b2.share * (100 - b2.score) - a.share * (100 - a.score))[0];
  return { ready: true, score, band, components: normalised, lever: leverAdvice(lever, data) };
}

function leverAdvice(lever, data) {
  const { burndown: b, summary, range, plan, efficiency } = data;
  const lowest = [...(data.coverage ?? [])].filter((c) => c.totalMinutes > c.doneMinutes).sort((x, y) => x.percent - y.percent)[0];
  switch (lever.key) {
    case 'pace':
      return b?.status === 'overdue'
        ? 'Your deadline has passed. Extend it or trim the roadmap so the plan matches reality.'
        : `Raise your daily study from ${fmt(b?.velocityPerDay ?? 0)} to about ${fmt(b?.requiredDailyMinutes ?? 0)} to finish on time.`;
    case 'progress':
      return lowest
        ? `Start closing the gap in “${lowest.title}”, only ${Math.round(lowest.percent * 100)}% covered so far.`
        : 'Complete a few more roadmap topics this week to move the needle.';
    case 'consistency': {
      const target = Math.min(range.days, Math.max(summary.activeDays + 2, Math.ceil(range.days * 0.6)));
      return `You studied ${summary.activeDays} of the last ${range.days} days. Aim for ${target}: even a 20-minute session keeps the streak alive.`;
    }
    case 'adherence':
      return `${plan.missed + plan.overdue} scheduled tasks slipped. Shorten daily plans or reschedule them so the calendar stays honest.`;
    case 'accuracy':
      return `Your topics take about ${(1 / efficiency.ratio).toFixed(1)}× your estimates. Add buffer time when you plan new topics.`;
    default:
      return 'Keep going. Small, steady sessions compound.';
  }
}
