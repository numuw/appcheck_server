import "./src/config/dotenv.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import routes from "./src/routes/pocketbaseRoute.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import { appCheckMiddleware } from "./src/middlewares/appCheckMiddleware.js";
import { createProxyMiddleware } from "http-proxy-middleware";
import { filterOutBlockedRoutes } from "./src/middlewares/filterBlokedRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;
app.set("trust proxy", true);
// Middleware
app.use(cors());
app.use(morgan("dev"));

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Proxy middleware for PocketBase
app.use(
  "/pb",
  filterOutBlockedRoutes,
  createProxyMiddleware({
    target: "http://localhost:8090",
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
  })
);

// Apply express.json() AFTER the /pb routes to avoid conflicts
app.use(express.json());

// Routes
app.use("/mobile_server", appCheckMiddleware, routes);
app.use("/web_server", routes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not Found" }));

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
