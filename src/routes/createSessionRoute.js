import { Router } from "express";
import { bookingCreate } from "../controllers/commonControllers.js";

const createSessionRouter = Router();
createSessionRouter.post("/", bookingCreate);

export default createSessionRouter;
