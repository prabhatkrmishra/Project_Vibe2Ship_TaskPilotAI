import rateLimit, {ipKeyGenerator} from "express-rate-limit";

// ─── Rate Limiters ──────────────────────────────────────────────────────────────
// This file contains rate limiting configurations for various API endpoints.
// Used to prevent abuse and ensure fair usage of the system.

// S2: Rate limit auth endpoints to prevent brute-force / credential-stuffing.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,                   // 20 attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: "Too many authentication attempts. Please try again later."},
});

// Guest account limiter
export const guestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,                    // 5 guest accounts per IP per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: "Too many guest sessions. Please sign up or try again later."},
});

// Chat message limiter
export const chatLimiter = rateLimit({
    windowMs: 60 * 1000,      // 1 min
    max: 30,                   // 30 messages per min per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
    message: {error: "You're sending messages too fast. Slow down."},
});

// Payment action limiter
export const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,      // 1 min
    max: 10,                   // 10 payment actions per min per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
    message: {error: "Too many payment requests. Please try again later."},
});

// Backup signing limiter
export const backupLimiter = rateLimit({
    windowMs: 60 * 1000,      // 1 min
    max: 10,                   // 10 sign requests per min per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
    message: {error: "Too many backup sign requests. Please try again later."},
});

// Email sending limiter
export const emailLimiter = rateLimit({
    windowMs: 60 * 1000,      // 1 min
    max: 3,                    // 3 emails per min per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
    message: {error: "Too many emails. Please try again later."},
});