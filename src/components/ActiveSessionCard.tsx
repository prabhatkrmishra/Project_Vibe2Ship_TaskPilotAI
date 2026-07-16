import {useState, useEffect, useMemo} from 'react';
import {motion} from 'motion/react';
import {Link} from 'react-router-dom';
import {DailyPlan} from '../types';
import {Clock, Zap} from 'lucide-react';
import {CircularProgress} from './CircularProgress';

interface ActiveSessionCardProps {
    plan: DailyPlan | null;
}

const formatClock = (isoString: string) =>
    new Date(isoString).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

// Same base panel chrome as the "Today's Execution" card right below it (dark
// panel, border, rounded-3xl, hover border) so the two read as one cohesive
// stack rather than mismatched components. Cyan accents layer on top for the
// "live" states only — idle/empty states stay neutral like the rest of the UI.
const PANEL = 'bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-3xl p-5 transition-colors hover:border-[var(--panel-line)]';

export function ActiveSessionCard({plan}: ActiveSessionCardProps) {
    const [now, setNow] = useState(() => Date.now());

    const activeSession = useMemo(() => {
        if (!plan) return null;
        return plan.sessions.find(s => {
            const start = new Date(s.startTime).getTime();
            const end = new Date(s.endTime).getTime();
            return now >= start && now <= end && !!s.started && !s.completed;
        }) || null;
    }, [plan, now]);

    const nextSession = useMemo(() => {
        if (!plan || activeSession) return null;
        return plan.sessions
            .filter(s => !s.completed && new Date(s.startTime).getTime() > now)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] || null;
    }, [plan, activeSession, now]);

    // Only run the ticking interval while there's an active session to track —
    // no point re-rendering every second when idle.
    useEffect(() => {
        if (!activeSession) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [activeSession?.taskTitle, activeSession?.startTime]);

    // No plan generated yet at all — minimal placeholder, no jank.
    if (!plan) {
        return (
            <div className={`${PANEL} flex items-center gap-3`}>
        <span
            className="px-2 py-1 bg-[var(--graphite-900)] text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider border border-[var(--panel-line)]">
          Active Session
        </span>
                <p className="text-xs text-slate-500">Generate a timetable to start tracking sessions.</p>
            </div>
        );
    }

    // No session currently in progress — idle state with next-up info if available.
    if (!activeSession) {
        return (
            <div className={`${PANEL} flex items-center gap-3`}>
        <span
            className="px-2 py-1 bg-[var(--graphite-900)] text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider border border-[var(--panel-line)] shrink-0">
          Active Session
        </span>
                <div className="min-w-0 flex items-start gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5"/>
                    <p className="text-xs text-slate-400 break-words">
                        {nextSession
                            ? <>No session in progress &middot; Next: <span
                                className="text-slate-300 font-medium">{nextSession.sessionLabel || nextSession.taskTitle}</span> at {formatClock(nextSession.startTime)}</>
                            : 'No session in progress · Nothing else scheduled today'}
                    </p>
                </div>
            </div>
        );
    }

    const start = new Date(activeSession.startTime).getTime();
    const end = new Date(activeSession.endTime).getTime();
    const remainingMs = end - now;
    const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));

    return (
        <motion.div
            initial={{opacity: 0, y: -10}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.4}}
            className={`${PANEL} relative overflow-hidden shadow-lg border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.06] via-[#0d1117] to-[#0d1117]`}
        >
            <div
                className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br from-cyan-400/30 to-cyan-500/0 blur-2xl opacity-70"/>

            <div className="relative flex items-center justify-between mb-4">
        <span
            className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-[10px] font-bold rounded uppercase tracking-wider flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
          </span>
          Active Session
        </span>
                <Link
                    to="/timetable"
                    className="text-[10px] font-bold uppercase tracking-widest text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg px-2.5 py-1 transition-colors"
                >
                    Jump to Session
                </Link>
            </div>

            <div className="relative flex items-start gap-4">
                <CircularProgress progress={progress} size={48} strokeWidth={4} color="stroke-cyan-400"
                                  trackColor="stroke-[#21262d]">
                    <Zap className="w-4 h-4 text-cyan-400"/>
                </CircularProgress>

                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white break-words">
                        {activeSession.sessionLabel || activeSession.taskTitle}
                    </h4>
                    <span className="text-[10px] text-slate-500 mt-0.5 block font-bold uppercase tracking-widest">Deep Work Session</span>
                </div>

                <div className="text-right shrink-0">
                    <p className="text-lg font-mono font-bold text-cyan-300 tabular-nums">{formatCountdown(remainingMs)}</p>
                    <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Remaining</p>
                </div>
            </div>
        </motion.div>
    );
}
