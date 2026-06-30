# TaskPilot AI — The Last-Minute Life Saver

TaskPilot AI is an autonomous, AI-powered productivity companion built to help students, professionals, and entrepreneurs actually **finish** their work — not just get reminded about it. It uses Google's Gemini models to reason about deadlines, break down work, prioritize tasks, and auto-build a daily schedule, while integrating directly with Google Workspace and Google Calendar so plans turn into real action.

---

## Problem Statement Selected

**Theme: The Last-Minute Life Saver**

> Students, professionals, and entrepreneurs frequently miss deadlines, assignments, meetings, bill payments, interviews, and important commitments. Existing productivity tools often rely on passive reminders that are easy to ignore and do little to help users actually complete their tasks.
>
> **Challenge:** Build an AI-powered productivity companion that proactively assists users in planning, prioritizing, and completing tasks before deadlines are missed — moving beyond traditional reminders to help users take meaningful action.

Traditional to-do apps stop at "remind me." They don't understand how hard a task actually is, how urgent it really is relative to everything else on a person's plate, or when in the day the user can realistically do the work. TaskPilot AI was built to close that gap by giving the user an AI agent that thinks about their workload the way a sharp personal assistant would.

---

## Solution Overview

TaskPilot AI acts as an **autonomous productivity agent** layered on top of a normal task/goal manager. When a task is added, the app doesn't just store it — it sends the task to Gemini for analysis, which estimates effort, breaks it into subtasks, and calculates a **risk score** for missing the deadline. An autonomous pipeline continuously re-evaluates the user's full workload and re-prioritizes it whenever something changes (a new task, a completed task, an approaching deadline).

From there, the AI Daily Planner converts the prioritized, risk-scored task list into a concrete, time-blocked schedule for the day — including dedicated "Deep Work" blocks for the highest-risk items. A context-aware conversational assistant (with voice input) lets the user talk through their day, ask for coaching, or re-plan on the fly. Finally, the app connects to the user's real Google account so plans don't stay trapped in the app: tasks and AI-generated plans can sync to Google Calendar, and AI-generated progress reports can be exported straight into Google Docs, Sheets, and Slides.

In short: **TaskPilot AI doesn't just remind you — it analyzes, prioritizes, schedules, and helps execute, in your real calendar and your real documents.**

---

## Key Features

- **Intelligent Task Prioritization** — Every task is analyzed by Gemini to estimate effort (hours), urgency, and a deadline-miss risk score, which drives an automatically ranked priority order across the user's entire task list.
- **AI-Powered Scheduling Assistant (Daily Planner)** — Generates a time-blocked daily schedule, allocating focused "Deep Work" sessions to the highest-priority, highest-risk tasks.
- **Autonomous Agentic Pipeline** — A background pipeline continuously re-reasons about the user's workload (not a one-time analysis) and re-optimizes priorities and schedules as tasks are added, edited, or completed.
- **Automatic Subtask Generation** — Complex tasks are automatically decomposed into actionable subtasks/quest steps so the user knows exactly what to do next.
- **Context-Aware Conversational Assistant** — A chat interface that has full context of the user's pending tasks and goals, offering targeted productivity coaching, suggestions, and re-planning, with persisted chat history.
- **Voice-Enabled Assistance** — Voice input (Web Speech API) is available in Chat, Tasks, and Goals for hands-free task capture and conversation.
- **Goal & Habit Tracking** — A dedicated Goals module to set, track, and break down longer-term goals alongside day-to-day tasks.
- **Google Calendar Integration** — Tasks and AI-generated plans can be read from and pushed to the user's Google Calendar via OAuth.
- **Google Workspace Export** — One-click generation of AI-written progress reports as Google Docs, structured Google Sheets, and full Google Slides presentations.
- **Secure Authentication** — Email/password auth with hashed credentials and JWT sessions, plus Google OAuth login, and a frictionless guest mode for trying the app instantly.
- **Multi-Model Flexibility** — Users can select between available Gemini models (e.g., Flash / Flash-Lite / Pro preview) depending on speed vs. depth needs.
- **Persisted AI Decision Log** — Key AI decisions (prioritization calls, plan generations) are stored per-user, giving transparency into *why* the AI scheduled things the way it did.

---

## Technologies Used

**Frontend**
- React 19 + TypeScript
- Vite (build tool & dev server)
- Tailwind CSS v4 + `tw-animate-css`
- shadcn/ui component system (Radix/Base UI primitives, `class-variance-authority`, `clsx`, `tailwind-merge`)
- Framer Motion / Motion (animations)
- React Router v7 (client-side routing)
- React Markdown (rendering AI chat responses)
- Sonner (toast notifications)
- Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for voice input

**Backend**
- Node.js + Express (REST API, served via a custom `server.ts` with Vite middleware in dev)
- TypeScript end-to-end (frontend + backend), executed with `tsx` in development and bundled with `esbuild` for production
- JSON Web Tokens (`jsonwebtoken`) for session auth
- `bcryptjs` for password hashing
- `express-session` for OAuth session handling
- `helmet` and `cors` for security and cross-origin handling

**Database**
- MongoDB with Mongoose ODM (users, tasks, goals, chats, daily plans, AI decision logs)

**AI / Machine Learning**
- Google Gemini models via the `@google/genai` SDK (task analysis, subtask generation, scheduling/plan generation, autonomous pipeline reasoning, chat assistant)

**Authentication**
- Custom JWT-based auth (email/password + guest mode)
- Google OAuth 2.0 (`google-auth-library`, `@react-oauth/google`) for sign-in and Workspace API authorization

**Tooling**
- TypeScript (`tsc --noEmit` for linting/type-checking)
- ESBuild (server bundling)
- npm for package management

---

## Google Technologies Utilized

- **Google Gemini API** (`@google/genai`) — the core AI engine powering task analysis, effort estimation, risk scoring, subtask breakdown, AI scheduling/daily plan generation, the autonomous re-prioritization pipeline, and the conversational assistant.
- **Google AI Studio** — used to build, configure, and serve the project's server-side Gemini integration (API key/secret management, runtime environment configuration).
- **Google OAuth 2.0 / Google Identity Services** (`google-auth-library`, `@react-oauth/google`) — secure "Sign in with Google" and authorization for Workspace API access.
- **Google Calendar API** — reading and creating calendar events so AI-generated plans and tasks show up directly in the user's real calendar.
- **Google Docs API** — exporting AI-generated productivity/progress reports as formatted Google Docs.
- **Google Sheets API** — exporting structured task/goal data and reports as Google Sheets.
- **Google Slides API** — generating full Google Slides presentations summarizing progress and plans.
- **Google APIs Node.js Client** (`googleapis`) — unified client library used to call Calendar, Docs, Sheets, and Slides on behalf of the authenticated user.

---

## Architecture Summary

```
┌─────────────────────────┐        ┌──────────────────────────┐        ┌──────────────────────┐
│   React Frontend        │◄──────►│   Express API Server     │◄──────►│     MongoDB          │
│ (Tasks, Goals, Chat,    │  REST  │ (Auth, Tasks, Goals,     │        │ (Users, Tasks,       │
│  Dashboard, Workspace)  │        │  Chats, AI endpoints)    │        │  Goals, Chats, Plans)│
└─────────────────────────┘        └───────────┬──────────────┘        └──────────────────────┘
                                               │
                              ┌────────────────┼──────────────────┐
                              ▼                ▼                  ▼
                     ┌─────────────────┐ ┌──────────────┐ ┌────────────────────┐
                     │ Google Gemini   │ │ Google OAuth │ │ Google Workspace   │
                     │ (analysis,      │ │ 2.0          │ │ APIs (Calendar,    │
                     │  planning, chat,│ │              │ │ Docs, Sheets,      │
                     │  autonomous     │ │              │ │ Slides)            │
                     │  pipeline)      │ │              │ │                    │
                     └─────────────────┘ └──────────────┘ └────────────────────┘
```

---

## Setup & Running

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment variables**
   Copy `.env.example` to `.env` and fill in:
   - `GEMINI_API_KEY` — your Google Gemini API key
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud OAuth credentials (for Calendar/Docs/Sheets/Slides + Sign in with Google)
   - `MONGODB_URI` — your MongoDB connection string
   - `JWT_SECRET` / `SESSION_SECRET` — secrets for token/session signing
   - `ALLOWED_ORIGINS` / `APP_URL` — your app's domain(s)
3. **Run in development**
   ```bash
   npm run dev
   ```
4. **Build & run in production**
   ```bash
   npm run build
   npm start
   ```

---

## Credits

This project, **TaskPilot AI**, was conceived, designed, and built entirely by **me** as my submission for "The Last-Minute Life Saver" problem statement.

**Tools, platforms, and technologies credited:**
- **Google AI Studio** — for providing the build/runtime environment and Gemini integration tooling used to develop and serve the AI features of this project.
- **Google Gemini API** — the underlying large language model powering all AI reasoning, prioritization, planning, and chat features.
- **Google Cloud Platform / Google Workspace APIs** — Calendar, Docs, Sheets, and Slides APIs used for real-world task and report integration.
- **Google OAuth 2.0 / Identity Services** — for secure authentication and authorization.
- **Open-source libraries and frameworks** — React, Vite, Express, MongoDB/Mongoose, Tailwind CSS, shadcn/ui, Radix/Base UI, Framer Motion, and all other npm packages listed in `package.json`, each credited to their respective maintainers and open-source communities.

All product design, problem-solving approach, application logic, prompt engineering, UI/UX, and integration work are original work created for this project.
