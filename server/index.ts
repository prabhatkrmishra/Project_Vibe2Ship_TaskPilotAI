import {createApp, initializeDatabase} from "./app.ts";
import {PORT} from "./config/env.ts";

async function startServer() {
    try {
        await initializeDatabase();

        const app = createApp();

        // Vite dev middleware
        if (process.env.NODE_ENV !== "production") {
            try {
                const {createServer: createViteServer} = await import("vite");
                const vite = await createViteServer({
                    server: {middlewareMode: true},
                    appType: "spa",
                });
                app.use(vite.middlewares);

                app.get('*', async (req, res, next) => {
                    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/register')) {
                        return next();
                    }
                    try {
                        const indexHtml = require('fs').readFileSync(
                            require('path').resolve(process.cwd(), 'index.html'), 'utf-8'
                        );
                        const transformedHtml = await vite.transformIndexHtml(req.originalUrl, indexHtml);
                        res.status(200).set({'Content-Type': 'text/html'}).end(transformedHtml);
                    } catch (err: any) {
                        console.error("[Dev SPA Fallback] Error:", err);
                        res.status(500).send(`Dev SPA Fallback Error: ${err?.message || err}`);
                    }
                });
            } catch (e) {
                console.warn("Vite not available, skipping dev middleware");
            }
        }

        const port = Number(PORT) || 3000;

        if (process.env.VERCEL !== '1') {
            app.listen(port, "0.0.0.0", () => {
                console.log(`Server running on http://0.0.0.0:${port}`);
            });
        }

        return app;
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

const appPromise = startServer();

if (process.env.VERCEL !== '1') {
    appPromise.catch(err => console.error("Failed to start server:", err));
}

// Vercel Node runtime handler
export default async function handler(req: any, res: any) {
    const app = await appPromise;
    return app(req, res);
}
