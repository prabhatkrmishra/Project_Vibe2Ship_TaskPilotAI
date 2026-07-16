import {api} from './client';

export const authApi = {
    me: () => api.get('/api/auth/me'),
    login: (data: { email: string; password: string }) => api.post('/api/auth/login', data),
    register: (data: { name: string; email: string; password: string }) =>
        api.post('/api/auth/register', data),
    guest: () => api.post('/api/auth/guest'),
    logout: () => api.post('/api/auth/logout'),
    forgotPassword: (email: string) => api.post('/api/auth/forgot-password', {email}),
    verifyResetToken: (token: string) => api.get(`/api/auth/reset-password/${encodeURIComponent(token)}`),
    resetPassword: (data: { token: string; password: string }) =>
        api.post('/api/auth/reset-password', data),
    profile: (data: any) => api.put('/api/auth/profile', data),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
        api.post('/api/auth/change-password', data),
    twoFactorStatus: () => api.post('/api/auth/2fa/status'),
    twoFactorSetup: () => api.post('/api/auth/2fa/setup'),
    twoFactorVerify: (code: string) => api.post('/api/auth/2fa/verify', {code}),
    twoFactorDisable: (code: string) => api.post('/api/auth/2fa/disable', {code}),
    sendVerification: () => api.post('/api/auth/send-verification'),
    verifyEmail: (token: string) => api.get(`/api/auth/verify-email?token=${token}`),
    googleCallback: (data: any) => api.post('/api/auth/google/callback', data),
    models: () => api.get('/api/models'),
    unlockPersonality: (personalityId: string, cost: number) =>
        api.post('/api/user/personalities/unlock', {personalityId, cost}),
    setActivePersonality: (personalityId: string) =>
        api.post('/api/user/personalities/active', {personalityId}),
};
