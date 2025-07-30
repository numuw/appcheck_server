// src/middlewares/appCheckMiddleware.js
import { verifyAppCheckToken } from "../utils/verifyAppCheckToken.js";

export const appCheckMiddleware = async (req, res, next) => {
  const token = req.header("X-Firebase-AppCheck");
  console.log("Token", token);
  if (!token) return res.status(401).json({ error: "Missing App Check token" });

  const verified = await verifyAppCheckToken(token);
  if (!verified) {
    return res
      .status(401)
      .json({ error: "Invalid or missing App Check token" });
  }

  req.appCheck = verified;
  return next();
};
