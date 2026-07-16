import dotenv from "dotenv";

dotenv.config();

// ─── Environment Configuration ────────────────────────────────────────────────
// This file loads environment variables and exports typed constants.
// All process.env.X references should be consolidated here.

// Server Configuration
export const PORT = process.env.PORT || 3000;

// JWT Configuration
export const JWT_SECRET = process.env.JWT_SECRET!;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

// Database Configuration
export const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/taskpilot";

// AI Configuration
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GROQ_API_KEY = process.env.GROQ_API_KEY;
export const NIM_API_KEY = process.env.NIM_API_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
export const DEEPSEEK_API_KEY = process.env.DEEPUSEEK_API_KEY;
export const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
export const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
export const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;

// Backup Configuration
export const BACKUP_SIGNING_KEY = process.env.BACKUP_SIGNING_KEY!;

// TOTP Secret Encryption (2FA — keep stable, changing it invalidates existing 2FA setups)
export const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || JWT_SECRET;

// Google OAuth Configuration
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

// Frontend Configuration
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Stripe Configuration (if used)
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// Razorpay Configuration (if used)
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Email Configuration
export const EMAIL_HOST = process.env.EMAIL_HOST;
export const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || "587");
export const EMAIL_USER = process.env.EMAIL_USER;
export const EMAIL_PASS = process.env.EMAIL_PASS;