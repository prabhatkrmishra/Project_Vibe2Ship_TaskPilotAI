import {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {motion} from 'motion/react';
import {useAuth} from '../lib/AuthContext';
import {Task, DailyPlan, Goal} from '../types';
import {
    Loader2,
    Sparkles,
    CheckCircle2,
    PlayCircle,
    AlertTriangle,
    Info,
    CalendarCheck,
    Mic
} from 'lucide-react';
import {toast} from 'sonner';
import {createCalendarEvent} from '../lib/workspace';
import {SessionToastCard, showSuccess, showError, showWarning, showInfoToast} from '../lib/toastTheme';
import {TaskSelectionModal} from '../components/TaskSelectionModal';
import {useAIJobs} from '../lib/AIJobContext';
import {tasksApi} from '../api/tasks';
import {goalsApi} from '../api/goals';
import {plansApi} from '../api/plans';

import {SessionBlock} from '../features/timetable/components/SessionBlock';
import {DayHeader} from '../features/timetable/components/DayHeader';
import {EmptyState} from '../features/timetable/components/EmptyState';
import {PlanActions} from '../features/timetable/components/PlanActions';
import {TimeGrid} from '../features/timetable/components/TimeGrid';
import {ReplanDialog} from '../features/timetable/components/ReplanDialog';
import {SessionEditor} from '../features/timetable/components/SessionEditor';
import {exportICS} from '../features/timetable/lib/exportICS';
import {exportDoc, printTimetable} from '../features/timetable/lib/exportDoc';
import {isoToTimeStr, formatTime, getTodayISO, formatDateLong, formatDate} from '@/lib/time.ts';

const DAY_PRESETS = [
    {
        title: "☀️ Early Bird Elite",
        desc: "Wake at 5:30 AM, intensive morning deep work, standard work hours, healthy sleep by 10:00 PM.",
        prompt: "I am an early bird. I wake up at 05:30 AM, love exercising in the morning, do my best deep work before lunch, have a lunch break at 12:30 PM, a brief afternoon review, and wind down to sleep by 10:00 PM."
    },
    {
        title: "🌙 Night Owl Builder",
        desc: "Sleep late & wake at 9:00 AM, creative and admin afternoon, peak focus from 9 PM to 1 AM.",
        prompt: "I am a night owl. I sleep late and wake up around 09:00 AM. I refresh and plan in the late morning, have lunch at 1:30 PM, focus in the afternoon, dinner at 8:30 PM, and have my most productive deep work blocks from 9:30 PM to 12:30 AM."
    },
    {
        title: "🏡 Remote Worker",
        desc: "Wake at 7:30 AM, standard 9-5 deep work blocks, clear separation of work and family/recreation.",
        prompt: "I work remotely. I wake up at 07:30 AM, have a healthy morning routine with breakfast, work focused hours from 09:00 AM to 05:00 PM with lunch at 12:00 PM, exercise at 05:30 PM, dinner at 07:30 PM, and sleep at 11:00 PM."
    },
    {
        title: "⚡ Peak Fitness",
        desc: "Wake at 6:30 AM, heavy focus on physical training, nutrition, and disciplined focus.",
        prompt: "I have a highly active athletic style. Wake up at 06:30 AM, morning cardio, deep focus work in late morning and afternoon, weight training at 05:00 PM, high protein dinner at 07:30 PM, reflection, and sleep at 10:30 PM."
    }
];

export function Timetable() {
    const {user, requestWorkspaceAccess} = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [plan, setPlan] = useState<DailyPlan | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [dayDescription, setDayDescription] = useState<string>('');
    const [showConfig, setShowConfig] = useState<boolean>(false);
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    const [showRescheduleModal, setShowRescheduleModal] = useState(false);
    const [rescheduleBanner, setRescheduleBanner] = useState<'idle' | 'in-progress' | 'success' | 'error'>('idle');
    const {startJob, endJob, isJobRunning, bumpPlanVersion} = useAIJobs();
    const isJobActive = isJobRunning('generate-plan');
    const [pendingReplan, setPendingReplan] = useState<{ customDesc?: string; tasksOverride?: Task[] } | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!actionsMenuOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
                setActionsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [actionsMenuOpen]);

    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editStartTime, setEditStartTime] = useState('');
    const [editEndTime, setEditEndTime] = useState('');
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
    const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null);
    const [, setClockTick] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => setClockTick((t) => t + 1), 30000);
        return () => window.clearInterval(id);
    }, []);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    const autoRefreshedForDateRef = useRef<string>('');
    const lastScheduledTaskIdsRef = useRef<Set<string>>(new Set());

    const handleStartEdit = (idx: number, session: any) => {
        setEditingIndex(idx);
        setEditTitle(session.taskTitle || '');
        setEditStartTime(isoToTimeStr(session.startTime));
        setEditEndTime(isoToTimeStr(session.endTime));
    };

    const handleStartAdd = (prepopulatedStartTime?: string, prepopulatedEndTime?: string) => {
        setEditingIndex(-1);
        setEditTitle('');
        setEditStartTime(prepopulatedStartTime || "08:00");
        setEditEndTime(prepopulatedEndTime || "09:00");
    };

    const today = getTodayISO();

    const saveSessions = async (
        updatedSessions: any[],
        rollbackPlan?: DailyPlan | null,
        options?: { successMessage?: string; suppressSuccessToast?: boolean }
    ) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/plans/${today}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({sessions: updatedSessions})
            });
            if (res.ok) {
                const updatedPlan = await res.json();
                setPlan(updatedPlan);
                if (!options?.suppressSuccessToast) {
                    showInfoToast('emerald', <CheckCircle2
                        className="w-5 h-5"/>, "Synced", options?.successMessage || "Timetable updated and synchronized!");
                }
            } else {
                if (rollbackPlan) setPlan(rollbackPlan);
                showInfoToast('red', <AlertTriangle
                    className="w-5 h-5"/>, "Sync failed", "Failed to sync updated timetable with server.");
            }
        } catch (err) {
            console.error("Error syncing timetable:", err);
            if (rollbackPlan) setPlan(rollbackPlan);
            showInfoToast('red', <AlertTriangle
                className="w-5 h-5"/>, "Network error", "Could not reach the server to sync your timetable.");
        }
    };

    const handleSaveSlot = async () => {
        if (!plan) return;
        if (!editTitle.trim()) {
            showInfoToast('amber', <AlertTriangle
                className="w-5 h-5"/>, "Title required", "Please enter a title for the session.");
            return;
        }

        let startISO = `${today}T${editStartTime}:00.000`;
        let endISO = `${today}T${editEndTime}:00.000`;
        if (editEndTime < editStartTime) {
            const tomorrowDate = new Date();
            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
            const tomorrowStr = formatDate(tomorrowDate.toISOString());
            endISO = `${tomorrowStr}T${editEndTime}:00.000`;
        }

        let updatedSessions = [...plan.sessions];
        const isNewSession = editingIndex === -1;

        if (editingIndex === -1) {
            updatedSessions.push({
                taskId: "",
                taskTitle: editTitle.trim(),
                startTime: startISO,
                endTime: endISO
            });
        } else if (editingIndex !== null && editingIndex >= 0) {
            updatedSessions[editingIndex] = {
                ...updatedSessions[editingIndex],
                taskId: updatedSessions[editingIndex].taskId || "",
                taskTitle: editTitle.trim(),
                startTime: startISO,
                endTime: endISO,
                sessionLabel: undefined
            };
        }

        updatedSessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        setEditingIndex(null);
        await saveSessions(updatedSessions, undefined, {
            successMessage: isNewSession
                ? `"${editTitle.trim()}" added to your timetable!`
                : `"${editTitle.trim()}" updated!`
        });
    };

    const handleDeleteSlot = async (idx: number) => {
        if (!plan) return;
        const removedTitle = plan.sessions[idx]?.taskTitle;
        const updatedSessions = plan.sessions.filter((_, i) => i !== idx);
        await saveSessions(updatedSessions, undefined, {
            successMessage: removedTitle ? `"${removedTitle}" removed from your timetable.` : "Session removed from your timetable."
        });
    };

    const handleDragStart = (e: React.DragEvent, idx: number) => {
        setDraggedIdx(idx);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (idx !== dragOverIdx) {
            setDragOverIdx(idx);
        }
    };

    const handleDrop = async (fromIdx: number, toIdx: number) => {
        if (fromIdx === null || fromIdx === toIdx || !plan) {
            setDraggedIdx(null);
            setDragOverIdx(null);
            return;
        }

        const updatedSessions = [...plan.sessions];
        const [removed] = updatedSessions.splice(fromIdx, 1);
        updatedSessions.splice(toIdx, 0, removed);

        const originalTimes = plan.sessions.map(s => ({startTime: s.startTime, endTime: s.endTime}));
        const finalSessions = updatedSessions.map((session, index) => ({
            ...session,
            startTime: originalTimes[index].startTime,
            endTime: originalTimes[index].endTime
        }));

        setDraggedIdx(null);
        setDragOverIdx(null);
        await saveSessions(finalSessions, undefined, {successMessage: "Timetable reordered!"});
    };

    const handleDragEnd = () => {
        setDraggedIdx(null);
        setDragOverIdx(null);
    };

    const handleDropEvent = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (draggedIdx === null) return;
        handleDrop(draggedIdx, idx);
    };

    const handleMobileReorder = async (fromIdx: number, toIdx: number) => {
        if (!plan || fromIdx < 0 || toIdx < 0 || fromIdx >= plan.sessions.length || toIdx >= plan.sessions.length) return;
        const updatedSessions = [...plan.sessions];
        const [removed] = updatedSessions.splice(fromIdx, 1);
        updatedSessions.splice(toIdx, 0, removed);
        const originalTimes = plan.sessions.map(s => ({startTime: s.startTime, endTime: s.endTime}));
        const finalSessions = updatedSessions.map((session, index) => ({
            ...session,
            startTime: originalTimes[index].startTime,
            endTime: originalTimes[index].endTime
        }));
        await saveSessions(finalSessions, undefined, {successMessage: "Timetable reordered!"});
    };

    const fetchTimetableData = async () => {
        if (!user) return;
        try {
            const [tasksData, goalsData, planData] = await Promise.all([
                tasksApi.list() as Promise<any[]>,
                goalsApi.list() as Promise<Goal[]>,
                plansApi.get(today).catch(() => null)
            ]);

            setGoals(goalsData);

            if (planData) {
                setPlan(planData);
            } else {
                setPlan(null);
            }

            const allTasks = tasksData as Task[];
            const pending = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress' || t.status === 'todo');
            setTasks(pending);
            setCompletedTasks(allTasks.filter(t => t.status === 'completed'));
        } catch (err) {
            console.error("Error loading timetable data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchTimetableData();
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;
        if (!autoRefreshedForDateRef.current) {
            autoRefreshedForDateRef.current = today;
            return;
        }
        if (autoRefreshedForDateRef.current === today) return;
        autoRefreshedForDateRef.current = today;
        handleDayRollover();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [today, user]);

    const handleDayRollover = async () => {
        if (!user) return;
        try {
            const [tasksData, planData] = await Promise.all([
                tasksApi.list() as Promise<any[]>,
                plansApi.get(today).catch(() => null)
            ]);

            let freshTasks: Task[] = [];
            const allTasks = tasksData as Task[];
            freshTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress' || t.status === 'todo');
            setTasks(freshTasks);
            setCompletedTasks(allTasks.filter(t => t.status === 'completed'));

            let hasPlanForToday = false;
            let planRes: DailyPlan | null = null;
            if (planData) {
                planRes = planData;
                hasPlanForToday = !!(planRes && planRes.sessions && planRes.sessions.length > 0);
                setPlan(planRes);
            } else {
                setPlan(null);
            }

            if (!hasPlanForToday) {
                showInfoToast(
                    'indigo',
                    <Sparkles className="w-5 h-5"/>,
                    "New day, new timetable",
                    freshTasks.length > 0
                        ? "Building today's timetable from your remaining tasks and quests..."
                        : "No pending tasks or quests — generating a general daily routine..."
                );
                await regenerateFullTimetable(dayDescription || undefined, freshTasks);
            } else {
                lastScheduledTaskIdsRef.current = new Set(freshTasks.map(t => t.id));
            }
        } catch (err) {
            console.error("Error auto-refreshing timetable after midnight rollover:", err);
        }
    };

    const regenerateFullTimetable = (customDesc?: string, tasksOverride?: Task[]) => {
        const hasProgress = !!plan?.sessions?.some((s: any) => s.completed || s.started);
        if (hasProgress) {
            setPendingReplan({customDesc, tasksOverride});
            return;
        }
        performRegenerateFullTimetable(customDesc, tasksOverride);
    };

    const performRegenerateFullTimetable = async (customDesc?: string, tasksOverride?: Task[]) => {
        setIsGenerating(true);
        const descToUse = customDesc !== undefined ? customDesc : dayDescription;
        const tasksToUse = tasksOverride !== undefined ? tasksOverride : tasks;
        try {
            const selectedModel = localStorage.getItem('default_gemini_model') || 'gemini-3.1-flash-lite';
            await plansApi.runPipeline({
                eventName: 'Manual Replan Request',
                eventDetail: 'User requested a forced replan of the schedule with custom preferences.',
                tasks: tasksToUse,
                model: selectedModel,
                dayDescription: descToUse || "Design a classic balanced high-discipline routine.",
                localDateStr: today,
                localTimeStr: new Date().toLocaleTimeString()
            });

            showInfoToast('cyan', <Sparkles
                className="w-5 h-5"/>, "Timetable regenerated", "Gemini has customized your daily timetable!");
            await fetchTimetableData();
            bumpPlanVersion();
            lastScheduledTaskIdsRef.current = new Set(tasksToUse.map(t => t.id));
            setShowConfig(false);
        } catch (error: any) {
            console.error(error);
            showInfoToast('red', <AlertTriangle
                className="w-5 h-5"/>, "Replan failed", error.message || "Failed to generate plan");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRescheduleRoutine = async (selectedTasks?: Task[]) => {
        if (!plan || !plan.sessions || plan.sessions.length === 0) {
            showInfoToast('amber', <AlertTriangle
                className="w-5 h-5"/>, "No timetable yet", "Generate a timetable first before rescheduling sessions.");
            return;
        }

        const tasksToUse = selectedTasks || tasks;
        const currentIds = new Set(tasksToUse.map(t => t.id));
        const lastIds = lastScheduledTaskIdsRef.current;
        const sameTasks = currentIds.size === lastIds.size && [...currentIds].every(id => lastIds.has(id));
        if (sameTasks) {
            showInfoToast('amber', <Info
                className="w-5 h-5"/>, "Nothing to reschedule", "Same tasks already scheduled — no changes to reschedule.");
            return;
        }

        setIsRescheduling(true);
        setRescheduleBanner('in-progress');
        startJob('generate-plan', 'Rescheduling routine');
        try {
            const selectedModel = localStorage.getItem('default_gemini_model') || 'gemini-3.1-flash-lite';
            await plansApi.generatePlan({date: today, tasks: tasksToUse, model: selectedModel});

            setRescheduleBanner('success');
            lastScheduledTaskIdsRef.current = new Set(tasksToUse.map(t => t.id));
            await fetchTimetableData();
            bumpPlanVersion();
            setTimeout(() => setRescheduleBanner('idle'), 5000);
        } catch (error: any) {
            console.error(error);
            setRescheduleBanner('error');
            setTimeout(() => setRescheduleBanner('idle'), 5000);
            showInfoToast('red', <AlertTriangle
                className="w-5 h-5"/>, "Reschedule failed", error.message || "Failed to reschedule sessions.");
        } finally {
            setIsRescheduling(false);
            endJob('generate-plan');
        }
    };

    const drawVisualizer = useCallback(() => {
        if (!canvasRef.current || !streamRef.current) return;
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(streamRef.current);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);
            canvasCtx.fillStyle = 'rgba(13, 17, 23, 0.2)';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 3;
            canvasCtx.strokeStyle = '#818cf8';
            canvasCtx.beginPath();
            const sliceWidth = canvas.width / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * canvas.height) / 2;
                if (i === 0) canvasCtx.moveTo(x, y);
                else canvasCtx.lineTo(x, y);
                x += sliceWidth;
            }
            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        };
        draw();
    }, []);

    const stopRecording = useCallback(() => {
        setIsRecording(false);
        recognitionRef.current?.stop();
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
        audioContextRef.current = null;
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            stopRecording();
            return;
        }

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            showError("Not Supported", "Speech recognition is not supported in this browser.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            streamRef.current = stream;

            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onstart = () => {
                setIsRecording(true);
                setTimeout(drawVisualizer, 100);
            };

            let finalTranscript = dayDescription ? dayDescription + ' ' : '';
            recognition.onresult = (e: any) => {
                let interimTranscript = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
                    else interimTranscript += e.results[i][0].transcript;
                }
                setDayDescription(finalTranscript + interimTranscript);
            };

            recognition.onerror = (e: any) => {
                if (e.error === 'aborted') return;
                stopRecording();
                showError("Voice Error", e.error === 'not-allowed'
                    ? "Microphone access was denied. Please check browser permissions."
                    : e.error === 'no-speech'
                        ? "No speech detected. Please try again."
                        : `Speech recognition error: ${e.error || 'unknown'}`);
            };

            recognition.onend = () => stopRecording();
            recognition.start();
        } catch {
            showError("Microphone Error", "Could not access microphone.");
        }
    }, [isRecording, dayDescription, drawVisualizer, stopRecording]);

    const handleSyncCalendar = async () => {
        if (!plan || !plan.sessions || plan.sessions.length === 0) {
            showWarning("No Sessions", "No scheduled sessions to sync.");
            return;
        }

        setIsSyncingCalendar(true);
        try {
            const accessToken = await requestWorkspaceAccess();
            if (!accessToken) {
                showInfoToast('amber', <AlertTriangle
                    className="w-5 h-5"/>, "Calendar access needed", "Please authorize Google Calendar access to sync your timetable.");
                return;
            }

            const results = await Promise.allSettled(
                plan.sessions.map(session =>
                    createCalendarEvent(accessToken, {
                        summary: session.taskTitle,
                        start: session.startTime,
                        end: session.endTime,
                        description: "Synced from AI Pilot Daily Timetable."
                    })
                )
            );

            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failCount = results.length - successCount;

            if (failCount === 0) {
                showInfoToast('emerald', <CalendarCheck
                    className="w-5 h-5"/>, "Synced to Google Calendar", `${successCount} session${successCount === 1 ? '' : 's'} added to your Google Calendar for today.`);
            } else if (successCount === 0) {
                showInfoToast('red', <AlertTriangle
                    className="w-5 h-5"/>, "Sync failed", "Could not sync sessions to Google Calendar. Please check your Google account connection.");
            } else {
                showInfoToast('amber', <AlertTriangle
                    className="w-5 h-5"/>, "Partially synced", `${successCount} synced, ${failCount} failed. Please check your Google account connection.`);
            }
        } catch (error: any) {
            console.error("Error syncing to Google Calendar:", error);
            showInfoToast('red', <AlertTriangle
                className="w-5 h-5"/>, "Sync failed", error.message || "Could not sync your timetable to Google Calendar.");
        } finally {
            setIsSyncingCalendar(false);
        }
    };

    const getLocalDateString = () => {
        return formatDateLong(new Date().toISOString());
    };

    const handleMarkCompleted = async (index: number) => {
        if (!plan) return;
        const session = plan.sessions[index];

        let updatedSessions = [...plan.sessions];
        updatedSessions[index] = {...session, completed: true, started: true};
        const previousPlan = plan;
        setPlan({...plan, sessions: updatedSessions});

        try {
            const token = await user?.getIdToken();
            const res = await fetch(`/api/plans/${today}/complete-session`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({sessionIndex: index})
            });

            if (!res.ok) {
                setPlan(previousPlan);
                const err = await res.json().catch(() => ({error: 'Failed to complete session'}));
                toast.error(err.error || 'Failed to complete session');
                return;
            }

            const data = await res.json();

            if (data.gamificationUpdates?.xpEarned) {
                const {xpEarned, newBadges, levelUp} = data.gamificationUpdates;
                let msg = `+${xpEarned} XP`;
                if (levelUp) msg += ` — Level ${levelUp}!`;
                if (newBadges?.length) msg += ` Badge${newBadges.length > 1 ? 's' : ''}: ${newBadges.join(', ')}`;
                toast.success(msg);
            }

            if (data.questSync?.completed) {
                toast.success('Quest completed! +100 XP');
            }

            if (data.sessionGamification?.xpEarned) {
                if (!data.gamificationUpdates?.xpEarned) {
                    toast.success(`+${data.sessionGamification.xpEarned} XP for session`);
                }
            }

            fetchTimetableData();
            bumpPlanVersion();
        } catch (e) {
            setPlan(previousPlan);
            console.error(e);
            toast.error('Network error — session not completed');
        }
    };

    const jumpToSession = (index: number) => {
        const el = document.getElementById(`session-card-${index}`);
        if (el) {
            el.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
        setHighlightedIdx(index);
        window.setTimeout(() => setHighlightedIdx((current) => (current === index ? null : current)), 2200);
    };

    const handleStartSession = async (index: number) => {
        if (!plan) return;
        const session = plan.sessions[index];

        const activeSessionIdx = plan.sessions.findIndex((s, i) => i !== index && s.started && !s.completed);
        if (activeSessionIdx !== -1) {
            const activeTitle = plan.sessions[activeSessionIdx].taskTitle;
            toast.custom((t) => (
                <SessionToastCard
                    accent="amber"
                    icon={<PlayCircle className="w-5 h-5"/>}
                    heading="Session already in progress"
                    message={<><span className="text-amber-300 font-semibold">"{activeTitle}"</span> is still running.
                        Finish the current session before starting another.</>}
                    primaryLabel="Jump to session"
                    onPrimary={() => {
                        jumpToSession(activeSessionIdx);
                        toast.dismiss(t);
                    }}
                    onDismiss={() => toast.dismiss(t)}
                />
            ));
            return;
        }

        let updatedSessions = [...plan.sessions];
        updatedSessions[index] = {...session, started: true};

        const previousPlan = plan;
        setPlan({...plan, sessions: updatedSessions});
        await saveSessions(updatedSessions, previousPlan, {suppressSuccessToast: true});

        const durationMins = Math.max(1, Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000));
        const durationLabel = durationMins >= 60
            ? `${Math.floor(durationMins / 60)}h ${durationMins % 60 > 0 ? `${durationMins % 60}m` : ''}`.trim()
            : `${durationMins}m`;

        toast.custom((t) => (
            <SessionToastCard
                accent="cyan"
                icon={<PlayCircle className="w-5 h-5"/>}
                heading="Session started"
                message={<><span className="text-cyan-300 font-semibold">"{session.taskTitle}"</span> is now in
                    progress.</>}
                meta={<>
                    <span>{formatTime(session.startTime)} – {formatTime(session.endTime)}</span>
                    <span className="text-slate-700">•</span>
                    <span>{durationLabel}</span>
                </>}
                primaryLabel="Got it"
                onPrimary={() => toast.dismiss(t)}
                onDismiss={() => toast.dismiss(t)}
            />
        ));
    };

    const handleExportICS = () => {
        if (!plan) return;
        exportICS(plan.sessions, today);
    };

    const handleExportDoc = () => {
        if (!plan) return;
        const completedIds = new Set(completedTasks.map(t => t.id));
        exportDoc(plan.sessions, today, completedIds);
    };

    const handlePrint = () => {
        if (!plan) return;
        const completedIds = new Set(completedTasks.map(t => t.id));
        printTimetable(plan.sessions, completedIds);
    };

    const completedTaskIds = useMemo(() => new Set(completedTasks.map(t => t.id)), [completedTasks]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 flex flex-col h-full overflow-y-auto w-full">
            <DayHeader
                getLocalDateString={getLocalDateString}
                loading={loading}
                isGenerating={isGenerating}
                planExists={!!plan}
                showConfig={showConfig}
                onToggleConfig={() => setShowConfig(!showConfig)}
                onAddSession={handleStartAdd}
                onOpenReschedule={() => setShowRescheduleModal(true)}
                actionsMenuOpen={actionsMenuOpen}
                onToggleActionsMenu={() => setActionsMenuOpen(!actionsMenuOpen)}
                isRescheduling={isRescheduling}
                isJobActive={isJobActive}
                rescheduleBanner={rescheduleBanner}
                actionsMenuRef={actionsMenuRef}
            />

            <motion.div
                initial={{opacity: 0, y: 15}}
                animate={{opacity: 1, y: 0}}
                className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 shadow-xl"
            >
                {loading ? (
                    <div className="text-center py-20 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3"/>
                        <p className="text-sm text-slate-400 font-mono">Loading Temporal Schematics...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {(!plan || showConfig || isGenerating) && (
                            <EmptyState
                                showConfig={showConfig}
                                dayDescription={dayDescription}
                                onDayDescriptionChange={setDayDescription}
                                isRecording={isRecording}
                                onToggleRecording={toggleRecording}
                                planExists={!!plan}
                                isGenerating={isGenerating}
                                onRegenerate={() => regenerateFullTimetable()}
                                onCancelConfig={plan ? () => setShowConfig(false) : undefined}
                            />
                        )}

                        {plan && !isGenerating && (
                            <div className="space-y-4">
                                {!showConfig && (
                                    <div
                                        className="p-3 bg-fuchsia-400/[0.06] border border-fuchsia-400/25 rounded-xl text-[11px] text-fuchsia-100/80 flex items-center gap-2 shadow-[0_0_16px_rgba(232,121,249,0.1)]">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-md shrink-0 bg-fuchsia-400/15 border border-fuchsia-400/30 shadow-[0_0_8px_rgba(232,121,249,0.25)]">💡</span>
                                        <span>Want to customize your daily constraints (like waking up late, gym blocks, or night focus hours)? Click <strong className="text-fuchsia-300 drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]">Customize Routine</strong> at the top right!</span>
                                    </div>
                                )}

                                <PlanActions
                                    isSyncingCalendar={isSyncingCalendar}
                                    onSyncCalendar={handleSyncCalendar}
                                    onPrint={handlePrint}
                                    onExportICS={handleExportICS}
                                    onExportDoc={handleExportDoc}
                                />

                                {plan.sessions && plan.sessions.length > 0 ? (
                                    <TimeGrid
                                        sessions={plan.sessions.filter(s => {
											if (!s.taskId) return true;
											return tasks.some(t => t.id === s.taskId) || completedTasks.some(t => t.id === s.taskId);
										})}
                                        tasks={tasks}
                                        completedTasks={completedTasks}
                                        goals={goals}
                                        formatTime={formatTime}
                                        isoToTimeStr={isoToTimeStr}
                                        onSessionClick={handleStartEdit}
                                        onSessionDrop={handleDrop}
                                        onInsertSession={handleStartAdd}
                                        onStartSession={handleStartSession}
                                        onCompleteSession={handleMarkCompleted}
                                        highlightedIdx={highlightedIdx}
                                        draggedIdx={draggedIdx}
                                        dragOverIdx={dragOverIdx}
                                        onDragStart={handleDragStart}
                                        onDragOver={handleDragOver}
                                        onDrop={handleDropEvent}
                                        onDragEnd={handleDragEnd}
                                        onMobileReorder={handleMobileReorder}
                                    />
                                ) : (
                                    <div
                                        className="text-center py-16 text-slate-400 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
                                        <p className="text-sm mb-4">No scheduled sessions in your Daily
                                            Timetable.</p>
                                        <button
                                            onClick={() => regenerateFullTimetable()}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-4 py-2 cursor-pointer inline-flex items-center gap-2"
                                        >
                                            <Sparkles className="w-3.5 h-3.5"/>
                                            Generate General Timetable
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </motion.div>

            <ReplanDialog
                pendingReplan={pendingReplan}
                onConfirm={(desc, tasks) => {
                    setPendingReplan(null);
                    performRegenerateFullTimetable(desc, tasks);
                }}
                onCancel={() => setPendingReplan(null)}
            />

            <SessionEditor
                editingIndex={editingIndex}
                editTitle={editTitle}
                editStartTime={editStartTime}
                editEndTime={editEndTime}
                onTitleChange={setEditTitle}
                onStartTimeChange={setEditStartTime}
                onEndTimeChange={setEditEndTime}
                onSave={handleSaveSlot}
                onDelete={handleDeleteSlot}
                onClose={() => setEditingIndex(null)}
            />

            <TaskSelectionModal
                open={showRescheduleModal}
                onOpenChange={setShowRescheduleModal}
                tasks={tasks}
                goals={goals}
                scheduledTaskTitles={new Set((plan?.sessions || []).map(s => s.taskTitle))}
                title="Reschedule Routine"
                description="Select tasks to reschedule into your existing timetable by subtasks."
                onConfirm={(selected) => {
                    setShowRescheduleModal(false);
                    handleRescheduleRoutine(selected);
                }}
                isGenerating={isRescheduling || isJobActive}
            />

            {isRecording && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1117]/80 backdrop-blur-md">
                    <div
                        className="bg-[#161b22] border border-indigo-500/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.15)] flex flex-col items-center gap-6 w-[90%] max-w-md animate-in fade-in zoom-in-95 duration-150 relative overflow-hidden">
                        <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none animate-pulse"/>
                        <div
                            className="w-24 h-24 bg-indigo-500/20 rounded-full flex items-center justify-center animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_60px_rgba(99,102,241,0.4)]">
                            <Mic className="w-12 h-12 text-indigo-400"/>
                        </div>
                        <div className="text-center space-y-2 w-full z-10">
                            <h2 className="text-xl font-medium text-[#f0f6fc]">Listening...</h2>
                            <div
                                className="w-full h-20 bg-[#0d1117] rounded-2xl overflow-hidden border border-[#21262d] relative shadow-inner">
                                <canvas ref={canvasRef} width="400" height="80"
                                        className="w-full h-full object-cover opacity-80"/>
                            </div>
                            <p className="text-sm text-[#8b949e] line-clamp-3 overflow-hidden text-ellipsis px-2 min-h-[40px] mt-3">
                                {dayDescription || "Speak now..."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={stopRecording}
                            className="mt-4 rounded-full px-10 h-12 bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 hover:text-red-300 font-bold tracking-wide transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] flex items-center gap-3 z-10 cursor-pointer"
                        >
                            <div className="w-3 h-3 rounded-sm bg-red-400 animate-pulse"/>
                            Stop Recording
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}