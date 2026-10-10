
// Converts short duration strings ("15m", "7d", "1h", "30s") into milliseconds.
// Used for computing refresh-token expiry dates and cookie maxAge consistently
// from the same config values (config.jwt.refreshExpiry etc.) that jsonwebtoken
// already understands natively for signing.

const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

const parseDuration = (duration) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());

  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected e.g. "15m", "7d".`);
  }

  const [, value, unit] = match;
  return Number(value) * UNIT_MS[unit];
};

export default parseDuration;