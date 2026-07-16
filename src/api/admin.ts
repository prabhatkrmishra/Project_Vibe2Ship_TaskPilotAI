import {api} from './client';

export const adminApi = {
    getPricing: () => api.get('/api/admin/pricing'),
    updatePricing: (planId: string, updates: any) => api.put(`/api/admin/pricing/${planId}`, updates),
    getSubscriptions: () => api.get('/api/admin/subscriptions'),
    makeAdmin: (email: string) => api.post('/api/admin/make-admin', {email}),
};
