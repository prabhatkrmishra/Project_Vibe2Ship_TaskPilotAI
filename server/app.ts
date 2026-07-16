import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import * as fs from "fs";
import {connectDB} from "./db/mongodb.ts";
import {JWT_SECRET} from "./config/env";
import {errorHandler} from "./middleware/errorHandler";
import {router as apiRouter} from "./routes/index";
import {googleOAuthRoutes} from "./routes/googleOAuthRoutes";
import {legacyRegisterRoutes} from "./routes/legacyRegisterRoutes";
import {webhookRoutes} from "./routes/webhookRoutes";
import {ensurePricingSeeded} from "./controllers/subscriptionController";

export function createApp() {
    const app = express();

    app.set('trust proxy', 1);

    app.use(cors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true
    }));

    app.use("/api/webhooks", webhookRoutes);

    app.use(express.json({limit: '10mb'}));
    app.use(express.urlencoded({extended: true, limit: '10mb'}));

    app.use(session({
        secret: JWT_SECRET || 'dev-fallback-secret-do-not-use-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        }
    }));

    // Rate limiters are applied per-route in individual router files,
    // matching the original server.ts pattern. Do NOT add app-level
    // limiters here — they would double-count with route-level ones.

    // Mount all API routes
    app.use("/api", apiRouter);

    // Mount Google OAuth routes at root level (not under /api)
    app.use(googleOAuthRoutes);

    // Mount legacy register routes at root level for /register/user
    app.use(legacyRegisterRoutes);

    // SPA / Static file serving
    if (process.env.NODE_ENV !== "production") {
        // Dev mode: Vite middleware is handled by the calling code
        // (tsx doesn't support dynamic import of vite easily, so we let the entry point handle it)
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        if (fs.existsSync(distPath)) {
            app.use(express.static(distPath));
            app.get('*', (req, res, next) => {
                if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/register')) {
                    return next();
                }
                res.sendFile(path.join(distPath, 'index.html'));
            });
        }
    }

    app.use(errorHandler);

    return app;
}

export async function initializeDatabase() {
    try {
        await connectDB();
        console.log('Connected to MongoDB');
        ensurePricingSeeded().catch(() => {
        });
    } catch (error) {
        if (process.env.NODE_ENV === 'production') {
            console.error('Failed to connect to MongoDB:', error);
            process.exit(1);
        }
        console.warn('MongoDB connection failed (dev mode continues without DB):', (error as Error).message);
    }
}
