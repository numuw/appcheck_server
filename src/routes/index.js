import { Router } from "express";
import {
  bookManagedEvent,
  bookRoundRobinEvent,
  getEventTypeHandler,
  managedAvailability,
} from "../controllers/commonControllers.js";

const router = Router();

router.post("/availability/single", managedAvailability);
router.post("/event-type/single", getEventTypeHandler);
router.post("/event/book/managed", bookManagedEvent);
router.post("/event/book/round-robin", bookRoundRobinEvent);

export default router;
