import "./src/config/dotenv.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import { appCheckMiddleware } from "./src/middlewares/appCheckMiddleware.js";
import googleCalendarRoutes from "./src/routes/googleCalendarRoute.js";
import { proxyMiddleWare } from "./src/utils/utils.js";
import { decodeJwtAuth } from "./src/middlewares/jwtAuthMiddleware.js";
import createSessionRouter from "./src/routes/createSessionRoute.js";
import availabilityRouter from "./src/routes/availabilityRoute.js";
const app = express();
const PORT = process.env.PORT || 5000;
app.set("trust proxy", true);
// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(morgan("dev"));

// Log all requests
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} Body-${JSON.stringify(
      req.body,
    )} ${req.originalUrl}`,
  );
  next();
});

// Proxy remaining PocketBase routes.
app.use("/web_server", proxyMiddleWare());
app.use("/mobile_server", appCheckMiddleware, proxyMiddleWare());

app.use(express.json());

// Custom Node-backed PocketBase routes.
app.use("/availability", availabilityRouter);

app.use("/create-session", createSessionRouter);
// This can be used for both web and mobile calendar routes
app.use("/api/calendar", decodeJwtAuth, googleCalendarRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not Found" }));

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
