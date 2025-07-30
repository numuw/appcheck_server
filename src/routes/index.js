import { Router } from "express";
import {
  getEventTypeHandler,
  managedAvailability,
} from "../controllers/commonControllers.js";

const router = Router();

router.post("/availability/single", managedAvailability);
router.post("/event-type/single", getEventTypeHandler);

export default router;
