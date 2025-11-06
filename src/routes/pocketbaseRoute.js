import { Router } from "express";
import {
  bookManagedEvent,
  bookRoundRobinEvent,
  getEventTypeHandler,
  managedAvailability,
  getMemberEventSettings,
  cancelBooking,
} from "../controllers/commonControllers.js";

const router = Router();

router.post("/availability/single", managedAvailability);
router.post("/event-type/single", getEventTypeHandler);
router.post("/event/book/managed", bookManagedEvent);
router.post("/event/book/round-robin", bookRoundRobinEvent);
router.get("/members/event-settings/:id", getMemberEventSettings);
router.patch("/cancel-booking", cancelBooking);

export default router;
