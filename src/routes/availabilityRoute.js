import { Router } from "express";
import {
  managedAvailability,
  roundRobinAvailability,
} from "../controllers/commonControllers.js";

const availabilityRouter = Router();
availabilityRouter.post("/single", managedAvailability);
availabilityRouter.post("/round-robin", roundRobinAvailability);

export default availabilityRouter;
