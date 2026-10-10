// Normalizes any Date to UTC midnight — ensures scheduledDate comparisons
// are always comparing calendar days, never tripped up by time-of-day or
// timezone drift between server and client.
const dateOnly = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const addDays = (date, days) => {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

export default dateOnly;