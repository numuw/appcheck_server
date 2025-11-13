import "./src/config/dotenv.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import routes from "./src/routes/pocketbaseRoute.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import { appCheckMiddleware } from "./src/middlewares/appCheckMiddleware.js";
import { filterOutBlockedRoutes } from "./src/middlewares/filterBlokedRoutes.js";
import { paymentRoutes } from "./src/routes/paymentRoute.js";
import googleCalendarRoutes from "./src/routes/googleCalendarRoute.js";
import { proxyMiddleWare } from "./src/utils/utils.js";

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

// Proxy middleware for PocketBase
app.use("/pb", filterOutBlockedRoutes, proxyMiddleWare());
app.use(
  "/web_server/api/collections",
  filterOutBlockedRoutes,
  proxyMiddleWare("api/collections/")
);
app.use("/event-type/", filterOutBlockedRoutes, proxyMiddleWare("event-type/"));
app.use(
  "/availability/",
  filterOutBlockedRoutes,
  proxyMiddleWare("availability/")
);
app.use("/event/", filterOutBlockedRoutes, proxyMiddleWare("/event"));
app.use("/bookings", filterOutBlockedRoutes, proxyMiddleWare("/bookings"));

// Apply express.json() AFTER the /pb routes to avoid conflicts
app.use(express.json());

// Routes
app.use("/mobile_server", appCheckMiddleware, routes);
app.use("/web_server", routes);
app.use("/payment", paymentRoutes);
// app.use("/api/calendar", googleCalendarRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not Found" }));

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
