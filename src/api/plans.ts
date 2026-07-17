import {api} from './client';

export const plansApi = {
    get: (date: string) => api.get(`/api/plans/${encodeURIComponent(date)}`),
    upsert: (date: string, sessions: any[]) => api.put(`/api/plans/${encodeURIComponent(date)}`, {sessions}),
    delete: (date: string) => api.delete(`/api/plans/${encodeURIComponent(date)}`),
    generate: (date: string) => api.post(`/api/plans/${encodeURIComponent(date)}/generate`),
    generatePlan: (data: { date: string; tasks: any[]; model?: string }) =>
        api.post('/api/generate-plan', data),
    runPipeline: (data: any) => api.post('/api/autonomous-pipeline', data),
};
