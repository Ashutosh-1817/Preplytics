// Days are UTC dates, like the server stores them.
export const dateKey = (date) => new Date(date).toISOString().slice(0, 10);
export const todayKey = (now = new Date()) => dateKey(now);

// A day is past when it is strictly before today
export const isPastKey = (key, now = new Date()) => key < todayKey(now);

// What to SHOW for a task. A task still open on a past day was not done, so it reads as
// "missed" even if the server has not flipped it yet. Completed stays completed.
export const displayStatus = (task, key, now = new Date()) => {
  if (task.status === 'completed') return 'completed';
  if (isPastKey(key, now)) return 'missed';
  return task.status;
};

export const dayLabel = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });