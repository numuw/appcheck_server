
import express from "express";
import { realtimeManager } from "../utils/realtimeManager.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * SSE endpoint for realtime updates
 * Query params:
 *   - collections: comma-separated list of collections to subscribe to
 * Example: /realtime?collections=bookings,users
 */
router.get("/", (req, res) => {
  const clientId = uuidv4();
  const collectionsParam = req.query.collections || "";
  const collections = collectionsParam
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  console.log(`[REALTIME] New connection request from client ${clientId}`);
  console.log(`[REALTIME] Requested collections:`, collections);

  if (collections.length === 0) {
    return res.status(400).json({
      error: "No collections specified",
      message: "Please provide collections query parameter",
    });
  }

  // Add client to realtime manager
  realtimeManager.addClient(clientId, res, collections);
});

/**
 * Get realtime statistics (for debugging)
 */
router.get("/stats", (req, res) => {
  res.json(realtimeManager.getStats());
});

export default router;
