import {api} from './client';

export const tasksApi = {
    list: () => api.get('/api/tasks'),
    get: (id: string) => api.get(`/api/tasks/${id}`),
    create: (data: any) => api.post('/api/tasks', data),
    update: (id: string, data: any) => api.put(`/api/tasks/${id}`, data),
    delete: (id: string) => api.delete(`/api/tasks/${id}`),
    stats: () => api.get('/api/tasks/stats'),
    overdue: () => api.get('/api/tasks/overdue'),
    dueToday: () => api.get('/api/tasks/due-today'),
    active: () => api.get('/api/tasks/active'),
    completed: () => api.get('/api/tasks/completed'),
};
