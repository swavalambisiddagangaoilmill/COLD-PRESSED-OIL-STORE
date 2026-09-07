// Resolves a stored session without treating a temporary service failure as logout.
export const AUTH_RETRY_DELAYS = [2000, 5000, 10000];

const wait = (delay) => new Promise((resolve) => window.setTimeout(resolve, delay));

export function authFailureKind(error) {
  if (Number(error?.status) === 401) return "unauthenticated";
  if (Number(error?.status) === 403) return "forbidden";
  return "unavailable";
}

async function runWithTransientRetries(operation, delays, waitFor) {
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (authFailureKind(error) !== "unavailable" || attempt >= delays.length) throw error;
      await waitFor(delays[attempt]);
    }
  }
}

export async function resolveStoredSession({ getProfile, refreshAccount, delays = AUTH_RETRY_DELAYS, waitFor = wait }) {
  try {
    const data = await runWithTransientRetries(getProfile, delays, waitFor);
    return { status: "confirmed", user: data.user };
  } catch (profileError) {
    if (authFailureKind(profileError) !== "unauthenticated") {
      return { status: authFailureKind(profileError), error: profileError };
    }
  }

  try {
    const data = await runWithTransientRetries(refreshAccount, delays, waitFor);
    return { status: "confirmed", user: data.user, token: data.token, refreshToken: data.refreshToken };
  } catch (refreshError) {
    return { status: authFailureKind(refreshError), error: refreshError };
  }
}
