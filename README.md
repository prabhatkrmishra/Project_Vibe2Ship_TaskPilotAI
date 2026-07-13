# TaskPilot AI - Autonomous Productivity Agent

TaskPilot AI is a next-generation autonomous productivity assistant that goes beyond simple to-do lists. It leverages Google Gemini to automatically reason about your deadlines, estimate efforts, prioritize work, and intelligently schedule your day.

## Key Features

- **Autonomous Agentic Pipeline**: AI continuously reasons about your workload and re-optimizes your schedule when tasks change.
- **Smart Task Analysis**: Gemini breaks down complex tasks into subtasks, estimates required hours, and calculates a risk score for missing deadlines.
- **AI Daily Planner**: Automatically generates a time-blocked "Deep Work" schedule aligned with chronobiology (circadian rhythms, ultradian cycles).
- **Quests & Habits**: Larger objectives (quests) broken into linked tasks with progress tracking; habits with streak tracking.
- **AI Chat Assistant**: A conversational AI with full context of your tasks, quests, and habits. Supports multiple AI personalities (default, drill sergeant, zen guide, executive).
- **Workspace Export**: Connects with Google Workspace to seamlessly export progress reports to Google Docs, Slides, Sheets, and Calendar events.
- **Gamification System**: XP, levels, streaks, badges, and unlockable AI personalities to keep you motivated.
- **Audio Journal**: Voice-to-text journal that extracts actionable tasks via AI.
- **Context-Aware Assistant**: A conversational AI interface that has full context of your pending tasks and can offer targeted productivity coaching.

## Tech Stack

- **Frontend**: React 19, Vite 6, TypeScript 5.8, Tailwind CSS 4, shadcn/ui
- **Backend**: Express.js (API routes served via Vite middleware in dev, static SPA in prod)
- **Database**: MongoDB (Mongoose)
- **AI Models**: Google GenAI SDK (`@google/genai`), model: `gemini-3.5-flash`
- **Authentication**: JWT-based auth + bcrypt + Google OAuth 2.0
- **Workspace**: Google APIs (Calendar, Docs, Sheets, Slides, Drive)
- **Deployment**: Vercel (serverless)

## Setup & Running

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
2. Configure `.env`:
   Duplicate `.env.example` to `.env` and fill in your Gemini API key, MongoDB connection string, and Google OAuth credentials.
3. Start the application:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Build frontend + bundle server |
| `npm start` | Run production server |
| `npm run lint` | TypeScript type checking |

## Environment Variables

See [`.env.example`](.env.example) for required configuration.

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for AI features |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT token signing |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `APP_URL` | Application URL (used for OAuth callbacks) |

## License

This project is under a custom source-available license. See [LICENSE.md](LICENSE.md) for details.
