import { Request, Response, NextFunction } from "express";

/**
 * Simple authentication middleware for email processing routes
 * Checks for user ID in request context or query params
 */
export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Get user ID from various sources
    const userId =
      (req as any).userId ||
      (req as any).user?.id ||
      req.query.userId ||
      req.headers["x-user-id"];

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User ID is required",
      });
    }

    // Attach user ID to request for downstream handlers
    (req as any).userId = parseInt(String(userId), 10);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication failed",
    });
  }
}
