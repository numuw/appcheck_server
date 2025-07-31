import { blockedRoutes } from "../constant/constant.js";

export const filterOutBlockedRoutes = async (req, res, next) => {
  // Check if the route is blocked
  const isBlocked = blockedRoutes.some((route) => req.path === route);

  if (isBlocked) {
    console.log(`Blocked route: ${req.path}`);
    return res.status(403).json({
      error: "NOT_ALLOWED",
      message: `Access to ${req.path} is restricted`,
    });
  }

  // If the route is not blocked, continue with the request
  next();
};
