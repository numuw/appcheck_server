import { Router } from "express";
import {
  bookManagedEvent,
  bookRoundRobinEvent,
  getEventTypeHandler,
  managedAvailability,
  roundRobinAvailability,
  getMemberEventSettings,
  cancelBooking,
  getBooking,
  rescheduleBooking,
  reinviteUser,
  updateMemberData,
  impersonation,
} from "../controllers/commonControllers.js";

import { afterBookingCreateSuccess } from "../controllers/webhookController.js";

const router = Router();
router.post("/afterBookingCreateSuccess", afterBookingCreateSuccess);
router.get("/members/event-settings/:id", getMemberEventSettings);
router.get("/bookings/get-one", getBooking);
router.post("/availability/single", managedAvailability);
router.post("/availability/round-robin", roundRobinAvailability);
router.post("/event-type/single", getEventTypeHandler);
router.post("/event/book/managed", bookManagedEvent);

router.post("/event/book/round-robin", bookRoundRobinEvent);
router.patch("/cancel-booking", cancelBooking);
router.patch("/reschedule-booking", rescheduleBooking);
router.post("/re-invite-user", reinviteUser);
router.post("/update-member-data", updateMemberData);
router.post("/custom-impersonate", impersonation);

export default router;
