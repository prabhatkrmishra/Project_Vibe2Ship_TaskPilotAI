import {api} from './client';

export const aiApi = {
    analyzeTask: (data: { title: string; description?: string; deadline?: string; model?: string }) =>
        api.post('/api/analyze-task', data),
    generateSubtasks: (data: { title: string; description?: string; model?: string }) =>
        api.post('/api/generate-subtasks', data),
    generateQuestSteps: (data: { title: string; description?: string; targetDate?: string; model?: string }) =>
        api.post('/api/generate-quest-steps', data),
    generatePlan: (data: { tasks: any[]; date: string; model?: string }) =>
        api.post('/api/generate-plan', data),
    autonomousPipeline: (data: any) => api.post('/api/autonomous-pipeline', data),
    audioJournal: (data: { text: string; model?: string }) => api.post('/api/audio-journal', data),
    aiDecisions: () => api.get('/api/ai-decisions'),
};

export const workspaceApi = {
    calendar: {
        list: (timeMin?: string, timeMax?: string) => {
            const qs = new URLSearchParams();
            if (timeMin) qs.set('timeMin', timeMin);
            if (timeMax) qs.set('timeMax', timeMax);
            const q = qs.toString();
            return api.get(`/api/calendar/events${q ? `?${q}` : ''}`);
        },
        create: (data: any) => api.post('/api/calendar/events', data),
    },
    docs: {
        generate: (data: any) => api.post('/api/docs/generate-report', data),
    },
    sheets: {
        create: (data: any) => api.post('/api/sheets/create', data),
    },
    presentations: {
        generate: (data: any) => api.post('/api/presentations/generate', data),
    },
};

export const subscriptionsApi = {
    status: () => api.get('/api/subscriptions/status'),
    createOrder: (data: { plan: string }) => api.post('/api/subscriptions/create-order', data),
    verify: (data: any) => api.post('/api/subscriptions/verify', data),
    cancel: () => api.post('/api/subscriptions/cancel'),
};

export const adminApi = {
    pricing: {
        list: () => api.get('/api/admin/pricing'),
        update: (data: any) => api.post('/api/admin/pricing', data),
    },
    subscriptions: () => api.get('/api/admin/subscriptions'),
    makeAdmin: (email: string) => api.post('/api/admin/make-admin', {email}),
};

export const backupApi = {
    create: () => api.post('/api/backup/create'),
    restore: (data: any) => api.post('/api/backup/restore', data),
};

export const soundsApi = {
    status: () => api.get('/api/sounds/status'),
};
