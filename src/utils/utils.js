import axios from "axios";
import { createProxyMiddleware } from "http-proxy-middleware";
import pocketbase from "pocketbase";
export const pocketbaseRequest = axios.create({
  baseURL: process.env.POCKETBASE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const proxyMiddleWare = (suffix = "") => {
  return createProxyMiddleware({
    target: `http://localhost:8090${suffix ? "/" + suffix : ""}`,
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      "^/pb": "",
    },
    onProxyReq: (proxyReq, req, res) => {
      // Forward the real client IP
      const clientIP =
        req.ip ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        (req.connection.socket ? req.connection.socket.remoteAddress : null);

      // Set headers to preserve client IP information
      proxyReq.setHeader(
        "X-Forwarded-For",
        req.get("X-Forwarded-For") || clientIP
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

export const db = new pocketbase(process.env.POCKETBASE_API_URL);

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
