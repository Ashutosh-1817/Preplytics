// src/config/estimation.config.js
// Every tunable number of the personalised time estimation lives here.
// The engine (services/estimation.service.js) holds no magic numbers.

// How familiar the learner already is with a chapter or subject.
export const LEVELS = Object.freeze(['brand_new', 'heard_of_it', 'rusty', 'know_concepts', 'revision']);
export const DEFAULT_LEVEL = 'heard_of_it'; // multipliers of 1.0: same as the AI's own estimate

// What kind of study effort a topic mostly needs.
export const KINDS = Object.freeze(['concept', 'practice', 'memorize']);
export const DEFAULT_KIND = 'concept';

// How much a topic matters for the goal. Never removes a topic, only
// decides who gives up time first when the deadline is tight.
export const PRIORITIES = Object.freeze(['core', 'important', 'optional']);
export const DEFAULT_PRIORITY = 'important';

// adjustedMinutes = baseMinutes x LEVEL_MULTIPLIERS[level][kind]
// baseMinutes is the time an average beginner needs. "Revision" is mostly
// recall and practice, so concept time shrinks the most and practice the least.
export const LEVEL_MULTIPLIERS = Object.freeze({
  brand_new: Object.freeze({ concept: 1.15, practice: 1.0, memorize: 1.0 }),
  heard_of_it: Object.freeze({ concept: 1.0, practice: 1.0, memorize: 1.0 }),
  rusty: Object.freeze({ concept: 0.6, practice: 0.8, memorize: 0.7 }),
  know_concepts: Object.freeze({ concept: 0.35, practice: 0.8, memorize: 0.5 }),
  revision: Object.freeze({ concept: 0.2, practice: 0.5, memorize: 0.4 }),
});

// Every topic always keeps a visible slot, however well the learner knows it.
export const ROUND_TO_MINUTES = 5;
export const MIN_TOPIC_MINUTES = 10;
export const DEFAULT_BASE_MINUTES = 60; // when the AI gives no usable number
export const MAX_BASE_MINUTES = 240;
export const MAX_TOPIC_MINUTES = 300;

// Deadline fitting
export const BUFFER_RATIO = 0.1; // share of study time kept free for slippage / revision
export const SQUEEZE_FLOOR_RATIO = 0.5; // a topic is never squeezed below half its adjusted time
export const SQUEEZE_WEIGHTS = Object.freeze({ core: 0.5, important: 1, optional: 1.5 }); // higher = squeezed harder

// Same bounds the goal's efficiencyRatio is learned within
export const MIN_EFFICIENCY_RATIO = 0.33;
export const MAX_EFFICIENCY_RATIO = 2.0;

export const DEFAULT_MAX_DAILY_MINUTES = 8 * 60;