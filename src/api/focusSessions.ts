import {api} from './client';

export const focusApi = {
    create: (data: any) => api.post('/api/focus-sessions', data),
    list: (params?: { from?: string; to?: string; method?: string; limit?: number }) => {
        const qs = new URLSearchParams();
        if (params?.from) qs.set('from', params.from);
        if (params?.to) qs.set('to', params.to);
        if (params?.method) qs.set('method', params.method);
        if (params?.limit) qs.set('limit', String(params.limit));
        const q = qs.toString();
        return api.get(`/api/focus-sessions${q ? `?${q}` : ''}`);
    },
    stats: () => api.get('/api/focus-sessions/stats'),
    heatmap: (month?: string) => api.get(`/api/focus-sessions/heatmap${month ? `?month=${month}` : ''}`),
};
