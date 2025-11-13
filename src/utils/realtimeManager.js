
import { db } from "./utils.js";

class RealtimeManager {
  constructor() {
    this.clients = new Map(); // Map of clientId -> { res, subscriptions }
    this.pbSubscriptions = new Map(); // Map of collection -> unsubscribe function
  }

  /**
   * Add a new SSE client
   */
  addClient(clientId, res, collections = []) {
    console.log(`[REALTIME] Client ${clientId} connected`);
    
    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial connection event
    this.sendEvent(res, "connect", { clientId, timestamp: Date.now() });

    // Store client
    this.clients.set(clientId, {
      res,
      subscriptions: new Set(collections),
    });

    // Subscribe to collections for this client
    collections.forEach((collection) => {
      this.subscribeToCollection(collection);
    });

    // Handle client disconnect
    res.on("close", () => {
      console.log(`[REALTIME] Client ${clientId} disconnected`);
      this.removeClient(clientId);
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (this.clients.has(clientId)) {
        this.sendEvent(res, "heartbeat", { timestamp: Date.now() });
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000);
  }

  /**
   * Remove a client
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.res.end();
      this.clients.delete(clientId);
      console.log(`[REALTIME] Client ${clientId} removed`);
    }
  }

  /**
   * Subscribe to a PocketBase collection
   */
  async subscribeToCollection(collection) {
    // If already subscribed, don't subscribe again
    if (this.pbSubscriptions.has(collection)) {
      console.log(`[REALTIME] Already subscribed to ${collection}`);
      return;
    }

    console.log(`[REALTIME] Subscribing to PocketBase collection: ${collection}`);

    try {
      // Subscribe to PocketBase collection
      await db.collection(collection).subscribe("*", (e) => {
        console.log(`[REALTIME] Event from ${collection}:`, e.action, e.record?.id);
        
        // Broadcast to all clients subscribed to this collection
        this.broadcast(collection, {
          action: e.action,
          record: e.record,
          collection: collection,
        });
      });

      // Store the collection name (PocketBase handles unsubscribe internally)
      this.pbSubscriptions.set(collection, true);
      console.log(`[REALTIME] Successfully subscribed to ${collection}`);
    } catch (error) {
      console.error(`[REALTIME] Error subscribing to ${collection}:`, error);
    }
  }

  /**
   * Unsubscribe from a PocketBase collection if no clients need it
   */
  async unsubscribeFromCollection(collection) {
    // Check if any client is still subscribed to this collection
    const hasSubscribers = Array.from(this.clients.values()).some((client) =>
      client.subscriptions.has(collection)
    );

    if (!hasSubscribers && this.pbSubscriptions.has(collection)) {
      console.log(`[REALTIME] Unsubscribing from ${collection}`);
      try {
        await db.collection(collection).unsubscribe();
        this.pbSubscriptions.delete(collection);
      } catch (error) {
        console.error(`[REALTIME] Error unsubscribing from ${collection}:`, error);
      }
    }
  }

  /**
   * Broadcast an event to all clients subscribed to a collection
   */
  broadcast(collection, data) {
    let sentCount = 0;
    this.clients.forEach((client, clientId) => {
      if (client.subscriptions.has(collection)) {
        this.sendEvent(client.res, "message", data);
        sentCount++;
      }
    });
    console.log(`[REALTIME] Broadcasted ${collection} event to ${sentCount} clients`);
  }

  /**
   * Send an SSE event to a client
   */
  sendEvent(res, event, data) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error("[REALTIME] Error sending event:", error);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      subscribedCollections: Array.from(this.pbSubscriptions.keys()),
    };
  }
}

// Export singleton instance
export const realtimeManager = new RealtimeManager();
