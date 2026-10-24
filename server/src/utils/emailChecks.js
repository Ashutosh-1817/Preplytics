// Is this address plausibly REAL? Free checks only, no third-party service:
//   1. the domain is not on a throwaway / placeholder list (demo.com, mailinator.com, ...)
//   2. the domain actually publishes mail servers (a DNS MX lookup)
// A DNS lookup that merely fails to answer (offline, timeout) is NOT treated as "fake",
// so a network hiccup never blocks a real person from signing up.

import dns from 'node:dns/promises';

// Placeholder domains people type to "test" a form, plus common disposable-mail services
export const BLOCKED_DOMAINS = new Set([
  'demo.com', 'test.com', 'example.com', 'example.org', 'example.net', 'domain.com', 'email.com',
  'abc.com', 'xyz.com', 'asdf.com', 'fake.com', 'nomail.com', 'noemail.com', 'invalid.com',
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com',
  'getnada.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mintemail.com',
]);

export const domainOf = (email) => String(email).trim().toLowerCase().split('@')[1] || '';

// Errors that mean "this domain has no mail servers", as opposed to "we could not ask"
const NO_MAIL_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ENOENT']);

// resolveMx is injectable so tests never touch the network
export const assessEmailDomain = async (email, resolveMx = dns.resolveMx) => {
  const domain = domainOf(email);

  if (!domain || !domain.includes('.')) {
    return { ok: false, reason: 'invalid', message: 'Please enter a valid email address.' };
  }

  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      ok: false,
      reason: 'blocked',
      message: 'Please use your real email address. Test and temporary addresses are not accepted.',
    };
  }

  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      return { ok: false, reason: 'no_mail_server', message: `${domain} can't receive email. Please check the address.` };
    }
    return { ok: true };
  } catch (err) {
    if (NO_MAIL_CODES.has(err.code)) {
      return { ok: false, reason: 'no_mail_server', message: `${domain} can't receive email. Please check the address.` };
    }
    return { ok: true, unchecked: true }; // timeout / offline: do not punish the user
  }
};