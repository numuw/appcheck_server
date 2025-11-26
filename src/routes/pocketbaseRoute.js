import { Router } from "express";
import {
  bookManagedEvent,
  bookRoundRobinEvent,
  getEventTypeHandler,
  managedAvailability,
  getMemberEventSettings,
  cancelBooking,
  getBooking,
  rescheduleBooking,
  reinviteUser,
} from "../controllers/commonControllers.js";
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  checkAvailability,
  createMeeting,
  getUserCalendarEvents,
  googleConnectionStatus,
  disconnectGoogleCalendar,
  handleUpdateTokens,
  updateMemberData,
  impersonation,
} from "../controllers/googleCalendarController.js";
import { decodeJwtAuth } from "../middlewares/jwtAuthMiddleware.js";
import { afterBookingCreateSuccess } from "../controllers/webhookController.js";

const router = Router();
router.post("/afterBookingCreateSuccess", afterBookingCreateSuccess);
router.get("/members/event-settings/:id", getMemberEventSettings);
router.get("/bookings/get-one", getBooking);
router.post("/availability/single", managedAvailability);
router.post("/event-type/single", getEventTypeHandler);
router.post("/event/book/managed", bookManagedEvent);
router.post("/event/book/round-robin", bookRoundRobinEvent);
router.patch("/cancel-booking", cancelBooking);
router.patch("/reschedule-booking", rescheduleBooking);
router.post("/re-invite-user", reinviteUser);
router.post("/update-member-data", updateMemberData);
router.post("/custom-impersonate", impersonation);

router.use(decodeJwtAuth);

// Google OAuth routes
router.post("/api/calendar/auth/google/initiate", initiateGoogleAuth);
router.post("/api/calendar/auth/google/callback", handleGoogleCallback);
router.put("/api/calendar/auth/google/update-tokens", handleUpdateTokens);
router.get("/api/calendar/status", googleConnectionStatus);
router.delete("/api/calendar/disconnect", disconnectGoogleCalendar);

// Calendar functionality routes
router.post("/api/calendar/availability/check", checkAvailability);
router.post("/api/calendar/meeting/create", createMeeting);
router.post("/api/calendar/events/list", getUserCalendarEvents);

export default router;
