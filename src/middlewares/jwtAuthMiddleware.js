import jwt from "jsonwebtoken";

/**
 * Middleware to decode JWT token and extract user ID
 * Attaches userId to req.userId
 */
export const decodeJwtAuth = (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.headers["authorization"];

    if (!token) {
      return res.status(401).json({
        error: "Authorization header is required",
      });
    }

    // Decode JWT without verification (just extract payload)
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        error: "Invalid token format",
      });
    }
    // Attach user ID to request
    req.userId = decoded.id;
    req.user = decoded; // Also attach full decoded token data if needed

    next();
  } catch (error) {
    console.error("Error decoding JWT token:", error);
    return res.status(401).json({
      error: "Failed to decode token",
    });
  }
};

/**
 * Optional middleware - decode JWT but don't fail if missing
 */
export const optionalJwtAuth = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      req.userId = null;
      req.user = null;
      return next();
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      req.userId = null;
      req.user = null;
      return next();
    }

    const decoded = jwt.decode(token);

    if (decoded && decoded.id) {
      req.userId = decoded.id;
      req.user = decoded;
    } else {
      req.userId = null;
      req.user = null;
    }

    next();
  } catch (error) {
    console.error("Error in optional JWT middleware:", error);
    req.userId = null;
    req.user = null;
    next();
  }
};
