import axios from "axios";
import { createProxyMiddleware } from "http-proxy-middleware";
import pocketbase from "pocketbase";

const PB_BASE_URL = process.env.POCKETBASE_API_URL || "http://127.0.0.1:8090";
const isTestRuntime =
  process.env.NODE_ENV === "test" || process.argv.includes("--test");

export const pocketbaseRequest = axios.create({
  baseURL: PB_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const proxyMiddleWare = (suffix = "") => {
  return createProxyMiddleware({
    target: process.env.POCKETBASE_API_URL + `${suffix ? "/" + suffix : ""}`,
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      "^/pb": "",
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log("======>", proxyReq);
      // Forward the real client IP
      const clientIP =
        req.ip ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        (req.connection.socket ? req.connection.socket.remoteAddress : null);

      // Set headers to preserve client IP information
      proxyReq.setHeader(
        "X-Forwarded-For",
        req.get("X-Forwarded-For") || clientIP,
      );
      proxyReq.setHeader("X-Real-IP", clientIP);
      proxyReq.setHeader("X-Forwarded-Proto", req.protocol);
      proxyReq.setHeader("X-Forwarded-Host", req.get("Host"));
    },

    onError: (err, req, res) => {
      console.error("Proxy Error:", err.message);
      res.status(500).json({ error: "Proxy error occurred" });
    },
  });
};

/**
 * Refresh Google access token using refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Object} - New access token data
 */
export async function refreshGoogleAccessToken(refreshToken) {
  try {
    const response = await axios({
      method: "POST",
      url: "https://oauth2.googleapis.com/token",
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID, // Set this in your environment
        client_secret: process.env.GOOGLE_CLIENT_SECRET, // Set this in your environment
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    console.error("Failed to refresh Google access token:", error);
    throw error;
  }
}

const db = new pocketbase(PB_BASE_URL);

// Disable auto-cancellation for server-side
db.autoCancellation(false);

// Authenticate as super admin when credentials are available. Tests and local
// utility runs may import this module without PocketBase secrets configured.
if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
  await db.admins.authWithPassword(
    process.env.PB_ADMIN_EMAIL,
    process.env.PB_ADMIN_PASSWORD,
    {
      autoRefreshThreshold: 30 * 60, // Refresh token 30 minutes before it expires
    },
  );
} else if (!isTestRuntime) {
  console.warn(
    "PocketBase admin credentials are missing. Continuing without admin auth.",
  );
}

export { db };
