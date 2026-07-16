import * as ChatRepository from "../repositories/chatRepository.ts";

export const getMessages = async (userId: string, chatId: string | null, limit: number, skip: number) => {
    return await ChatRepository.findMessagesByChatId(userId, chatId, limit, skip);
};

export const getSessions = async (userId: string) => {
    return await ChatRepository.findSessions(userId);
};

export const deleteSession = async (userId: string, chatId: string) => {
    return await ChatRepository.deleteMessagesByChatId(userId, chatId);
};

export const renameSession = async (userId: string, chatId: string, title: string) => {
    return await ChatRepository.updateChatTitle(userId, chatId, title);
};

export const createMessage = async (data: {
    userId: string;
    role: string;
    content: string;
    chatId: string;
    chatTitle: string;
    timestamp: Date;
}) => {
    return await ChatRepository.createMessage(data);
};
