import { appCheck } from "../config/firebase.js";

/**
 * Verifies an App Check token using Firebase Admin SDK
 * @param {string} token - The token from the `X-Firebase-AppCheck` header
 * @returns {Promise<object|null>} - Decoded token or null if invalid
 */
export async function verifyAppCheckToken(token) {
  if (!token) return null;

  try {
    const decodedToken = await appCheck.verifyToken(token);
    return decodedToken; // contains app_id, ttl, issue_time, etc.
  } catch (err) {
    console.error("Invalid App Check token:", err.message);
    return null;
  }
}
