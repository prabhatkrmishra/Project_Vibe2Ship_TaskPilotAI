import {api} from './client';

export const subscriptionsApi = {
    getStatus: () => api.get('/api/subscriptions/status'),
    cancel: () => api.post('/api/subscriptions/cancel'),
};
