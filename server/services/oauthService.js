// Verifies Google identity tokens for OAuth login.
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { isServiceAvailable, logExternalFailure } from "./serviceStatusService.js";

export async function verifyGoogleIdToken(idToken) {
  if (!isServiceAvailable("googleOAuth")) throw new ApiError("Google sign-in is temporarily unavailable.", 503);
  if (!env.oauth.googleClientId) throw new ApiError("Google Sign In is not configured.", 503);
  if (!idToken) throw new ApiError("Google credential is required.", 400);

  let response;
  try {
    response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  } catch (error) {
    logExternalFailure("googleOAuth", error, { action: "verify_token" });
    throw new ApiError("Google sign-in is temporarily unavailable.", 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError("Google authentication failed.", 401);
  if (payload.aud !== env.oauth.googleClientId) throw new ApiError("Google authentication failed.", 401);
  if (!payload.email) throw new ApiError("Google authentication failed.", 401);

  return { providerId: payload.sub, email: payload.email, name: payload.name || payload.email.split("@")[0], emailVerified: payload.email_verified === "true" || payload.email_verified === true };
}