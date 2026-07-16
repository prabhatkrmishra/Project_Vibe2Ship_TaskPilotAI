import {ChatMessage} from "../db/mongodb.ts";

export const findMessagesByChatId = (userId: string, chatId: string | null, limit: number, skip: number) => {
    const query: any = {userId};
    if (chatId) {
        if (chatId === 'default') {
            query.$or = [
                {chatId: 'default'},
                {chatId: {$exists: false}},
                {chatId: null}
            ];
        } else {
            query.chatId = chatId;
        }
    }
    return ChatMessage.find(query).sort({timestamp: 1}).skip(skip).limit(limit);
};

export const findSessions = async (userId: string) => {
    const chats = await ChatMessage.find({userId}).sort({timestamp: 1});
    const sessionsMap = new Map<string, any>();

    sessionsMap.set('default', {
        chatId: 'default',
        title: 'Default Chat',
        timestamp: new Date(0),
        messagesCount: 0
    });

    for (const msg of chats) {
        const cId = msg.chatId || 'default';
        if (!sessionsMap.has(cId)) {
            sessionsMap.set(cId, {
                chatId: cId,
                title: msg.chatTitle || (cId === 'default' ? 'Default Chat' : 'New Chat'),
                timestamp: msg.timestamp || new Date(),
                messagesCount: 0
            });
        }
        const sess = sessionsMap.get(cId);
        sess.timestamp = msg.timestamp || new Date();
        sess.messagesCount += 1;

        if (msg.role === 'user' && (!msg.chatTitle || msg.chatTitle === 'New Chat' || msg.chatTitle === 'Default Chat' || msg.chatTitle === msg.content) && (sess.title === 'New Chat' || sess.title === 'Default Chat')) {
            sess.title = msg.content.substring(0, 40) + (msg.content.length > 40 ? '...' : '');
        }
    }

    return Array.from(sessionsMap.values()).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const deleteMessagesByChatId = (userId: string, chatId: string) => {
    const query: any = {userId};
    if (chatId === 'default') {
        query.$or = [
            {chatId: 'default'},
            {chatId: {$exists: false}},
            {chatId: null}
        ];
    } else {
        query.chatId = chatId;
    }
    return ChatMessage.deleteMany(query);
};

export const updateChatTitle = (userId: string, chatId: string, title: string) => {
    const query: any = {userId};
    if (chatId === 'default') {
        query.$or = [
            {chatId: 'default'},
            {chatId: {$exists: false}},
            {chatId: null}
        ];
    } else {
        query.chatId = chatId;
    }
    return ChatMessage.updateMany(query, {chatTitle: title});
};

export const createMessage = (data: {
    userId: string;
    role: string;
    content: string;
    chatId: string;
    chatTitle: string;
    timestamp: Date;
}) => ChatMessage.create(data);

export const deleteMessagesByUserIds = (userIds: string[]) =>
    ChatMessage.deleteMany({userId: {$in: userIds}});

export const findAllMessagesByUser = (userId: string) =>
    ChatMessage.find({userId}).sort({timestamp: 1});
