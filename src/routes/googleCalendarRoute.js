import { Router } from "express";
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  checkAvailability,
  createMeeting,
  getUserCalendarEvents,
  googleConnectionStatus,
  disconnectGoogleCalendar,
} from "../controllers/googleCalendarController.js";
import { decodeJwtAuth } from "../middlewares/jwtAuthMiddleware.js";

const router = Router();
router.use(decodeJwtAuth);

// Google OAuth routes
router.post("/auth/google/initiate", initiateGoogleAuth);
router.post("/auth/google/callback", handleGoogleCallback);
router.get("/status", googleConnectionStatus);
router.delete("/disconnect", disconnectGoogleCalendar);

// Calendar functionality routes
router.post("/availability/check", checkAvailability);
router.post("/meeting/create", createMeeting);
router.post("/events/list", getUserCalendarEvents);

export default router;
