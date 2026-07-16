import {api} from './client';

export const goalsApi = {
    list: () => api.get('/api/goals'),
    get: (id: string) => api.get(`/api/goals/${id}`),
    create: (data: any) => api.post('/api/goals', data),
    update: (id: string, data: any) => api.put(`/api/goals/${id}`, data),
    delete: (id: string) => api.delete(`/api/goals/${id}`),
    stats: () => api.get('/api/goals/stats'),
    active: () => api.get('/api/goals/active'),
    archived: () => api.get('/api/goals/archived'),
    dueToday: () => api.get('/api/goals/due-today'),
};
