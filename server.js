import "./src/config/dotenv.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import { appCheckMiddleware } from "./src/middlewares/appCheckMiddleware.js";
import googleCalendarRoutes from "./src/routes/googleCalendarRoute.js";
import { proxyMiddleWare } from "./src/utils/utils.js";
import { decodeJwtAuth } from "./src/middlewares/jwtAuthMiddleware.js";

const app = express();
const PORT = process.env.PORT || 5000;
app.set("trust proxy", true);
// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(morgan("dev"));

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// THis can be used for both web and mobile calendar routes
app.use("/web_server/api/calendar", decodeJwtAuth, googleCalendarRoutes);
// Proxy middleware for PocketBase
app.use("/pb", proxyMiddleWare());
app.use("/web_server/api/collections", proxyMiddleWare("api/collections/"));
app.use("/web_server", proxyMiddleWare());
app.use("/p", proxyMiddleWare());
app.use("/mobile_server", appCheckMiddleware, proxyMiddleWare());
// app.use("/event-type/", filterOutBlockedRoutes, proxyMiddleWare("event-type/"));
// app.use(
//   "/availability/",
//   filterOutBlockedRoutes,
//   proxyMiddleWare("availability/")
// );
// app.use("/event/", filterOutBlockedRoutes, proxyMiddleWare("/event"));
// app.use("/bookings", filterOutBlockedRoutes, proxyMiddleWare("/bookings"));

// // Apply express.json() AFTER the /pb routes to avoid conflicts
// app.use(express.json());

// // Routes
// app.use("/mobile_server", appCheckMiddleware, routes);
// app.use("/web_server", routes);
// app.use("/payment", paymentRoutes);
// app.use("/api/calendar", googleCalendarRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not Found" }));

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
