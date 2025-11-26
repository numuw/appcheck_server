import axios from "axios";
import crypto from "crypto";

export const afterBookingCreateSuccess = async (req, res) => {
  try {
    let booking = req.body?.booking;
    let eventType = req.body?.eventType;
    let webhooks = req.body?.webhooks;

    if (!booking || !eventType || !webhooks) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (webhooks?.length) {
      webhooks.map(async (webhook) => {
        booking = {
          ...booking,
          triggerEvent: "booking.created",
          expanded: {
            eventType,
          },
        };
        console.log("Sending webhook for booking created");

        try {
          const secret = webhook.secret;
          // hash the booking data for webhook signature
          /**
           * TODO: Use hash in the webhook request to verify on the receiving end
           */
          const hash = crypto
            .createHmac("sha256", secret)
            .update(JSON.stringify(booking))
            .digest("hex");
          // send the webhook request
          axios({
            url: webhook.url,
            method: "POST",
            data: booking, // Changed from 'body' and removed JSON.stringify
            timeout: 10000, // Changed from 10 to 10000 (10 seconds in milliseconds)
            headers: {
              "Content-Type": "application/json",
              "x-webhook-signature": secret,
            },
          }).catch((error) => {
            console.log(error.response);
          });
        } catch (error) {
          console.log("Error sending webhook:", error);
        }
      });
    }
    return res
      .status(200)
      .json({ message: "Webhook(s) triggered successfully" });
  } catch (error) {
    console.error("Error in afterCreateSuccess:", error);
    return res.status(500).json({ error: error.message });
  }
};
