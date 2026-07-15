import {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {Play, Pause, RotateCcw, SkipForward, Square} from 'lucide-react';
import type {FocusMethod} from '../types';

export type TimerPhase = 'ready' | 'focus' | 'break';
export type TimerMode = 'countdown' | 'stopwatch';

interface MethodConfig {
    label: string;
    mode: TimerMode;
    workSeconds: number;
    breakSeconds: number;
    cycles: number; // 0 = unlimited (flowtime)
}

export const METHOD_CONFIGS: Record<FocusMethod, MethodConfig> = {
    pomodoro: {label: 'Pomodoro', mode: 'countdown', workSeconds: 25 * 60, breakSeconds: 5 * 60, cycles: 4},
    flowtime: {label: 'Flowtime', mode: 'stopwatch', workSeconds: 0, breakSeconds: 0, cycles: 0},
    '52-17': {label: '52/17', mode: 'countdown', workSeconds: 52 * 60, breakSeconds: 17 * 60, cycles: 0},
    ultradian: {label: 'Ultradian', mode: 'countdown', workSeconds: 90 * 60, breakSeconds: 20 * 60, cycles: 0},
    custom: {label: 'Custom', mode: 'countdown', workSeconds: 25 * 60, breakSeconds: 5 * 60, cycles: 0},
};

interface FocusTimerResult {
    duration: number;  // total focus seconds
    breaks: number;
    startedAt: string; // ISO string
}

interface FocusTimerProps {
    method: FocusMethod | null;
    customWorkMinutes?: number;
    customBreakMinutes?: number;
    onStart?: () => void;
    onComplete?: (result: FocusTimerResult) => void;
    onStop?: (result: FocusTimerResult) => void;
}

interface StoredTimerState {
    method: FocusMethod;
    phase: TimerPhase;
    elapsed: number;
    totalWork: number;
    breakCount: number;
    cycle: number;
    startedAt: string;
    running: boolean;
    customWorkMinutes?: number;
    customBreakMinutes?: number;
}

export default function FocusTimer({
                                       method,
                                       customWorkMinutes = 25,
                                       customBreakMinutes = 5,
                                       onStart,
                                       onComplete,
                                       onStop,
                                   }: FocusTimerProps) {
    const config = useMemo(() => {
        if (!method) return {
            label: 'Unknown',
            mode: 'countdown' as TimerMode,
            workSeconds: 0,
            breakSeconds: 0,
            cycles: 0
        };
        const c = {...METHOD_CONFIGS[method]};
        if (method === 'custom') {
            c.workSeconds = customWorkMinutes * 60;
            c.breakSeconds = customBreakMinutes * 60;
            c.mode = customWorkMinutes > 0 ? 'countdown' : 'stopwatch';
        }
        return c;
    }, [method, customWorkMinutes, customBreakMinutes]);

    const [phase, setPhase] = useState<TimerPhase>('ready');
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [totalWork, setTotalWork] = useState(0);
    const [breakCount, setBreakCount] = useState(0);
    const [cycle, setCycle] = useState(1);
    const [startedAt, setStartedAt] = useState<Date | null>(null);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tickStartRef = useRef<number>(0);       // wall clock for current tick
    const completedRef = useRef(false);

    // Refs to avoid stale closures in interval
    const phaseRef = useRef(phase);
    const totalWorkRef = useRef(totalWork);
    const breakCountRef = useRef(breakCount);
    const cycleRef = useRef(cycle);
    const elapsedRef = useRef(elapsed);
    phaseRef.current = phase;
    totalWorkRef.current = totalWork;
    breakCountRef.current = breakCount;
    cycleRef.current = cycle;
    elapsedRef.current = elapsed;

    const workDuration = config.workSeconds;
    const breakDuration = config.breakSeconds;
    const isStopwatch = config.mode === 'stopwatch';
    const remaining = isStopwatch ? 0 : Math.max(0, (phase === 'focus' ? workDuration : breakDuration) - elapsed);
    const progress = isStopwatch
        ? (phase === 'focus' ? Math.min(totalWork / (25 * 60), 1) : 0)
        : (phase === 'focus' ? (workDuration > 0 ? elapsed / workDuration : 0) : (breakDuration > 0 ? elapsed / breakDuration : 0));

    // Format time
    const formatTime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Build result object for callbacks
    const buildResult = useCallback((dur: number, brks: number, sa: Date | null): FocusTimerResult => ({
        duration: dur,
        breaks: brks,
        startedAt: sa ? sa.toISOString() : new Date().toISOString(),
    }), []);

    // Timer tick — uses Date.now() for drift-proof timing
    useEffect(() => {
        if (!running) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        tickStartRef.current = Date.now();
        const startElapsed = elapsedRef.current;

        intervalRef.current = setInterval(() => {
            const wallSeconds = Math.floor((Date.now() - tickStartRef.current) / 1000);
            const newElapsed = startElapsed + wallSeconds;
            setElapsed(newElapsed);

            // Track work time for stopwatch
            if (isStopwatch && phaseRef.current === 'focus') {
                setTotalWork(newElapsed);
            }

            // Check countdown completion
            if (!isStopwatch) {
                if (phaseRef.current === 'focus' && newElapsed >= workDuration) {
                    clearInterval(intervalRef.current!);
                    setRunning(false);
                    setTotalWork(prev => prev + workDuration);
                    setElapsed(0);
                    setPhase('break');
                    setBreakCount(prev => prev + 1);
                    return;
                }
                if (phaseRef.current === 'break' && newElapsed >= breakDuration) {
                    clearInterval(intervalRef.current!);
                    setRunning(false);
                    setElapsed(0);
                    if (config.cycles > 0 && cycleRef.current >= config.cycles) {
                        completedRef.current = true;
                        onComplete?.(buildResult(totalWorkRef.current, breakCountRef.current, startedAt));
                        setPhase('ready');
                    } else {
                        if (config.cycles > 0) setCycle(prev => prev + 1);
                        setPhase('focus');
                    }
                    return;
                }
            }
        }, 250); // Tick more frequently for accuracy, compute from wall clock

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [running, isStopwatch, workDuration, breakDuration]);

    const handleStart = () => {
        if (phase === 'ready') {
            const now = new Date();
            setPhase('focus');
            setStartedAt(now);
            setTotalWork(0);
            setBreakCount(0);
            setCycle(1);
            setElapsed(0);
            completedRef.current = false;
            onStart?.();
        }
        setRunning(true);
    };

    const handlePause = () => setRunning(false);

    const handleReset = () => {
        setRunning(false);
        setPhase('ready');
        setElapsed(0);
        setTotalWork(0);
        setBreakCount(0);
        setCycle(1);
        setStartedAt(null);
        completedRef.current = false;
        sessionStorage.removeItem('focusTimerState');
    };

    const handleSkipBreak = () => {
        if (phase !== 'break') return;
        setRunning(false);
        setElapsed(0);
        if (config.cycles > 0 && cycle >= config.cycles) {
            completedRef.current = true;
            onComplete?.(buildResult(totalWork, breakCount, startedAt));
            setPhase('ready');
            return;
        }
        if (config.cycles > 0) setCycle(prev => prev + 1);
        setPhase('focus');
    };

    const handleStop = () => {
        setRunning(false);
        // For countdown: include elapsed time in the current phase
        const finalWork = phase === 'focus' ? totalWork + elapsed : totalWork;
        if (finalWork > 0) {
            onStop?.(buildResult(finalWork, breakCount, startedAt));
        }
        setPhase('ready');
        setElapsed(0);
        setTotalWork(0);
        setBreakCount(0);
        setCycle(1);
        setStartedAt(null);
        completedRef.current = false;
        sessionStorage.removeItem('focusTimerState');
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
            if (e.code === 'Space') {
                e.preventDefault();
                running ? handlePause() : handleStart();
            }
            if (e.key === 'r' || e.key === 'R') handleReset();
            if (e.key === 's' || e.key === 'S') handleSkipBreak();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [running, phase]);

    // Restore from sessionStorage FIRST (before save effect)
    const restoredRef = useRef(false);
    useEffect(() => {
        const saved = sessionStorage.getItem('focusTimerState');
        if (saved) {
            try {
                const state: StoredTimerState = JSON.parse(saved);
                if (state.method === method && state.phase !== 'ready') {
                    setPhase(state.phase);
                    setTotalWork(state.totalWork);
                    setBreakCount(state.breakCount);
                    setCycle(state.cycle);
                    setStartedAt(new Date(state.startedAt));
                    // Account for time lost while unmounted
                    if (state.running) {
                        const savedDate = new Date(state.startedAt);
                        const lostSeconds = Math.floor((Date.now() - savedDate.getTime()) / 1000);
                        const maxElapsed = state.phase === 'focus' ? workDuration : breakDuration;
                        const adjustedElapsed = Math.min(state.elapsed + lostSeconds, isStopwatch ? state.elapsed + lostSeconds : maxElapsed);
                        setElapsed(adjustedElapsed);
                        if (isStopwatch && state.phase === 'focus') {
                            setTotalWork(adjustedElapsed);
                        }
                    } else {
                        setElapsed(state.elapsed);
                    }
                    setRunning(state.running);
                    restoredRef.current = true;
                }
            } catch (err) {
                console.warn('Failed to restore focus timer state:', err);
                sessionStorage.removeItem('focusTimerState');
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Save to sessionStorage (runs after restore)
    useEffect(() => {
        if (!restoredRef.current && phase === 'ready' && !startedAt) return; // skip initial render
        restoredRef.current = false; // consumed

        if (phase !== 'ready' && startedAt) {
            sessionStorage.setItem('focusTimerState', JSON.stringify({
                method, phase, elapsed, totalWork, breakCount, cycle,
                startedAt: startedAt.toISOString(), running,
                customWorkMinutes, customBreakMinutes,
            }));
        } else {
            sessionStorage.removeItem('focusTimerState');
        }
    }, [phase, elapsed, totalWork, breakCount, cycle, startedAt, running, method, customWorkMinutes, customBreakMinutes]);

    // SVG circle params
    const size = 220;
    const stroke = 6;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - Math.min(progress, 1));

    const phaseColor = phase === 'focus' ? 'text-indigo-400' : phase === 'break' ? 'text-emerald-400' : 'text-slate-400';
    const ringColor = phase === 'focus' ? '#818cf8' : phase === 'break' ? '#34d399' : '#475569';

    return (
        <div className="flex flex-col items-center gap-6">
            {/* Phase label + cycle indicator */}
            <div className="text-center">
                <div className={`text-sm font-medium uppercase tracking-wider ${phaseColor}`}>
                    {phase === 'ready' ? 'Ready' : phase === 'focus' ? 'Focus' : 'Break'}
                </div>
                {config.cycles > 0 && phase !== 'ready' && (
                    <div className="text-xs text-slate-500 mt-1">
                        Cycle {cycle} of {config.cycles}
                    </div>
                )}
            </div>

            {/* Timer ring */}
            <div className="relative" style={{width: size, height: size}}>
                <svg width={size} height={size} className="rotate-[-90deg]">
                    <circle cx={size / 2} cy={size / 2} r={radius}
                            fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={stroke}/>
                    <circle cx={size / 2} cy={size / 2} r={radius}
                            fill="none" stroke={ringColor} strokeWidth={stroke}
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            className="transition-[stroke-dashoffset] duration-1000 ease-linear"/>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-mono font-bold ${phaseColor}`}>
            {isStopwatch && phase === 'focus' ? formatTime(totalWork) : formatTime(phase === 'ready' ? workDuration : remaining)}
          </span>
                    {isStopwatch && phase === 'focus' && (
                        <span className="text-xs text-slate-500 mt-1">elapsed</span>
                    )}
                </div>
            </div>

            {/* Break suggestions */}
            {phase === 'break' && (
                <div
                    className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 text-center max-w-xs">
                    <p className="text-xs text-emerald-300">
                        {getBreakSuggestion(breakCount)}
                    </p>
                </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3">
                {phase === 'ready' ? (
                    <button onClick={handleStart}
                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-medium transition-colors">
                        <Play className="h-5 w-5"/> Start Focus
                    </button>
                ) : (
                    <>
                        <button onClick={running ? handlePause : handleStart}
                                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-colors text-white ${
                                    running ? 'bg-amber-600 hover:bg-amber-500' : 'bg-indigo-600 hover:bg-indigo-500'
                                }`}>
                            {running ? <><Pause className="h-4 w-4"/> Pause</> : <><Play
                                className="h-4 w-4"/> Resume</>}
                        </button>
                        <button onClick={handleReset}
                                className="flex items-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 transition-colors">
                            <RotateCcw className="h-4 w-4"/>
                        </button>
                        {phase === 'break' && (
                            <button onClick={handleSkipBreak}
                                    className="flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white transition-colors">
                                <SkipForward className="h-4 w-4"/> Skip
                            </button>
                        )}
                        <button onClick={handleStop}
                                className="flex items-center gap-2 px-4 py-3 bg-red-600/80 hover:bg-red-500 rounded-xl text-white transition-colors">
                            <Square className="h-4 w-4"/> Stop
                        </button>
                    </>
                )}
            </div>

            {/* Keyboard hint */}
            <div className="text-[10px] text-slate-600 text-center">
                Space = {running ? 'pause' : 'start'} &middot; R =
                reset{phase === 'break' ? ' &middot; S = skip break' : ''}
            </div>
        </div>
    );
}

const BREAK_SUGGESTIONS = [
    "Stand up and stretch for 2 minutes.",
    "Drink a glass of water.",
    "Look at something 20 feet away for 20 seconds (20-20-20 rule).",
    "Take 5 deep, slow breaths.",
    "Walk around the room for 1–2 minutes.",
    "Rest your eyes — close them for 30 seconds.",
    "Roll your shoulders forward and backward 10 times.",
    "Look out a window and focus on distant objects.",
];

function getBreakSuggestion(count: number): string {
    return BREAK_SUGGESTIONS[Math.max(0, count - 1) % BREAK_SUGGESTIONS.length];
}
