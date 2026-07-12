import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { Task, DailyPlan } from '../types';
import { Button } from '../components/ui/button';
import { Loader2, Calendar as CalendarIcon, Sparkles, Clock, CheckCircle2, Printer, Download, FileText, Pencil, Plus, Trash2, GripVertical, X, PlayCircle, AlertTriangle, Info, RefreshCw, CalendarCheck, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { createCalendarEvent } from '../lib/workspace';

const safeJson = async (res: Response) => {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('text/html')) {
    throw new Error('Server returned HTML. Please refresh or try again.');
  }
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(`Expected JSON response but received ${contentType || 'none'}`);
  }
  return res.json();
};

// Shared visual language for EVERY popup banner on this page. This is the original dark-glass
// card style used for "Session already in progress": a soft gradient wash over a near-black
// panel, a glowing icon halo, and a colored border — reused here for every toast (info, success,
// error) instead of each action picking its own one-off look.
type ToastAccent = 'amber' | 'cyan' | 'emerald' | 'indigo' | 'red';

const TOAST_THEME: Record<ToastAccent, {
  panel: string;
  halo: string;
  iconRing: string;
  iconText: string;
  primaryBtn: string;
}> = {
  amber: {
    panel: 'from-amber-500/[0.08] via-[#12161d] to-[#0a0d12] border-amber-500/25',
    halo: 'from-amber-400/40 to-amber-500/0',
    iconRing: 'border-amber-400/40 bg-amber-500/15',
    iconText: 'text-amber-300',
    primaryBtn: 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25',
  },
  cyan: {
    panel: 'from-cyan-500/[0.08] via-[#12161d] to-[#0a0d12] border-cyan-500/25',
    halo: 'from-cyan-400/40 to-cyan-500/0',
    iconRing: 'border-cyan-400/40 bg-cyan-500/15',
    iconText: 'text-cyan-300',
    primaryBtn: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25',
  },
  emerald: {
    panel: 'from-emerald-500/[0.08] via-[#12161d] to-[#0a0d12] border-emerald-500/25',
    halo: 'from-emerald-400/40 to-emerald-500/0',
    iconRing: 'border-emerald-400/40 bg-emerald-500/15',
    iconText: 'text-emerald-300',
    primaryBtn: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25',
  },
  indigo: {
    panel: 'from-indigo-500/[0.08] via-[#12161d] to-[#0a0d12] border-indigo-500/25',
    halo: 'from-indigo-400/40 to-indigo-500/0',
    iconRing: 'border-indigo-400/40 bg-indigo-500/15',
    iconText: 'text-indigo-300',
    primaryBtn: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25',
  },
  red: {
    panel: 'from-red-500/[0.08] via-[#12161d] to-[#0a0d12] border-red-500/25',
    halo: 'from-red-400/40 to-red-500/0',
    iconRing: 'border-red-400/40 bg-red-500/15',
    iconText: 'text-red-300',
    primaryBtn: 'bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25',
  },
};

const SessionToastCard = ({
  accent,
  icon,
  title,
  message,
  meta,
  primaryLabel,
  onPrimary,
  onDismiss,
}: {
  accent: ToastAccent;
  icon: ReactNode;
  title: string;
  message: ReactNode;
  meta?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  onDismiss: () => void;
}) => {
  const theme = TOAST_THEME[accent];
  return (
    <div className={`relative flex items-start gap-3 w-full max-w-sm bg-gradient-to-br ${theme.panel} border rounded-2xl p-4 shadow-[0_12px_36px_rgba(0,0,0,0.55)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {/* Ambient glow orb — the one bit of color life instead of a flat dark panel */}
      <div className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${theme.halo} blur-2xl opacity-70`} />

      <div className={`relative shrink-0 w-10 h-10 rounded-xl border ${theme.iconRing} flex items-center justify-center ${theme.iconText}`}>
        {icon}
      </div>
      <div className="relative flex-1 min-w-0">
        <p className="text-sm font-bold text-white leading-tight">{title}</p>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{message}</p>
        {meta && (
          <div className="flex items-center gap-2 mt-2.5 text-[11px] text-slate-500 font-mono">
            {meta}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          {primaryLabel && onPrimary && (
            <button
              onClick={onPrimary}
              className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${theme.primaryBtn}`}
            >
              {primaryLabel}
            </button>
          )}
          <button
            onClick={onDismiss}
            className={`text-[11px] font-bold uppercase tracking-widest py-1.5 rounded-lg text-slate-500 hover:text-white transition-colors cursor-pointer ${
              primaryLabel && onPrimary ? 'px-3' : '-ml-3 px-3'
            }`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

// Small helpers so every plain toast.success()/toast.error() on this page is rendered through
// the same SessionToastCard shell instead of sonner's default plain banner.
const showInfoToast = (accent: ToastAccent, icon: ReactNode, title: string, message: ReactNode) => {
  toast.custom((t) => (
    <SessionToastCard
      accent={accent}
      icon={icon}
      title={title}
      message={message}
      onDismiss={() => toast.dismiss(t)}
    />
  ));
};

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
  const { user, requestWorkspaceAccess } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dayDescription, setDayDescription] = useState<string>('');
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

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

  // Editing, Adding, Dragging States
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null = none, -1 = add new
  const [editTitle, setEditTitle] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null);
  // Session timing (isPast, progress %, and the 10-minutes-remaining complete window) is
  // computed from Date.now() on every render. Without something driving periodic re-renders,
  // that clock is effectively frozen until an unrelated state change happens to re-render this
  // component. Ticking every 30s keeps the timeline live.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Tracks whether we've already auto-regenerated the timetable for the current
  // "today" value, so the midnight rollover effect below only fires the
  // auto-refresh/auto-generate once per day instead of on every 30s clock tick.
  const autoRefreshedForDateRef = useRef<string>('');
  // Snapshot of the pending-task signature at the moment sessions were last (re)scheduled.
  // Used by "Reschedule Routine" to detect whether anything has actually changed.
  const lastRescheduleSignatureRef = useRef<string>('');

  const isoToTimeStr = (isoString: string) => {
    const match = isoString.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "12:00";
  };

  const handleStartEdit = (idx: number, session: any) => {
    setEditingIndex(idx);
    setEditTitle(session.taskTitle);
    setEditStartTime(isoToTimeStr(session.startTime));
    setEditEndTime(isoToTimeStr(session.endTime));
  };

  const handleStartAdd = (prepopulatedStartTime?: string, prepopulatedEndTime?: string) => {
    setEditingIndex(-1);
    setEditTitle('');
    setEditStartTime(prepopulatedStartTime || "08:00");
    setEditEndTime(prepopulatedEndTime || "09:00");
  };

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
        body: JSON.stringify({ sessions: updatedSessions })
      });
      if (res.ok) {
        const updatedPlan = await res.json();
        setPlan(updatedPlan);
        if (!options?.suppressSuccessToast) {
          showInfoToast('emerald', <CheckCircle2 className="w-5 h-5" />, "Synced", options?.successMessage || "Timetable updated and synchronized!");
        }
      } else {
        if (rollbackPlan) setPlan(rollbackPlan);
        showInfoToast('red', <AlertTriangle className="w-5 h-5" />, "Sync failed", "Failed to sync updated timetable with server.");
      }
    } catch (err) {
      console.error("Error syncing timetable:", err);
      if (rollbackPlan) setPlan(rollbackPlan);
      showInfoToast('red', <AlertTriangle className="w-5 h-5" />, "Network error", "Could not reach the server to sync your timetable.");
    }
  };

  const handleSaveSlot = async () => {
    if (!plan) return;
    if (!editTitle.trim()) {
      showInfoToast('amber', <AlertTriangle className="w-5 h-5" />, "Title required", "Please enter a title for the session.");
      return;
    }

    let startISO = `${today}T${editStartTime}:00.000`;
    let endISO = `${today}T${editEndTime}:00.000`;
    if (editEndTime < editStartTime) {
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = getLocalYYYYMMDD(tomorrowDate);
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
        endTime: endISO
      };
    }

    // Sort chronologically by start time
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

  const handleDrop = async (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx || !plan) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }

    const updatedSessions = [...plan.sessions];
    const [removed] = updatedSessions.splice(draggedIdx, 1);
    updatedSessions.splice(idx, 0, removed);

    // Swap times so they keep the fixed chronological sequence
    const originalTimes = plan.sessions.map(s => ({ startTime: s.startTime, endTime: s.endTime }));
    const finalSessions = updatedSessions.map((session, index) => ({
      ...session,
      startTime: originalTimes[index].startTime,
      endTime: originalTimes[index].endTime
    }));

    setDraggedIdx(null);
    setDragOverIdx(null);
    await saveSessions(finalSessions, undefined, { successMessage: "Timetable reordered!" });
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const getLocalYYYYMMDD = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getLocalYYYYMMDD();

  // A stable fingerprint of the pending/in-progress task pool (id, status, title, priority,
  // estimated hours). Used to detect whether anything relevant to scheduling has actually
  // changed since the last time sessions were generated/reshuffled — see "Reschedule Routine".
  const computeTaskSignature = (taskList: Task[]) =>
    taskList
      .map(t => `${t.id}:${t.status}:${t.title}:${t.priority}:${t.estimatedHours}`)
      .sort()
      .join('|');

  const fetchTimetableData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      const [resTasks, resPlan] = await Promise.all([
        fetch('/api/tasks', { headers }),
        fetch(`/api/plans/${today}`, { headers })
      ]);

      if (resPlan.ok) {
        const planData = await safeJson(resPlan);
        setPlan(planData);
      } else {
        setPlan(null);
      }

      if (resTasks.ok) {
        const allTasks = await safeJson(resTasks) as Task[];
        const pending = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
        setTasks(pending);
        setCompletedTasks(allTasks.filter(t => t.status === 'completed'));
        // Baseline: assume the timetable we just loaded already reflects this task state.
        lastRescheduleSignatureRef.current = computeTaskSignature(pending);
      }
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

  // Feature: once the date rolls past 00:00, refresh the timetable for the new day. If a
  // timetable already exists for today (e.g. pre-planned), just load it; if not, auto-generate
  // one — built from whatever pending tasks/quests remain, or a general routine if none exist.
  // "today" is derived from Date.now() on every render, and the clockTick interval (below)
  // already forces a re-render every 30s, so this effect's dependency naturally picks up the
  // date change shortly after midnight without any extra timers.
  useEffect(() => {
    if (!user) return;
    if (!autoRefreshedForDateRef.current) {
      // First run for this mount — the [user] effect above already handles the initial load.
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
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };
      const [resTasks, resPlan] = await Promise.all([
        fetch('/api/tasks', { headers }),
        fetch(`/api/plans/${today}`, { headers })
      ]);

      let freshTasks: Task[] = [];
      if (resTasks.ok) {
        const allTasks = await safeJson(resTasks) as Task[];
        freshTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
        setTasks(freshTasks);
        setCompletedTasks(allTasks.filter(t => t.status === 'completed'));
      }

      let hasPlanForToday = false;
      if (resPlan.ok) {
        const planData = await safeJson(resPlan);
        hasPlanForToday = !!(planData && planData.sessions && planData.sessions.length > 0);
        setPlan(planData);
      } else {
        setPlan(null);
      }

      if (!hasPlanForToday) {
        showInfoToast(
          'indigo',
          <Sparkles className="w-5 h-5" />,
          "New day, new timetable",
          freshTasks.length > 0
            ? "Building today's timetable from your remaining tasks and quests..."
            : "No pending tasks or quests — generating a general daily routine..."
        );
        await regenerateFullTimetable(dayDescription || undefined, freshTasks);
      } else {
        lastRescheduleSignatureRef.current = computeTaskSignature(freshTasks);
      }
    } catch (err) {
      console.error("Error auto-refreshing timetable after midnight rollover:", err);
    }
  };

  // NOTE: This calls /api/autonomous-pipeline, which regenerates the ENTIRE day's
  // timetable from scratch — unlike Dashboard's "Assign Tasks to Timetable" action
  // (POST /api/generate-plan), which only slots tasks into the existing timetable and
  // preserves completed/started progress. This action discards that progress, so warn
  // the user before wiping a timetable that already has sessions marked started/done.
  const regenerateFullTimetable = async (customDesc?: string, tasksOverride?: Task[]) => {
    const hasProgress = !!plan?.sessions?.some((s: any) => s.completed || s.started);
    if (hasProgress) {
      const confirmed = window.confirm(
        "This will regenerate your entire timetable from scratch and will discard progress " +
        "(completed/started sessions) on today's plan. If you only want to slot new tasks into " +
        "your existing timetable without losing progress, use Dashboard's \"Assign Tasks to " +
        "Timetable\" instead. Continue with a full replan?"
      );
      if (!confirmed) return;
    }

    setIsGenerating(true);
    const descToUse = customDesc !== undefined ? customDesc : dayDescription;
    const tasksToUse = tasksOverride !== undefined ? tasksOverride : tasks;
    try {
      const token = await user?.getIdToken();
      const selectedModel = localStorage.getItem('default_gemini_model') || 'models/gemini-3.1-flash-lite';
      const res = await fetch('/api/autonomous-pipeline', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          eventName: 'Manual Replan Request',
          eventDetail: 'User requested a forced replan of the schedule with custom preferences.',
          tasks: tasksToUse,
          model: selectedModel,
          dayDescription: descToUse || "Design a classic balanced high-discipline routine.",
          localDateStr: today,
          localTimeStr: new Date().toLocaleTimeString()
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "The AI is currently out of quota. Please switch the AI Brain model in Mission Control.");
      }

      showInfoToast('cyan', <Sparkles className="w-5 h-5" />, "Timetable regenerated", "Gemini has customized your daily timetable!");
      await fetchTimetableData();
      lastRescheduleSignatureRef.current = computeTaskSignature(tasksToUse);
      setShowConfig(false);
    } catch (error: any) {
       console.error(error);
       showInfoToast('red', <AlertTriangle className="w-5 h-5" />, "Replan failed", error.message || "Failed to generate plan");
    } finally {
       setIsGenerating(false);
    }
  };

  // Feature: "Reschedule Routine" — slots any updated/new pending tasks into the EXISTING
  // timetable structure (via /api/generate-plan) without discarding completed/started
  // progress. If nothing about the pending task pool has changed since the last time sessions
  // were (re)generated, warn instead of making a pointless AI call.
  const handleRescheduleRoutine = async () => {
    if (!plan || !plan.sessions || plan.sessions.length === 0) {
      showInfoToast('amber', <AlertTriangle className="w-5 h-5" />, "No timetable yet", "Generate a timetable first before rescheduling sessions.");
      return;
    }

    const currentSignature = computeTaskSignature(tasks);
    if (currentSignature === lastRescheduleSignatureRef.current) {
      showInfoToast('amber', <Info className="w-5 h-5" />, "Nothing to reschedule", "Nothing new to reschedule sessions — no task changes since the last update.");
      return;
    }

    setIsRescheduling(true);
    try {
      const token = await user?.getIdToken();
      const selectedModel = localStorage.getItem('default_gemini_model') || 'models/gemini-3.1-flash-lite';
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ date: today, tasks, model: selectedModel })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to reschedule sessions.");
      }

      showInfoToast('cyan', <Sparkles className="w-5 h-5" />, "Routine rescheduled", "Sessions have been updated to reflect your latest tasks.");
      lastRescheduleSignatureRef.current = currentSignature;
      await fetchTimetableData();
    } catch (error: any) {
      console.error(error);
      showInfoToast('red', <AlertTriangle className="w-5 h-5" />, "Reschedule failed", error.message || "Failed to reschedule sessions.");
    } finally {
      setIsRescheduling(false);
    }
  };

  // Feature: "Sync with Calendar" — pushes every session for today's plan into the user's
  // primary Google Calendar. Reuses the existing Workspace OAuth flow (calendar scope is
  // already requested there) so no separate Google connection step is needed.
  const handleSyncCalendar = async () => {
    if (!plan || !plan.sessions || plan.sessions.length === 0) {
      toast.error("No scheduled sessions to sync.");
      return;
    }

    setIsSyncingCalendar(true);
    try {
      const accessToken = await requestWorkspaceAccess();
      if (!accessToken) {
        showInfoToast('amber', <AlertTriangle className="w-5 h-5" />, "Calendar access needed", "Please authorize Google Calendar access to sync your timetable.");
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
        showInfoToast('emerald', <CalendarCheck className="w-5 h-5" />, "Synced to Google Calendar", `${successCount} session${successCount === 1 ? '' : 's'} added to your Google Calendar for today.`);
      } else if (successCount === 0) {
        showInfoToast('red', <AlertTriangle className="w-5 h-5" />, "Sync failed", "Could not sync sessions to Google Calendar. Please check your Google account connection.");
      } else {
        showInfoToast('amber', <AlertTriangle className="w-5 h-5" />, "Partially synced", `${successCount} synced, ${failCount} failed. Please check your Google account connection.`);
      }
    } catch (error: any) {
      console.error("Error syncing to Google Calendar:", error);
      showInfoToast('red', <AlertTriangle className="w-5 h-5" />, "Sync failed", error.message || "Could not sync your timetable to Google Calendar.");
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getLocalDateString = () => {
    return new Date().toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleMarkCompleted = async (index: number) => {
    if (!plan) return;
    const session = plan.sessions[index];
    // A session that's being completed is, by definition, started/finished — set both flags
    // together so the server's "only started/past sessions can complete" rule never contradicts
    // the action the user just took (this was the cause of the tick silently reverting).
    let updatedSessions = [...plan.sessions];
    updatedSessions[index] = { ...session, completed: true, started: true };

    // Optimistic update: reflect the tick immediately instead of waiting on the network
    // round-trip, then reconcile with (or roll back to) whatever the server confirms.
    const previousPlan = plan;
    setPlan({ ...plan, sessions: updatedSessions });
    await saveSessions(updatedSessions, previousPlan, { suppressSuccessToast: true });

    toast.custom((t) => (
      <SessionToastCard
        accent="emerald"
        icon={<CheckCircle2 className="w-5 h-5" />}
        title="Session completed"
        message={<><span className="text-emerald-300 font-semibold">"{session.taskTitle}"</span> is done. Nice work.</>}
        primaryLabel="Got it"
        onPrimary={() => toast.dismiss(t)}
        onDismiss={() => toast.dismiss(t)}
      />
    ));

    const matchingTask = session.taskId
      ? tasks.find(t => t.id === session.taskId)
      : tasks.find(t => t.title === session.taskTitle);
    if (matchingTask) {
       try {
         const token = await user?.getIdToken();
         await fetch(`/api/tasks/${matchingTask.id}`, {
           method: 'PUT',
           headers: {
             'Authorization': `Bearer ${token}`,
             'Content-Type': 'application/json'
           },
           body: JSON.stringify({ status: 'completed' })
         });
         setCompletedTasks(prev => [...prev, { ...matchingTask, status: 'completed' }]);
         setTasks(prev => prev.filter(t => t.id !== matchingTask.id));
       } catch(e) {
         console.error(e);
       }
    }
  };

  const jumpToSession = (index: number) => {
    const el = document.getElementById(`session-card-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setHighlightedIdx(index);
    window.setTimeout(() => setHighlightedIdx((current) => (current === index ? null : current)), 2200);
  };

  const handleStartSession = async (index: number) => {
    if (!plan) return;
    const session = plan.sessions[index];

    // Only one session can be running at a time.
    const activeSessionIdx = plan.sessions.findIndex((s, i) => i !== index && s.started && !s.completed);
    if (activeSessionIdx !== -1) {
      const activeTitle = plan.sessions[activeSessionIdx].taskTitle;
      toast.custom((t) => (
        <SessionToastCard
          accent="amber"
          icon={<PlayCircle className="w-5 h-5" />}
          title="Session already in progress"
          message={<><span className="text-amber-300 font-semibold">"{activeTitle}"</span> is still running. Finish or stop it before starting another.</>}
          primaryLabel="Jump to session"
          onPrimary={() => { jumpToSession(activeSessionIdx); toast.dismiss(t); }}
          onDismiss={() => toast.dismiss(t)}
        />
      ));
      return;
    }

    let updatedSessions = [...plan.sessions];
    updatedSessions[index] = { ...session, started: true };

    const previousPlan = plan;
    setPlan({ ...plan, sessions: updatedSessions });
    await saveSessions(updatedSessions, previousPlan, { suppressSuccessToast: true });

    const durationMins = Math.max(1, Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000));
    const durationLabel = durationMins >= 60
      ? `${Math.floor(durationMins / 60)}h ${durationMins % 60 > 0 ? `${durationMins % 60}m` : ''}`.trim()
      : `${durationMins}m`;

    toast.custom((t) => (
      <SessionToastCard
        accent="cyan"
        icon={<PlayCircle className="w-5 h-5" />}
        title="Session started"
        message={<><span className="text-cyan-300 font-semibold">"{session.taskTitle}"</span> is now in progress.</>}
        meta={<>
          <Clock className="w-3 h-3 text-cyan-400" />
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

  const exportToICS = () => {
    if (!plan || plan.sessions.length === 0) {
      toast.error("No scheduled sessions to export.");
      return;
    }
    const visibleSessions = plan.sessions;

    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AI Pilot Daily Timetable//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";

    visibleSessions.forEach((session, idx) => {
      // Ensure correctly formatted UTC date strings for ICS (YYYYMMDDTHHMMSSZ)
      const startStr = new Date(session.startTime).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const endStr = new Date(session.endTime).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const createdStr = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:session-${idx}-${Date.now()}@aipilot.ai\r\n`;
      icsContent += `DTSTAMP:${createdStr}\r\n`;
      icsContent += `DTSTART:${startStr}\r\n`;
      icsContent += `DTEND:${endStr}\r\n`;
      icsContent += `SUMMARY:${session.taskTitle.replace(/,/g, "\\,")}\r\n`;
      icsContent += "DESCRIPTION:Deep work session generated by AI Pilot Autonomous Planner.\r\n";
      icsContent += "STATUS:CONFIRMED\r\n";
      icsContent += "SEQUENCE:0\r\n";
      icsContent += "END:VEVENT\r\n";
    });

    icsContent += "END:VCALENDAR\r\n";

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable-${today}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Calendar file (.ics) downloaded! You can import this into Google Calendar or Apple Calendar.");
  };

  const exportToDoc = () => {
    if (!plan || plan.sessions.length === 0) {
      toast.error("No scheduled sessions to export.");
      return;
    }
    const visibleSessions = plan.sessions;

    const dateStr = getLocalDateString();
    let html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>Daily Timetable - ${dateStr}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #333333; margin: 40px; }
          h1 { color: #4f46e5; font-size: 24pt; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 5px; }
          .subtitle { color: #64748b; font-size: 11pt; margin-bottom: 30px; font-style: italic; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #f1f5f9; color: #334155; text-align: left; padding: 12px; font-weight: bold; border-bottom: 2px solid #cbd5e1; }
          td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 10pt; }
          .time { font-family: Consolas, monospace; font-weight: bold; color: #4f46e5; width: 150px; }
          .title { font-weight: 600; color: #0f172a; }
          .status { font-size: 9pt; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
          .status-completed { color: #16a34a; }
          .status-scheduled { color: #4f46e5; }
          .footer { margin-top: 50px; font-size: 9pt; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <h1>AI Pilot — Daily Timetable</h1>
        <div class="subtitle">Generated Schedule for ${dateStr}</div>
        <table>
          <thead>
            <tr>
              <th>Time Slot</th>
              <th>Task/Session Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    visibleSessions.forEach(session => {
      const isCompleted = session.completed || (!!session.taskId && completedTasks.some(t => t.id === session.taskId));
      const statusText = isCompleted ? "Completed" : "Scheduled";
      const statusClass = isCompleted ? "status-completed" : "status-scheduled";
      
      html += `
            <tr>
              <td class="time">${formatTime(session.startTime)} - ${formatTime(session.endTime)}</td>
              <td class="title">${session.taskTitle}</td>
              <td class="status ${statusClass}">${statusText}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <div class="footer">
          Generated by AI Pilot Assistant on ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `;

    // Word Document requires application/msword with UTF-8 byte order mark (BOM) for special character safety
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable-${today}.doc`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Word Document (.doc) downloaded! Perfect for offline reference or import into Google Docs.");
  };

  const printTimetable = () => {
    if (!plan || plan.sessions.length === 0) {
      toast.error("No scheduled sessions to print.");
      return;
    }
    const visibleSessions = plan.sessions;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Pop-up blocker is preventing the printable view from opening. Please allow popups for this site.");
      return;
    }

    const dateStr = getLocalDateString();
    let itemsHtml = '';
    visibleSessions.forEach(session => {
      const isCompleted = session.completed || (!!session.taskId && completedTasks.some(t => t.id === session.taskId));
      itemsHtml += `
        <div class="item ${isCompleted ? 'completed' : ''}">
          <div class="time-block">
            <div class="time">${formatTime(session.startTime)}</div>
            <div class="time-end">${formatTime(session.endTime)}</div>
          </div>
          <div class="info">
            <div class="title">${session.taskTitle}</div>
            <div class="status">${isCompleted ? '✓ Completed' : '○ Scheduled'}</div>
          </div>
        </div>
      `;
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Daily Timetable - ${dateStr}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1a202c;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            header {
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            h1 {
              font-size: 28px;
              font-weight: 300;
              margin: 0;
              color: #4c51bf;
            }
            .date {
              font-size: 14px;
              color: #718096;
              margin-top: 5px;
            }
            .list {
              display: flex;
              flex-direction: column;
              gap: 15px;
            }
            .item {
              display: flex;
              padding: 15px;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              align-items: center;
            }
            .item.completed {
              background-color: #f0fff4;
              border-color: #c6f6d5;
              opacity: 0.8;
            }
            .item.completed .title {
              text-decoration: line-through;
              color: #4a5568;
            }
            .time-block {
              width: 120px;
              font-family: monospace;
              font-weight: bold;
              font-size: 14px;
              border-right: 2px solid #edf2f7;
              padding-right: 15px;
              margin-right: 15px;
            }
            .time-end {
              font-size: 11px;
              color: #718096;
              font-weight: normal;
            }
            .info {
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-grow: 1;
              gap: 20px;
            }
            .title {
              font-size: 16px;
              font-weight: 500;
              flex-grow: 1;
              line-height: 1.4;
            }
            .status {
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
              color: #4c51bf;
              white-space: nowrap;
              flex-shrink: 0;
            }
            .completed .status {
              color: #38a169;
            }
            footer {
              margin-top: 60px;
              text-align: center;
              font-size: 12px;
              color: #a0aec0;
              border-top: 1px solid #e2e8f0;
              padding-top: 20px;
            }
            @media print {
              body { padding: 20px; }
              button { display: none; }
            }
            .no-print {
              background: #4c51bf;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 6px;
              font-weight: bold;
              cursor: pointer;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">Print This Timetable</button>
          <header>
            <h1>AI Pilot — Daily Timetable</h1>
            <div class="date">${dateStr}</div>
          </header>
          <div class="list">
            ${itemsHtml}
          </div>
          <footer>
            Generated by AI Pilot Assistant
          </footer>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 flex flex-col h-full overflow-y-auto w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            Temporal Engine Active
          </span>
          <h1 className="text-3xl font-light text-white leading-tight mt-2">
            Daily <span className="font-semibold italic text-indigo-300">Timetable</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-slate-500" />
            {getLocalDateString()}
          </p>
        </div>

        {!loading && (
          <div className="relative self-start sm:self-center" ref={actionsMenuRef}>
            <Button
              onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
              disabled={isGenerating}
              size="sm"
              className={`rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-lg px-4 py-2.5 h-auto cursor-pointer flex items-center gap-2 ${
                actionsMenuOpen
                  ? 'bg-slate-800 border border-[#30363d] text-slate-300 hover:text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10'
              }`}
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
              Actions
            </Button>

            {actionsMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl z-20 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                {plan && (
                  <button
                    type="button"
                    onClick={() => { setActionsMenuOpen(false); handleStartAdd(); }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#161b22] border border-transparent hover:border-[#30363d] transition-all cursor-pointer text-xs font-bold uppercase tracking-widest"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    Add Session
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setActionsMenuOpen(false); setShowConfig(!showConfig); }}
                  disabled={isGenerating}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#161b22] border border-transparent hover:border-[#30363d] transition-all cursor-pointer text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                  {plan ? (showConfig ? "Close Customizer" : "Customize Routine") : (showConfig ? "Close Settings" : "Set Day Rhythm")}
                </button>
                {plan && (
                  <button
                    type="button"
                    onClick={() => { setActionsMenuOpen(false); handleRescheduleRoutine(); }}
                    disabled={isRescheduling || isGenerating}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#161b22] border border-transparent hover:border-[#30363d] transition-all cursor-pointer text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRescheduling ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 shrink-0 text-cyan-400" />}
                    Reschedule Routine
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 shadow-xl"
      >
        {loading ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-sm text-slate-400 font-mono">Loading Temporal Schematics...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(!plan || showConfig) && !isGenerating && (
              <div className="space-y-6 bg-indigo-500/5 p-5 md:p-6 border border-indigo-500/10 rounded-2xl">
                <div className="text-center md:text-left">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 justify-center md:justify-start">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    How is your day like?
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Describe your ideal daily rhythm or select one of our high-discipline templates below. Gemini will design a perfectly structured schedule based on your custom hours.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DAY_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => setDayDescription(preset.prompt)}
                      className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        dayDescription === preset.prompt 
                          ? 'bg-indigo-600/15 border-indigo-500 shadow-md shadow-indigo-500/15' 
                          : 'bg-[#161b22] border-[#21262d] hover:border-slate-700'
                      }`}
                    >
                      <h4 className="text-xs font-bold text-white mb-1">{preset.title}</h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{preset.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider block">
                    Custom Routine Preferences
                  </label>
                  <textarea
                    value={dayDescription}
                    onChange={(e) => setDayDescription(e.target.value)}
                    placeholder="e.g. I wake up at 7:00 AM, have a run at 7:30 AM, eat breakfast at 8:30 AM, work until 4 PM, spend family time until 8 PM, and sleep at 10:30 PM."
                    className="w-full h-24 bg-[#161b22] border border-[#30363d] rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  {plan && (
                    <Button
                      onClick={() => setShowConfig(false)}
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancel Customization
                    </Button>
                  )}
                  <Button
                    onClick={() => regenerateFullTimetable()}
                    className="ml-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-6 py-3 shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {plan ? "Update Timetable" : "Generate Discipline Timetable"}
                  </Button>
                </div>
              </div>
            )}

            {isGenerating && (
              <div className="text-center py-20 flex flex-col items-center">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-500" />
                <h4 className="text-base font-semibold text-white">Synthesizing Daily Schedule...</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Gemini is analyzing your pending tasks, risk weights, and workload patterns to craft an optimal execution plan.
                </p>
              </div>
            )}

            {plan && !isGenerating && (
              <div className="space-y-4">
                {!showConfig && (
                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-[11px] text-slate-400 flex items-center gap-2">
                    <span className="text-indigo-400">💡</span>
                    <span>Want to customize your daily constraints (like waking up late, gym blocks, or night focus hours)? Click <strong>Customize Routine</strong> at the top right!</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#161b22] border border-[#21262d] rounded-2xl mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    <span className="text-xs font-semibold text-slate-300 font-mono">EXPORT UTILITIES ACTIVE</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={printTimetable}
                      variant="outline"
                      size="sm"
                      className="border-[#30363d] text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                    >
                      <Printer className="w-3.5 h-3.5 text-indigo-400" />
                      Print View
                    </Button>
                    <Button
                      onClick={exportToICS}
                      variant="outline"
                      size="sm"
                      className="border-[#30363d] text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      Calendar (.ics)
                    </Button>
                    <Button
                      onClick={exportToDoc}
                      variant="outline"
                      size="sm"
                      className="border-[#30363d] text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                    >
                      <FileText className="w-3.5 h-3.5 text-pink-400" />
                      Document (.doc)
                    </Button>
                    <Button
                      onClick={handleSyncCalendar}
                      disabled={isSyncingCalendar}
                      variant="outline"
                      size="sm"
                      className="border-[#30363d] text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                    >
                      {isSyncingCalendar ? <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" /> : <CalendarCheck className="w-3.5 h-3.5 text-emerald-400" />}
                      Sync with Calendar
                    </Button>
                  </div>
                </div>

                {(() => {
                  const visibleSessions = plan.sessions;

                  if (!visibleSessions || visibleSessions.length === 0) {
                    return (
                      <div className="text-center py-16 text-slate-400 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
                        <p className="text-sm mb-4">No scheduled sessions in your Daily Timetable.</p>
                        <Button 
                          onClick={() => regenerateFullTimetable()} 
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-4 py-2"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-2" />
                          Generate General Timetable
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div className="relative border-l-2 border-slate-800 pl-6 ml-4 sm:ml-8 space-y-6">
                      {visibleSessions.map((session, i) => {
                        const now = new Date().getTime();
                        const start = new Date(session.startTime).getTime();
                        const end = new Date(session.endTime).getTime();
                        const isPast = now > end;
                        const isTimeWindowActive = now >= start && now <= end;

                        // Match the linked task by id, not title. Recurring/routine session names
                        // (e.g. "Deep Work Block II: Core Execution", "Lunch") repeat across days,
                        // so matching by title alone could flag today's fresh session as already
                        // "completed" just because some past task with the same title was finished
                        // — which silently removed the Start button and made it look broken.
                        const matchingTask = session.taskId
                          ? tasks.find(t => t.id === session.taskId)
                          : tasks.find(t => t.title === session.taskTitle);
                        const isCompleted = session.completed || (
                          session.taskId
                            ? completedTasks.some(t => t.id === session.taskId)
                            : false
                        );

                        // A session should visually read as "active" the moment it's started, even if the
                        // user started it a little early or the scheduled window hasn't technically begun
                        // yet — not only once the clock catches up to session.startTime.
                        const isActive = !!session.started && !isCompleted && now <= end;
                        const rawProgress = isTimeWindowActive ? ((now - start) / (end - start)) * 100 : (now < start ? 0 : 100);
                        const progress = isActive ? Math.min(100, Math.max(0, rawProgress)) : 0;
                        // A session can be marked as finished once it has actually started AND is within
                        // its final 10 minutes, or once its time window has fully elapsed (e.g. it was
                        // missed). This stops the complete tick from appearing the instant a session is
                        // started, while still allowing early/late completion once the session is winding
                        // down or over.
                        const TEN_MINUTES_MS = 10 * 60 * 1000;
                        const isWithinFinalTenMinutes = end - now <= TEN_MINUTES_MS;
                        const canMarkCompleted = isPast || (!!session.started && isWithinFinalTenMinutes);
                        
                        const riskColor = isCompleted 
                          ? 'bg-emerald-500' 
                          : !matchingTask 
                            ? 'bg-indigo-500/40' 
                            : (matchingTask.riskScore || 0) > 60 
                              ? 'bg-red-500' 
                              : (matchingTask.riskScore || 0) > 30 
                                ? 'bg-orange-500' 
                                : 'bg-emerald-500';

                        const isDragged = draggedIdx === i;
                        const isDragOver = dragOverIdx === i;

                        return (
                          <div key={i} id={`session-card-${i}`} className="space-y-4">
                            <div 
                              className="relative"
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, i)}
                              onDragOver={(e) => handleDragOver(e, i)}
                              onDrop={(e) => handleDrop(e, i)}
                              onDragEnd={handleDragEnd}
                            >
                              {/* Timeline node */}
                              <div className={`absolute -left-[33px] top-6 w-4 h-4 rounded-full border-4 bg-[#0d1117] transition-all duration-300 ${
                                isCompleted 
                                  ? 'border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                                  : isActive 
                                    ? 'border-indigo-500 animate-pulse' 
                                    : 'border-slate-800'
                              }`} />

                              <div 
                                className={`flex flex-col sm:flex-row gap-3 p-4 rounded-2xl border items-start sm:items-center relative overflow-hidden transition-all duration-500 group/card ${
                                  isDragged ? 'opacity-30' : ''
                                } ${
                                  highlightedIdx === i
                                    ? 'ring-2 ring-amber-400/70 border-amber-400/50 shadow-[0_0_24px_rgba(251,191,36,0.35)] scale-[1.01]'
                                    : ''
                                } ${
                                  isDragOver && !isDragged
                                    ? 'border-dashed border-indigo-500 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.2)] scale-[1.01]'
                                    : isCompleted 
                                      ? 'bg-emerald-500/5 border-emerald-500/20 opacity-75' 
                                      : isActive
                                        ? 'bg-indigo-500/5 border-indigo-500/30 ring-1 ring-indigo-500/10'
                                        : isPast 
                                          ? 'bg-[#161b22] border-[#21262d] opacity-50' 
                                          : 'bg-[#161b22] border-[#21262d] hover:border-slate-700'
                                }`}
                              >
                                {/* Risk bar or active progress bar */}
                                <div className={`absolute top-0 left-0 w-full h-1 ${riskColor} ${isCompleted ? 'opacity-80' : 'opacity-40'}`}></div>
                                {isActive && !isCompleted && (
                                  <div className="absolute top-0 left-0 h-1 bg-cyan-400" style={{ width: `${progress}%` }}></div>
                                )}

                                {/* Drag Grip Handle */}
                                <div className="text-slate-600 group-hover/card:text-slate-400 p-1 shrink-0 transition-colors cursor-grab active:cursor-grabbing hidden sm:block">
                                  <GripVertical className="w-4 h-4" />
                                </div>

                                {/* Time block */}
                                <div className="text-xs font-mono font-bold text-slate-400 text-left shrink-0 sm:border-r sm:border-[#21262d] sm:pr-4 uppercase">
                                  <span className={isActive ? 'text-indigo-400 font-extrabold' : ''}>{formatTime(session.startTime)}</span>
                                  <span className="mx-2 sm:hidden text-slate-600">—</span>
                                  <span className="hidden sm:block text-slate-500 text-[10px]">{formatTime(session.endTime)}</span>
                                  <span className="sm:hidden text-slate-500">{formatTime(session.endTime)}</span>
                                </div>

                                {/* Task information */}
                                <div className="flex-grow min-w-0">
                                  <h4 className={`font-medium text-sm truncate ${isCompleted ? 'text-slate-400 line-through font-normal' : 'text-[#f0f6fc]'}`}>
                                    {session.taskTitle}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-1">
                                    {isCompleted ? (
                                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold uppercase tracking-widest">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                        Completed
                                      </span>
                                    ) : isActive ? (
                                      <span className="text-[10px] text-indigo-400 flex items-center gap-1.5 font-bold uppercase tracking-widest">
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                        </span>
                                        Active Session
                                      </span>
                                    ) : !matchingTask ? (
                                      <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-widest">
                                        Discipline Routine
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                                        Scheduled Quests
                                      </span>
                                    )}

                                    {matchingTask && !isCompleted && (
                                      <>
                                        <span className="text-slate-700 text-xs">•</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                                          matchingTask.priority === 'high' ? 'text-red-400' : 'text-slate-400'
                                        }`}>
                                          {matchingTask.priority} priority
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(i, session);
                                  }}
                                  className="opacity-0 group-hover/card:opacity-100 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-[#1f242c] border border-transparent hover:border-[#30363d] transition-all ml-2 shrink-0 cursor-pointer hidden sm:block"
                                  title="Edit Session"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>

                                {/* Start Button */}
                                {!isCompleted && !session.started && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartSession(i);
                                    }}
                                    className="text-indigo-400 hover:text-indigo-300 p-2 rounded-xl hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-all ml-2 shrink-0 cursor-pointer"
                                    title="Start Session"
                                  >
                                    <PlayCircle className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Completion indicator / Mark as completed button */}
                                {!isCompleted ? (
                                  canMarkCompleted ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkCompleted(i);
                                      }}
                                      className="text-emerald-500 hover:text-emerald-400 p-2 rounded-xl hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all ml-2 shrink-0 cursor-pointer"
                                      title="Mark as Completed"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                  ) : null
                                ) : (
                                  <div className="text-emerald-400 shrink-0 self-center ml-2 p-2" title="Completed">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(i, session);
                                  }}
                                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-[#1f242c] border border-[#21262d] transition-all mt-3 w-full text-xs font-bold uppercase tracking-wider sm:hidden flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" /> Edit Session
                                </button>
                              </div>
                            </div>

                            {/* Insert Divider */}
                            {i < visibleSessions.length - 1 && (
                              <div className="relative group/divider h-6 -my-3 flex items-center justify-center">
                                <div className="absolute inset-x-0 h-[1px] bg-slate-800 group-hover/divider:bg-indigo-500/40 transition-all" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const prevEnd = isoToTimeStr(session.endTime);
                                    const nextStart = isoToTimeStr(visibleSessions[i+1].startTime);
                                    handleStartAdd(prevEnd, nextStart);
                                  }}
                                  className="opacity-0 group-hover/divider:opacity-100 bg-[#0d1117] border border-[#30363d] hover:border-indigo-500 text-slate-400 hover:text-white rounded-full px-3 py-1 text-[10px] font-bold flex items-center gap-1 shadow-lg transition-all z-10 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3 text-indigo-400" />
                                  Insert Session Here
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Edit / Add Session Dialog Modal */}
      {editingIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                {editingIndex === -1 ? "✨ Add New Session" : "✏️ Edit Daily Session"}
              </h3>
              <button 
                onClick={() => setEditingIndex(null)}
                className="text-slate-400 hover:text-white rounded-md p-1 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                  Session Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Morning Cardio, Deep Work, Reading"
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#21262d]">
              {editingIndex !== -1 ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteSlot(editingIndex);
                    setEditingIndex(null);
                  }}
                  className="text-xs font-bold text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingIndex(null)}
                  className="text-slate-400 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveSlot}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-4 py-2 transition-colors cursor-pointer"
                >
                  Save Session
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}