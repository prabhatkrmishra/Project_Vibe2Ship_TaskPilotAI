import {api} from './client';

export const plansApi = {
    get: (date: string) => api.get(`/api/plans/${date}`),
    upsert: (date: string, sessions: any[]) => api.put(`/api/plans/${date}`, {sessions}),
    delete: (date: string) => api.delete(`/api/plans/${date}`),
    generate: (date: string) => api.post(`/api/plans/${date}/generate`),
    generatePlan: (data: { date: string; tasks: any[]; model?: string }) =>
        api.post('/api/generate-plan', data),
    runPipeline: (data: any) => api.post('/api/autonomous-pipeline', data),
};
