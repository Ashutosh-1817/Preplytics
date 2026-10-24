// Verifies the ID token that Google's "Continue with Google" button hands to the browser.
// Google signs it; we check the signature, the audience (our client ID) and the expiry.
// Wrapped in an object so tests can replace `googleAuth.verify` without calling Google.

import { OAuth2Client } from 'google-auth-library';
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import ErrorCodes from '../utils/errorCodes.js';

let client = null;

export const googleAuth = {
  // Returns { googleId, email, emailVerified, name, picture }. Throws ApiError when invalid.
  async verify(credential) {
    if (!config.google.clientId) {
      throw new ApiError(503, ErrorCodes.INTERNAL_SERVER_ERROR, 'Google sign-in is not configured on this server.');
    }

    client ??= new OAuth2Client(config.google.clientId);

    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: config.google.clientId });
      const p = ticket.getPayload();
      return {
        googleId: p.sub,
        email: String(p.email || '').toLowerCase(),
        emailVerified: p.email_verified === true,
        name: p.name || '',
        picture: p.picture || '',
      };
    } catch {
      throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Google sign-in could not be verified. Please try again.');
    }
  },
};