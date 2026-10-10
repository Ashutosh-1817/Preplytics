import Goal from '../models/Goal.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import Session from '../models/Session.model.js';

const MIN_SESSION_THRESHOLD = 3;
const MIN_RATIO = 0.33;
const MAX_RATIO = 2.0;

export const recalculateGoalEfficiency = async (goalId) => {
  const sessionCount = await Session.countDocuments({
    goalId,
    durationMinutes: { $ne: null },
  });

  const nodesWithData = await RoadmapNode.find({
    goalId,
    estimatedMinutes: { $ne: null, $gt: 0 },
    actualMinutesSpent: { $gt: 0 },
  }).select('estimatedMinutes actualMinutesSpent');

  let ratio = 1.0;

  if (sessionCount >= MIN_SESSION_THRESHOLD && nodesWithData.length > 0) {
    const totalEstimated = nodesWithData.reduce((sum, n) => sum + n.estimatedMinutes, 0);
    const totalActual = nodesWithData.reduce((sum, n) => sum + n.actualMinutesSpent, 0);

    if (totalActual > 0) {
      const rawRatio = totalEstimated / totalActual;
      ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, rawRatio));
    }
  }

  await Goal.findByIdAndUpdate(goalId, { efficiencyRatio: ratio, sessionCount });

  return ratio;
};

export const getAdjustedDailyMinutes = (goal) => {
  return Math.round(goal.dailyAvailableMinutes * goal.efficiencyRatio);
};



















// import RoadmapNode from '../models/RoadmapNode.model.js';
// import Session from '../models/Session.model.js';

// const MIN_SESSION_THRESHOLD = 3;
// const MIN_RATIO = 0.33; // taking up to 3x longer than estimated
// const MAX_RATIO = 2.0;  // finishing in as little as half the estimated time

// // Recalculates and persists a Goal's efficiencyRatio from scratch, using
// // a simple goal-wide rolling average: total estimated minutes vs. total
// // actual minutes, across only nodes that have both a real estimate and
// // at least some logged time. Called after every session completion.
// export const recalculateGoalEfficiency = async (goalId) => {
//   const sessionCount = await Session.countDocuments({
//     goalId,
//     durationMinutes: { $ne: null },
//   });

//   const nodesWithData = await RoadmapNode.find({
//     goalId,
//     estimatedMinutes: { $ne: null, $gt: 0 },
//     actualMinutesSpent: { $gt: 0 },
//   }).select('estimatedMinutes actualMinutesSpent');

//   let ratio = 1.0;

//   // Below the sample threshold, don't trust the data yet — behave
//   // exactly as if no efficiency adjustment exists at all
//   if (sessionCount >= MIN_SESSION_THRESHOLD && nodesWithData.length > 0) {
//     const totalEstimated = nodesWithData.reduce((sum, n) => sum + n.estimatedMinutes, 0);
//     const totalActual = nodesWithData.reduce((sum, n) => sum + n.actualMinutesSpent, 0);

//     // Zero-division guard — shouldn't be reachable given the query filter
//     // above (actualMinutesSpent: { $gt: 0 }), but defended explicitly
//     // rather than assumed safe
//     if (totalActual > 0) {
//       const rawRatio = totalEstimated / totalActual;
//       ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, rawRatio));
//     }
//   }

//   await require('../models/Goal.model.js').default.findByIdAndUpdate(goalId, {
//     efficiencyRatio: ratio,
//     sessionCount,
//   });

//   return ratio;
// };

// // What Phase 5's scheduler actually consumes — the goal's raw daily
// // budget, scaled by its current efficiency ratio. A ratio below 1.0
// // (slower than estimated) shrinks effective capacity; above 1.0 expands it.
// export const getAdjustedDailyMinutes = (goal) => {
//   return Math.round(goal.dailyAvailableMinutes * goal.efficiencyRatio);
// };