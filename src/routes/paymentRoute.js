import { Router } from "express";
import {
  initializePayment,
  verifyPayment,
  handlePaymentCallback,
} from "../controllers/paymentController.js";

const paymentRoutes = Router();

// Initialize payment
paymentRoutes.post("/initialize", initializePayment);

// Verify payment
paymentRoutes.get("/verify/:tx_ref", verifyPayment);

// Handle payment callback (webhook)
paymentRoutes.post("/callback", handlePaymentCallback);

export { paymentRoutes };
