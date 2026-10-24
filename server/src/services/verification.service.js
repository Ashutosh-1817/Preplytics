// One-time 6-digit codes (email verification and password reset). PURE helpers: the
// controller does the database work. The code itself is never stored, only its hash.

import crypto from 'node:crypto';

export const CODE_TTL_MS = 10 * 60 * 1000; // a code works for 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000; // at most one new code per minute
export const MAX_ATTEMPTS = 5; // wrong guesses before the code is burned

export const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// Salted with the email so the same digits hash differently for every user
export const hashCode = (code, email) =>
  crypto.createHash('sha256').update(`${String(email).toLowerCase()}:${String(code).trim()}`).digest('hex');

export const buildCodeRecord = (email, now = Date.now()) => {
  const code = generateCode();
  return {
    code, // send this by email, never store it
    record: { codeHash: hashCode(code, email), expiresAt: new Date(now + CODE_TTL_MS), attempts: 0, sentAt: new Date(now) },
  };
};

// Seconds the user must still wait before asking for another code (0 = allowed now)
export const cooldownRemaining = (record, now = Date.now()) => {
  if (!record?.sentAt) return 0;
  const left = new Date(record.sentAt).getTime() + RESEND_COOLDOWN_MS - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
};

// reason: ok | missing | expired | locked | wrong
export const checkCode = (record, email, input, now = Date.now()) => {
  if (!record?.codeHash) return { ok: false, reason: 'missing' };
  if (new Date(record.expiresAt).getTime() <= now) return { ok: false, reason: 'expired' };
  if ((record.attempts ?? 0) >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

  const given = Buffer.from(hashCode(input, email));
  const stored = Buffer.from(record.codeHash);
  const match = given.length === stored.length && crypto.timingSafeEqual(given, stored);

  return match
    ? { ok: true, reason: 'ok' }
    : { ok: false, reason: 'wrong', attemptsLeft: Math.max(0, MAX_ATTEMPTS - ((record.attempts ?? 0) + 1)) };
};