# TaskPilot AI - Autonomous Productivity Agent

TaskPilot AI is a next-generation autonomous productivity assistant that goes beyond simple to-do lists. It leverages Google Gemini to automatically reason about your deadlines, estimate efforts, prioritize work, and intelligently schedule your day.

## Key Features

- **Autonomous Agentic Pipeline**: AI continuously reasons about your workload and re-optimizes your schedule when tasks change.
- **Smart Task Analysis**: Gemini breaks down complex tasks into subtasks, estimates required hours, and calculates a risk score for missing deadlines.
- **AI Daily Planner**: Automatically generates a time-blocked "Deep Work" schedule focused on the highest priority and highest risk items.
- **Workspace Export**: Connects with Google Workspace to seamlessly export progress reports to Google Docs, Slides, and Sheets.
- **Context-Aware Assistant**: A conversational AI interface that has full context of your pending tasks and can offer targeted productivity coaching and voice typing.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express (Server-side rendering / API via Vite middleware)
- **Database / Auth**: Firebase Firestore & Firebase Authentication
- **AI Models**: Google GenAI SDK (`gemini-2.0-flash`)
- **Workspace**: Google APIs (Drive, Docs, Sheets, Slides)

## Setup & Running

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
2. Configure `.env`:
   Duplicate `.env.example` to `.env` and fill in your Gemini API key and Firebase configuration.
3. Start the application:
   \`\`\`bash
   npm run dev
   \`\`\`
   
*Note: Due to Firebase Admin SDK requirements for server-side auth verification, ensure your environment provides default application credentials or a valid `FIREBASE_PROJECT_ID`.*
