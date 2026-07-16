import {api} from './client';

export const chatApi = {
    sessions: () => api.get('/api/chats/sessions'),
    messages: (chatId: string, limit = 50, skip = 0) =>
        api.get(`/api/chats?chatId=${chatId}&limit=${limit}&skip=${skip}`),
    send: (data: { role: string; content: string; chatId: string; chatTitle?: string }) =>
        api.post('/api/chats', data),
    sendAI: (data: {
        messages: any[];
        context: any;
        model?: string;
        chatId?: string;
        localDateStr?: string;
        localTimeStr?: string
    }) =>
        api.post('/api/chat', data),
    deleteSession: (chatId: string) => api.delete(`/api/chats/${chatId}`),
    updateTitle: (chatId: string, title: string) =>
        api.put(`/api/chats/${chatId}/title`, {title}),
    renameSession: (chatId: string, title: string) =>
        api.put(`/api/chats/sessions/${chatId}`, {title}),
    removeSession: (chatId: string) => api.delete(`/api/chats/sessions/${chatId}`),
    models: () => api.get('/api/models'),
};
