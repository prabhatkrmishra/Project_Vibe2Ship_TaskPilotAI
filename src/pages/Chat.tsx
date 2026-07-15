import {useState, useRef, useEffect} from 'react';
import {useAuth} from '../lib/AuthContext';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '../components/ui/select';
import {Send, Bot, Mic, Loader2, Sparkles, Plus, Trash2, History, Edit2, Check, X, MessageSquare} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ReactMarkdown from 'react-markdown';
import {showSuccess, showError, showWarning} from '../lib/toastTheme';
import {Task} from '../types';
import {safeJson} from '../lib/utils';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: any;
    isError?: boolean;
}

export function Chat() {
    const {user} = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessions, setSessions] = useState<{
        chatId: string;
        title: string;
        timestamp: string;
        messagesCount: number
    }[]>([]);
    const [activeChatId, setActiveChatId] = useState<string>(() => {
        return localStorage.getItem('active_chat_id') || 'default';
    });
    const [activeChatTitle, setActiveChatTitle] = useState<string>('New Chat');
    const [isDeletingSession, setIsDeletingSession] = useState<string | null>(null);

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameTitleInput, setRenameTitleInput] = useState('');
    const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);

    const [tasks, setTasks] = useState<Task[]>([]);
    const [goals, setGoals] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<Message[]>([]);
    // Keep messagesRef in sync with messages state to avoid stale closures in handleSend
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | null>(null);

    const drawVisualizer = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;

        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);

            canvasCtx.fillStyle = 'rgba(13, 17, 23, 0.2)';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            canvasCtx.lineWidth = 3;
            canvasCtx.strokeStyle = '#f87171'; // red-400
            canvasCtx.beginPath();

            const sliceWidth = (canvas.width * 1.0) / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * canvas.height) / 2;

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        };

        draw();
    };

    const toggleRecording = async () => {
        if (isRecording) {
            stopRecording();
            return;
        }

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            showError("Speech recognition is not supported in this browser.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            streamRef.current = stream;

            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;

            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;

            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onstart = () => {
                setIsRecording(true);
                setTimeout(drawVisualizer, 100);
            };

            let finalTranscript = input ? input + ' ' : '';

            recognition.onresult = (e: any) => {
                let interimTranscript = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal) {
                        finalTranscript += e.results[i][0].transcript + ' ';
                    } else {
                        interimTranscript += e.results[i][0].transcript;
                    }
                }
                setInput(finalTranscript + interimTranscript);
            };

            recognition.onerror = (e: any) => {
                console.error('Speech recognition error', e.error);
                stopRecording();

                let errorDesc = "An error occurred with Speech Recognition.";
                if (e.error === 'not-allowed') {
                    errorDesc = "Microphone access was denied. Please check your browser permissions.";
                } else if (e.error === 'network') {
                    errorDesc = "Speech recognition network error. The browser speech-to-text service is temporarily unavailable or cannot be reached from this sandboxed preview iframe. Please open the app in a new tab for full microphone features.";
                } else if (e.error === 'aborted') {
                    return; // Suppress spam if aborted normally
                } else if (e.error === 'no-speech') {
                    errorDesc = "No speech was detected. Please make sure your microphone is working and speak clearly.";
                } else {
                    errorDesc = `Speech recognition error: ${e.error || 'unknown'}`;
                }

                // Add speech recognition error as an assistant message with error flag
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `⚠️ **Speech Recognition Error**: ${errorDesc}`,
                    isError: true,
                    timestamp: new Date().toISOString()
                }]);
                showError(errorDesc);
            };

            recognition.onend = () => {
                stopRecording();
            };

            recognition.start();
        } catch (err) {
            console.error("Microphone access error:", err);
            showError("Could not access microphone for visualization.");
        }
    };

    const stopRecording = () => {
        setIsRecording(false);
        recognitionRef.current?.stop();

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isSending]);

    const [models, setModelsList] = useState<{
        name: string;
        displayName: string;
        provider: string;
        available: boolean
    }[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return localStorage.getItem('default_gemini_model') || 'gemini-3.1-flash-lite';
    });
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    useEffect(() => {
        const fetchModels = async () => {
            if (!user) return;
            setIsLoadingModels(true);
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/models', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (res.ok) {
                    const data = await safeJson(res);
                    setModelsList(data);

                    // If the currently saved model is unavailable or missing, pick an available fallback
                    const isSelectedAvailable = data.some((m: any) => m.name === selectedModel && m.available);
                    if (!isSelectedAvailable && data.length > 0) {
                        const defaultModel = data.find((m: any) => m.available && m.name.includes('gemini-3.5-flash'))?.name
                            || data.find((m: any) => m.available)?.name
                            || selectedModel;
                        setSelectedModel(defaultModel);
                        localStorage.setItem('default_gemini_model', defaultModel);
                    }
                }
            } catch (error) {
                console.error("Failed to load models:", error);
            } finally {
                setIsLoadingModels(false);
            }
        };

        fetchModels();
    }, [user]);

    const handleModelChange = (value: string) => {
        setSelectedModel(value);
        localStorage.setItem('default_gemini_model', value);
        const displayName = models.find(m => m.name === value)?.displayName || value;
        showSuccess(`Active AI Model changed to: ${displayName}`);
    };

    const fetchSessions = async (overrideActiveChatId?: string) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/chats/sessions', {
                headers: {'Authorization': `Bearer ${token}`}
            });
            if (res.ok) {
                const data = await safeJson(res);
                const currentId = overrideActiveChatId !== undefined ? overrideActiveChatId : activeChatId;

                let sessionsList = [...data];
                const exists = sessionsList.some((s: any) => s.chatId === currentId);
                if (!exists && currentId !== 'default') {
                    sessionsList.unshift({
                        chatId: currentId,
                        title: currentId === 'default' ? 'Default Chat' : 'New Chat',
                        timestamp: new Date().toISOString(),
                        messagesCount: 0
                    });
                }
                setSessions(sessionsList);

                // Find and set current active chat's title
                const current = sessionsList.find((s: any) => s.chatId === currentId);
                if (current) {
                    setActiveChatTitle(current.title);
                } else if (currentId === 'default') {
                    setActiveChatTitle('Default Chat');
                } else {
                    setActiveChatTitle('New Chat');
                }
            }
        } catch (err) {
            console.error("Failed to fetch sessions:", err);
        }
    };

    const fetchAllData = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const headers = {'Authorization': `Bearer ${token}`};

            // Fetch messages for active chat
            const resChats = await fetch(`/api/chats?chatId=${activeChatId}`, {headers});
            if (resChats.ok) {
                const chatsData = await safeJson(resChats);
                setMessages(chatsData);
            }

            // Fetch sessions list
            fetchSessions(activeChatId);

            // Fetch tasks
            const resTasks = await fetch('/api/tasks', {headers});
            if (resTasks.ok) {
                const tasksData = await safeJson(resTasks);
                const pendingTasks = tasksData.filter((t: any) => t.status === 'pending' || t.status === 'in_progress');
                setTasks(pendingTasks);
            }

            // Fetch goals
            const resGoals = await fetch('/api/goals', {headers});
            if (resGoals.ok) {
                const goalsData = await safeJson(resGoals);
                setGoals(goalsData);
            }
        } catch (err) {
            console.error("Failed to fetch chat dashboard data:", err);
        }
    };

    useEffect(() => {
        if (user) {
            fetchAllData();
        }
    }, [user, activeChatId]);

    const handleStartNewChat = () => {
        const newId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        setActiveChatId(newId);
        setActiveChatTitle('New Chat');
        setMessages([]);
        localStorage.setItem('active_chat_id', newId);
        showSuccess("Started a new conversation session");

        // Add to sessions list provisionally so it shows in the dropdown
        setSessions(prev => [
            {chatId: newId, title: 'New Chat', timestamp: new Date().toISOString(), messagesCount: 0},
            ...prev
        ]);
    };

    const handleSelectSession = (chatId: string) => {
        setActiveChatId(chatId);
        localStorage.setItem('active_chat_id', chatId);
        const session = sessions.find(s => s.chatId === chatId);
        if (session) {
            setActiveChatTitle(session.title);
        } else {
            setActiveChatTitle(chatId === 'default' ? 'Default Chat' : 'New Chat');
        }
        setIsRenaming(false); // cancel renaming if we switch chats
        showSuccess("Switched conversation session");
    };

    const startRenameMode = () => {
        setRenameTitleInput(activeChatTitle);
        setIsRenaming(true);
    };

    const handleRenameSession = async () => {
        const trimmed = renameTitleInput.trim();
        if (!trimmed) {
            showError("Title cannot be empty");
            return;
        }
        if (!user) return;
        setIsUpdatingTitle(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/chats/sessions/${activeChatId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({title: trimmed})
            });
            if (res.ok) {
                showSuccess("Chat renamed successfully");
                setActiveChatTitle(trimmed);
                setIsRenaming(false);
                fetchSessions(activeChatId);
            } else {
                showError("Failed to rename chat session");
            }
        } catch (err) {
            console.error(err);
            showError("An error occurred while renaming chat session");
        } finally {
            setIsUpdatingTitle(false);
        }
    };

    const handleDeleteSession = async (chatId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent select action
        if (!user) return;

        setIsDeletingSession(chatId);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/chats/sessions/${chatId}`, {
                method: 'DELETE',
                headers: {'Authorization': `Bearer ${token}`}
            });
            if (res.ok) {
                showSuccess("Conversation deleted successfully");
                // If we deleted the active chat, switch to default or another
                if (activeChatId === chatId) {
                    const nextSession = sessions.find(s => s.chatId !== chatId);
                    const nextId = nextSession?.chatId || 'default';
                    setActiveChatId(nextId);
                    localStorage.setItem('active_chat_id', nextId);
                } else {
                    // If we deleted some other chat, just refresh sessions
                    fetchSessions(activeChatId);
                }
            } else {
                showError("Failed to delete session");
            }
        } catch (err) {
            console.error(err);
            showError("An error occurred while deleting session");
        } finally {
            setIsDeletingSession(null);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !user) return;

        // Guard: don't send with an unavailable model
        if (models.length > 0 && !models.some(m => m.name === selectedModel && m.available)) {
            showError('Selected AI model is not available. Please pick a different model.');
            return;
        }

        const userMsg = input.trim();
        setInput('');
        setIsSending(true);

        // Calculate new title if this is the first message
        let updatedTitle = activeChatTitle;
        const isNewSession = messages.length === 0 || activeChatTitle === 'New Chat';
        if (isNewSession) {
            updatedTitle = userMsg.substring(0, 40) + (userMsg.length > 40 ? '...' : '');
            setActiveChatTitle(updatedTitle);
        }

        try {
            const token = await user.getIdToken();
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            // Add user message to MongoDB
            const userMsgRes = await fetch('/api/chats', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    role: 'user',
                    content: userMsg,
                    chatId: activeChatId,
                    chatTitle: updatedTitle
                })
            });

            let savedUserMsg: Message = {role: 'user', content: userMsg};
            if (userMsgRes.ok) {
                savedUserMsg = await userMsgRes.json();
            }
            setMessages(prev => [...prev, savedUserMsg]);

            const cleanMessages = messagesRef.current.map(m => ({
                role: m.role,
                content: m.content
            }));
            cleanMessages.push({role: 'user', content: userMsg});

            const cleanTasks = tasks.map(t => ({
                title: t.title,
                description: t.description || '',
                status: t.status,
                priority: t.priority,
                estimatedHours: t.estimatedHours || 0,
                deadline: t.deadline || null
            }));

            const cleanGoals = goals.map(g => ({
                title: g.title,
                type: g.type === 'quest' ? 'Quest' : 'Habit',
                description: g.description || '',
                progress: g.progress,
                streak: g.type === 'habit' ? (g.streak || 0) : undefined,
                completed: g.completed,
                targetDate: g.targetDate || null
            }));

            const cleanQuests = cleanGoals.filter(g => g.type === 'Quest');
            const cleanHabits = cleanGoals.filter(g => g.type === 'Habit');

            const getLocalYYYYMMDD = (d = new Date()) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: cleanMessages,
                    context: {
                        tasks: cleanTasks,
                        quests: cleanQuests,
                        habits: cleanHabits
                    },
                    model: selectedModel,
                    localDateStr: getLocalYYYYMMDD(),
                    localTimeStr: new Date().toLocaleTimeString()
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                let friendlyError = 'The neural network is currently offline. Please try switching models.';

                if (errData && errData.error) {
                    const rawErr = errData.error;
                    if (typeof rawErr === 'string') {
                        try {
                            if (rawErr.trim().startsWith('{')) {
                                const parsed = JSON.parse(rawErr);
                                friendlyError = parsed.error?.message || parsed.message || rawErr;
                            } else {
                                friendlyError = rawErr;
                            }
                        } catch (e) {
                            friendlyError = rawErr;
                        }
                    } else if (typeof rawErr === 'object') {
                        friendlyError = rawErr.message || rawErr.error?.message || JSON.stringify(rawErr);
                    }
                }

                // Add assistant error message to DB
                const errorMsgRes = await fetch('/api/chats', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        role: 'assistant',
                        content: `⚠️ **Service Error**: ${friendlyError}`,
                        chatId: activeChatId,
                        chatTitle: updatedTitle
                    })
                });
                const savedErrorMsg = errorMsgRes.ok ? await errorMsgRes.json() : {
                    role: 'assistant' as const,
                    content: `⚠️ **Service Error**: ${friendlyError}`
                };
                setMessages(prev => [...prev, {...savedErrorMsg, isError: true}]);
                fetchSessions(activeChatId);
                showError(friendlyError);
                return;
            }

            const data = await res.json();

            if (data.planUpdated) {
                showSuccess("📅 Custom timetable updated on your Command Center!", {
                    duration: 6000,
                    description: "Your daily execution plan has been updated according to your instructions."
                });
            }

            if (data.quotaExceeded) {
                const exhaustedModel = (data.quotaModel || selectedModel || '').split('/').pop();
                const fallbackCandidate = models.find((m) => m.name !== selectedModel)?.name;
                showWarning(
                    exhaustedModel
                        ? `"${exhaustedModel}" has hit its API quota limit. Switch to a different AI brain to keep going without interruptions.`
                        : `Your current AI model has hit its API quota limit. Switch to a different AI brain to keep going without interruptions.`,
                    fallbackCandidate
                        ? {action: {label: 'Switch AI Model', onClick: () => handleModelChange(fallbackCandidate)}}
                        : undefined
                );
            }

            // Add assistant message to DB
            const assistantMsgRes = await fetch('/api/chats', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    role: 'assistant',
                    content: data.text || 'No response generated.',
                    chatId: activeChatId,
                    chatTitle: updatedTitle
                })
            });
            const savedAssistantMsg = assistantMsgRes.ok ? await assistantMsgRes.json() : {
                role: 'assistant' as const,
                content: data.text || 'No response generated.'
            };
            setMessages(prev => [...prev, savedAssistantMsg]);
            fetchSessions(activeChatId);
        } catch (error: any) {
            console.error(error);
            const fallbackError = error.message || 'Sorry, I encountered an error while thinking.';
            try {
                const token = await user.getIdToken();
                const headers = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                };
                const assistantMsgRes = await fetch('/api/chats', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        role: 'assistant',
                        content: `⚠️ **Connection Error**: ${fallbackError}`,
                        chatId: activeChatId,
                        chatTitle: updatedTitle
                    })
                });
                const savedAssistantMsg = assistantMsgRes.ok ? await assistantMsgRes.json() : {
                    role: 'assistant' as const,
                    content: `⚠️ **Connection Error**: ${fallbackError}`
                };
                setMessages(prev => [...prev, {...savedAssistantMsg, isError: true}]);
                fetchSessions(activeChatId);
            } catch (err) {
                console.error("Double failure during error logging:", err);
            }
            showError(fallbackError);
        } finally {
            setIsSending(false);
        }
    };

    const handleExtractJournal = async () => {
        if (!input.trim() || !user) return;

        // Guard: don't send with an unavailable model
        if (models.length > 0 && !models.some(m => m.name === selectedModel && m.available)) {
            showError('Selected AI model is not available. Please pick a different model.');
            return;
        }

        setIsSending(true);

        // Calculate new title if this is the first message
        let updatedTitle = activeChatTitle;
        const isNewSession = messages.length === 0 || activeChatTitle === 'New Chat';
        if (isNewSession) {
            updatedTitle = '[Journal] ' + input.substring(0, 30) + (input.length > 30 ? '...' : '');
            setActiveChatTitle(updatedTitle);
        }

        try {
            const token = await user.getIdToken();
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            const userMsgRes = await fetch('/api/chats', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    role: 'user',
                    content: `[Audio Journal] ${input}`,
                    chatId: activeChatId,
                    chatTitle: updatedTitle
                })
            });
            const savedUserMsg = userMsgRes.ok ? await userMsgRes.json() : {
                role: 'user' as const,
                content: `[Audio Journal] ${input}`
            };
            setMessages(prev => [...prev, savedUserMsg]);

            const currentInput = input;
            setInput('');

            const res = await fetch('/api/audio-journal', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    text: currentInput,
                    model: selectedModel
                })
            });

            if (!res.ok) {
                throw new Error('Failed to process journal');
            }

            const data = await res.json();

            const botResponse = `**Audio Journal Processed**\n\n${data.summary}\n\nI have extracted and automatically created **${data.createdTasks?.length || 0} tasks** from this reflection. You can find them on your dashboard.`;

            const assistantMsgRes = await fetch('/api/chats', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    role: 'assistant',
                    content: botResponse,
                    chatId: activeChatId,
                    chatTitle: updatedTitle
                })
            });
            const savedAssistantMsg = assistantMsgRes.ok ? await assistantMsgRes.json() : {
                role: 'assistant' as const,
                content: botResponse
            };

            setMessages(prev => [...prev, savedAssistantMsg]);
            fetchSessions(activeChatId);
            showSuccess(`Extracted ${data.createdTasks?.length || 0} tasks successfully!`);

        } catch (err: any) {
            console.error(err);
            showError(err.message || 'Error processing audio journal.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto h-full flex flex-col w-full animate-fade-in relative">
            {isRecording && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1117]/80 backdrop-blur-md">
                    <div
                        className="bg-[#161b22] border border-red-500/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center gap-6 w-[90%] max-w-md animate-fade-in relative overflow-hidden">
                        <div className="absolute inset-0 bg-red-500/5 pointer-events-none animate-pulse"/>

                        <div
                            className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_60px_rgba(239,68,68,0.4)]">
                            <Mic className="w-12 h-12 text-red-400"/>
                        </div>

                        <div className="text-center space-y-2 w-full z-10">
                            <h2 className="text-xl font-medium text-[#f0f6fc]">Listening...</h2>
                            <div
                                className="w-full h-24 bg-[#0d1117] rounded-2xl overflow-hidden border border-[#21262d] relative shadow-inner">
                                <canvas ref={canvasRef} width="400" height="100"
                                        className="w-full h-full object-cover opacity-80"/>
                            </div>
                            <p className="text-sm text-[#8b949e] line-clamp-3 overflow-hidden text-ellipsis px-2 min-h-[40px] mt-4">
                                {input || "Speak now..."}
                            </p>
                        </div>

                        <Button
                            type="button"
                            onClick={stopRecording}
                            className="mt-6 rounded-full px-12 h-14 bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 hover:text-red-300 font-bold tracking-wide transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] flex items-center gap-3 z-10"
                        >
                            <div className="w-3 h-3 rounded-sm bg-red-400 animate-pulse"/>
                            Stop Recording
                        </Button>
                    </div>
                </div>
            )}

            <div className="mb-6 flex flex-col gap-6">
                <PageHeader
                    icon={MessageSquare}
                    badge="Mission Control"
                    color="violet"
                    title="Pilot"
                    titleAccent="Intelligence"
                    description="Ask for schedule adjustments, task breakdowns, or productivity advice."
                />

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 w-full">
                    {/* Left group: New Chat & Chat History */}
                    <div className="flex flex-wrap items-end gap-3">
                        {/* New Chat Button */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                            <Button
                                onClick={handleStartNewChat}
                                className="h-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-indigo-600/10 px-4 font-medium"
                            >
                                <Plus className="w-4 h-4"/>
                                <span>New Chat</span>
                            </Button>
                        </div>

                        {/* Chat History Select with Rename/Delete controls */}
                        {isRenaming ? (
                            <div className="flex flex-col gap-1.5 shrink-0 w-full sm:w-64 md:w-72">
                                <label
                                    className="text-xs font-semibold text-amber-400 tracking-wider flex items-center gap-1.5 uppercase font-mono">
                                    <Edit2 className="w-3 h-3 text-amber-400 animate-pulse"/> Rename Current Session
                                </label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={renameTitleInput}
                                        onChange={(e) => setRenameTitleInput(e.target.value)}
                                        className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc] h-10 rounded-xl focus:ring-1 focus:ring-indigo-500 flex-1 px-3 text-sm"
                                        placeholder="Enter session name..."
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameSession();
                                            if (e.key === 'Escape') setIsRenaming(false);
                                        }}
                                        autoFocus
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={handleRenameSession}
                                        disabled={isUpdatingTitle}
                                        className="h-10 w-10 shrink-0 border-emerald-500/20 bg-[#0d1117] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl cursor-pointer transition-all"
                                        title="Save new title"
                                    >
                                        {isUpdatingTitle ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400"/>
                                        ) : (
                                            <Check className="w-4 h-4"/>
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setIsRenaming(false)}
                                        disabled={isUpdatingTitle}
                                        className="h-10 w-10 shrink-0 border-[#21262d] bg-[#0d1117] text-slate-400 hover:text-[#f0f6fc] rounded-xl cursor-pointer transition-all"
                                        title="Cancel"
                                    >
                                        <X className="w-4 h-4"/>
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-end gap-2 w-full sm:w-auto">
                                {/* Chat History Select */}
                                <div className="flex flex-col gap-1.5 w-full sm:w-48 md:w-52 min-w-[150px]">
                                    <label
                                        className="text-xs font-semibold text-slate-400 tracking-wider flex items-center gap-1.5 uppercase font-mono">
                                        <History className="w-3 h-3 text-violet-400"/> Chat History
                                    </label>
                                    <Select value={activeChatId} onValueChange={handleSelectSession}>
                                        <SelectTrigger
                                            className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc] h-10 rounded-xl focus:ring-1 focus:ring-indigo-500 w-full">
                                            <SelectValue placeholder="Select session">
                                                {(value: string) => {
                                                    const sess = sessions.find((s) => s.chatId === value);
                                                    return sess ? sess.title : (value === 'default' ? 'Default Chat' : 'New Chat');
                                                }}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent
                                            className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc] max-h-72">
                                            {sessions.length === 0 ? (
                                                <SelectItem value="default"
                                                            className="focus:bg-indigo-600/20 focus:text-indigo-200">
                                                    Default Chat
                                                </SelectItem>
                                            ) : (
                                                sessions.map((sess) => (
                                                    <SelectItem
                                                        key={sess.chatId}
                                                        value={sess.chatId}
                                                        className="focus:bg-indigo-600/20 focus:text-indigo-200"
                                                    >
                                                        <div className="flex items-center gap-2 py-0.5">
                                                            <span
                                                                className="truncate max-w-[120px] text-left block">{sess.title}</span>
                                                            <span
                                                                className="text-[10px] text-slate-500 font-mono">({sess.messagesCount})</span>
                                                        </div>
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Rename Button */}
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={startRenameMode}
                                    className="h-10 w-10 shrink-0 border-[#21262d] bg-[#0d1117] text-slate-400 hover:text-amber-400 hover:border-amber-500/30 rounded-xl cursor-pointer transition-all"
                                    title="Rename current session"
                                >
                                    <Edit2 className="w-4 h-4"/>
                                </Button>

                                {/* Delete Button (only if not default chat) */}
                                {activeChatId !== 'default' && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={(e) => handleDeleteSession(activeChatId, e)}
                                        disabled={isDeletingSession === activeChatId}
                                        className="h-10 w-10 shrink-0 border-[#21262d] bg-[#0d1117] text-slate-400 hover:text-rose-400 hover:border-rose-500/30 rounded-xl cursor-pointer transition-all"
                                        title="Delete current session"
                                    >
                                        {isDeletingSession === activeChatId ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-rose-400"/>
                                        ) : (
                                            <Trash2 className="w-4 h-4"/>
                                        )}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Active AI Brain Select */}
                    <div className="flex flex-col gap-1.5 shrink-0 w-full sm:w-48 md:w-52 md:ml-auto">
                        <label
                            className="text-xs font-semibold text-slate-400 tracking-wider flex items-center gap-1.5 uppercase font-mono">
                            <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse"/> Active AI Brain
                        </label>
                        <Select value={selectedModel} onValueChange={handleModelChange} disabled={isLoadingModels}>
                            <SelectTrigger
                                className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc] h-10 rounded-xl focus:ring-1 focus:ring-indigo-500 w-full">
                                <SelectValue placeholder={isLoadingModels ? "Syncing core brains..." : "Choose model"}>
                                    {(value: string) => {
                                        if (isLoadingModels) return "Syncing core brains...";
                                        const m = models.find(m => m.name === value);
                                        return m ? m.displayName : (value ? value.replace(/^models\//, '') : "Choose model");
                                    }}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent
                                className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc] max-h-80 overflow-y-auto">
                                {isLoadingModels ? (
                                    <div className="flex items-center justify-center p-4">
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mr-2"/>
                                        <span className="text-xs text-slate-400">Querying brain nodes...</span>
                                    </div>
                                ) : (
                                    (() => {
                                        // Group models by provider
                                        const grouped = new Map<string, typeof models>();
                                        for (const m of models) {
                                            const provider = m.provider || 'Unknown';
                                            if (!grouped.has(provider)) grouped.set(provider, []);
                                            grouped.get(provider)!.push(m);
                                        }
                                        return Array.from(grouped.entries()).map(([provider, providerModels]) => (
                                            <div key={provider}>
                                                <div
                                                    className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-500 bg-[#161b22] sticky top-0 z-10">
                                                    {provider}
                                                </div>
                                                {providerModels.map((model) => (
                                                    <SelectItem
                                                        key={model.name}
                                                        value={model.name}
                                                        disabled={!model.available}
                                                        className="focus:bg-indigo-600/20 focus:text-indigo-200"
                                                    >
                                                        <span
                                                            className={!model.available ? 'opacity-40' : ''}>{model.displayName}</span>
                                                        {!model.available &&
                                                            <span className="ml-1.5 text-[9px] text-slate-500">(set key in .env)</span>}
                                                    </SelectItem>
                                                ))}
                                            </div>
                                        ));
                                    })()
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div
                className="flex-1 flex flex-col min-h-0 bg-[#0d1117] border border-[#21262d] rounded-3xl overflow-hidden shadow-2xl">
                <div className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
                    <div
                        className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-transparent"
                        ref={scrollRef}>
                        <div className="space-y-6">
                            {messages.map((msg, i) => {
                                const isMsgError = msg.isError || msg.content.startsWith('⚠️') || msg.content.includes('Speech Recognition Error') || msg.content.includes('experiencing high demand') || msg.content.includes('UNAVAILABLE') || msg.content.includes('quota exceeded');
                                return (
                                    <div key={i}
                                         className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                msg.role === 'user'
                                                    ? 'bg-indigo-500/20 text-indigo-400 font-bold text-[10px] uppercase border border-indigo-500/30'
                                                    : isMsgError
                                                        ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                                                        : 'bg-[#161b22] border border-[#21262d]'
                                            }`}>
                                            {msg.role === 'user' ? 'YOU' : <Bot
                                                className={`w-4 h-4 ${isMsgError ? 'text-red-400' : 'text-cyan-400'}`}/>}
                                        </div>
                                        <div className={`max-w-[80%] px-5 py-3 ${
                                            msg.role === 'user'
                                                ? 'bg-indigo-600/20 text-indigo-50 border border-indigo-500/30 rounded-2xl rounded-tr-none'
                                                : isMsgError
                                                    ? 'bg-red-950/40 border-l-2 border-red-500 text-red-100 border border-red-500/20 rounded-2xl rounded-tl-none shadow-md shadow-red-500/5'
                                                    : 'bg-slate-800/60 border-l-2 border-cyan-500/30 rounded-2xl rounded-tl-none'
                                        }`}>
                                            {msg.role === 'user' ? (
                                                <p className="text-sm">{msg.content}</p>
                                            ) : (
                                                <div
                                                    className={`prose prose-sm prose-invert max-w-none text-sm markdown-body ${isMsgError ? 'text-red-200' : 'text-[#f0f6fc]'}`}>
                                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                </div>
                                            )}
                                            <span
                                                className="text-[10px] text-slate-500 font-data mt-2 block text-right opacity-70">
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                        }) : new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                      </span>
                                        </div>
                                    </div>
                                );
                            })}
                            {isSending && (
                                <div className="flex gap-4">
                                    <div
                                        className="w-8 h-8 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center shrink-0">
                                        <Bot className="w-4 h-4 text-cyan-400"/>
                                    </div>
                                    <div
                                        className="bg-slate-800/60 border-l-2 border-cyan-500/30 rounded-2xl rounded-tl-none px-5 py-3 flex items-center h-[46px]">
                                        <div className="flex gap-1 py-1">
                                            {[0, 1, 2].map(i => (
                                                <div key={i}
                                                     className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                                                     style={{animationDelay: `${i * 0.15}s`}}/>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef}/>
                        </div>
                    </div>

                    <div className="p-4 border-t border-[#21262d] bg-[#0d1117] shrink-0">
                        <div className="flex gap-2 overflow-x-auto mb-3 pb-2 scrollbar-hide">
                            {['What should I work on next?', 'Can I finish before tomorrow?', 'Replan my schedule.', 'What is blocking my progress?'].map(suggestion => (
                                <button
                                    key={suggestion}
                                    onClick={() => setInput(suggestion)}
                                    className="px-3 py-1.5 text-xs bg-[#161b22] text-[#8b949e] rounded-lg hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors whitespace-nowrap border border-[#21262d]"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                        <form onSubmit={handleSend} className="flex gap-2 relative">
                            <Button
                                type="button"
                                variant="outline"
                                className={`transition-all rounded-xl ${isRecording ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] scale-105' : 'bg-[#161b22] border-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]'}`}
                                onClick={toggleRecording}
                                title={isRecording ? "Stop recording" : "Start recording"}
                            >
                                <Mic
                                    className={`w-4 h-4 ${isRecording ? 'animate-[pulse_1s_ease-in-out_infinite]' : ''}`}/>
                            </Button>
                            <Input
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder="E.g. What should I prioritize this afternoon?"
                                className="flex-1 bg-[#161b22] border-[#21262d] text-[#f0f6fc] placeholder:text-slate-500 rounded-xl"
                                disabled={isSending}
                            />
                            <Button
                                type="button"
                                onClick={handleExtractJournal}
                                disabled={isSending || !input.trim()}
                                title="Extract Tasks from Journal"
                                className="bg-[#161b22] border border-[#21262d] text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 rounded-xl"
                            >
                                <Sparkles className="w-4 h-4"/>
                            </Button>
                            <Button type="submit" disabled={isSending || !input.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20">
                                <Send className="w-4 h-4"/>
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
