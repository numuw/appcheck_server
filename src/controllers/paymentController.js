import Chapa from "chapa";

// Initialize Chapa with secret key from environment variables
const myChapa = new Chapa("CHASECK_TEST-2jdONX9esNDd15dt335pz4pH6Q5ktrxy");

export const initializePayment = async (req, res) => {
  try {
    const {
      amount,
      currency = "ETB",
      email,
      first_name,
      last_name,
      callback_url,
      customization,
    } = req.body;

    // Validate required fields
    if (!amount || !email || !first_name || !last_name) {
      return res.status(400).json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "Amount, email, first_name, and last_name are required",
      });
    }

    const customerInfo = {
      amount,
      currency,
      email,
      first_name,
      last_name,
      callback_url: callback_url || process.env.CHAPA_CALLBACK_URL,
      customization: customization || {
        title: "Payment",
        description: "Complete your payment",
      },
    };

    const response = await myChapa.initialize(customerInfo, { autoRef: true });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Payment initialization error:", error);
    return res.status(500).json({
      error: "PAYMENT_INITIALIZATION_FAILED",
      message: error.message || "Failed to initialize payment",
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { tx_ref } = req.params;

    if (!tx_ref) {
      return res.status(400).json({
        error: "MISSING_TRANSACTION_REFERENCE",
        message: "Transaction reference is required",
      });
    }

    const response = await myChapa.verify(tx_ref);

    return res.status(200).json({
      success: true,
      message: "Payment verification completed",
      data: response,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({
      error: "PAYMENT_VERIFICATION_FAILED",
      message: error.message || "Failed to verify payment",
    });
  }
};

export const handlePaymentCallback = async (req, res) => {
  try {
    const callbackData = req.body;

    // Log the callback for debugging

    // Here you can add your business logic for handling successful/failed payments
    // For example: update order status, send confirmation emails, etc.

    return res.status(200).json({
      success: true,
      message: "Callback processed successfully",
    });
  } catch (error) {
    console.error("Payment callback error:", error);
    return res.status(500).json({
      error: "CALLBACK_PROCESSING_FAILED",
      message: error.message || "Failed to process payment callback",
    });
  }
};
