// Calendar-day helpers that work on "YYYY-MM-DD" keys.
// Date arithmetic is done on pure calendar dates (UTC-based), which is exact
// and independent of any time zone. Only instant -> local-day conversion
// needs a time zone.

const formatters = new Map();

const getFormatter = (tz) => {
  let formatter = formatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(tz, formatter);
  }
  return formatter;
};

export const isValidTimeZone = (tz) => {
  try {
    getFormatter(tz);
    return true;
  } catch {
    return false;
  }
};

// The local calendar day an instant falls on in the given time zone
export const localDateKey = (date, tz) => {
  const parts = getFormatter(tz).formatToParts(new Date(date));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const MS_PER_DAY = 86_400_000;
const keyMs = (key) => Date.parse(`${key}T00:00:00Z`);

export const keyToUtcDate = (key) => new Date(keyMs(key));
export const addDaysToKey = (key, days) => new Date(keyMs(key) + days * MS_PER_DAY).toISOString().slice(0, 10);
export const daysBetweenKeys = (from, to) => Math.round((keyMs(to) - keyMs(from)) / MS_PER_DAY);

export const keysBetween = (from, to) => {
  const keys = [];
  for (let key = from; key <= to; key = addDaysToKey(key, 1)) keys.push(key);
  return keys;
};