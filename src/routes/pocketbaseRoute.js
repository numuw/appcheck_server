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
} from "../controllers/commonControllers.js";

const router = Router();

router.get("/members/event-settings/:id", getMemberEventSettings);
router.get("/bookings/get-one", getBooking);
router.post("/availability/single", managedAvailability);
router.post("/event-type/single", getEventTypeHandler);
router.post("/event/book/managed", bookManagedEvent);
router.post("/event/book/round-robin", bookRoundRobinEvent);
router.patch("/cancel-booking", cancelBooking);
router.patch("/reschedule-booking", rescheduleBooking);

export default router;
