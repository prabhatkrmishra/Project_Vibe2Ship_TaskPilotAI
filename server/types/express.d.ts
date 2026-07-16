// Extends Express's Request type with the custom properties our auth
// middleware (server/middleware/auth.ts) attaches at runtime. Without this,
// TypeScript has no way to know `req.uid` exists, since it's set dynamically
// via `req.uid = decoded.uid` rather than declared as part of the Request
// interface — hence TS2339 wherever req.uid is read.
import "express";

declare global {
    namespace Express {
        interface Request {
            /** Set by verifyToken middleware after JWT validation. */
            uid?: string;
        }
    }
}

export {};