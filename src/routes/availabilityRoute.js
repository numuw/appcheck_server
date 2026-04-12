import { Router } from "express";
import {
  bookManagedEvent,
  bookRoundRobinEvent,
} from "../controllers/commonControllers.js";

const availabilityRouter = Router();
availabilityRouter.post("/event/book/managed", bookManagedEvent);
availabilityRouter.post("/event/book/round-robin", bookRoundRobinEvent);

export default availabilityRouter;
