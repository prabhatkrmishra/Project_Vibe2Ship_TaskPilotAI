import {useState, useEffect, useMemo} from 'react';
import {Clock, LayoutGrid, LayoutList} from 'lucide-react';
import {Button} from './ui/button';
import type {ScheduledSession} from '../types';

interface DayTimelineViewProps {
    sessions: ScheduledSession[];
}

type ViewMode = 'horizontal' | 'vertical';
const STORAGE_KEY = 'taskpilot_timeline_view';

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

function formatHour(iso: string) {
    return new Date(iso).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

function sessionStatus(s: ScheduledSession, now: number) {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    if (s.completed) return 'completed';
    if (now >= start && now <= end) return 'active';
    if (now > end) return 'missed';
    return 'upcoming';
}

function statusColor(status: string) {
    switch (status) {
        case 'completed':
            return 'var(--horizon-blue)';
        case 'active':
            return 'var(--violet)';
        case 'missed':
            return 'var(--status-risk)';
        default:
            return 'var(--panel-line)';
    }
}

function riskBorderColor(score?: number) {
    if (!score || score <= 30) return 'var(--status-on-track)';
    if (score <= 60) return 'var(--status-attention)';
    return 'var(--status-risk)';
}

function HorizontalTimeline({sessions, now}: { sessions: ScheduledSession[]; now: number }) {
    const firstStart = Math.min(...sessions.map(s => new Date(s.startTime).getTime()));
    const lastEnd = Math.max(...sessions.map(s => new Date(s.endTime).getTime()));
    const totalRange = lastEnd - firstStart || 1;

    const nowPct = Math.max(0, Math.min(100, ((now - firstStart) / totalRange) * 100));

    const hours = useMemo(() => {
        const result: number[] = [];
        const startHour = new Date(firstStart).getHours();
        const endHour = new Date(lastEnd).getHours();
        for (let h = startHour; h <= endHour + 1; h++) result.push(h);
        return result;
    }, [firstStart, lastEnd]);

    return (
        <div className="relative">
            {/* Hour markers */}
            <div className="flex justify-between px-1 mb-1">
                {hours.map(h => {
                    const time = new Date(firstStart);
                    time.setHours(h, 0, 0, 0);
                    const pct = ((time.getTime() - firstStart) / totalRange) * 100;
                    if (pct < 0 || pct > 100) return null;
                    return (
                        <span key={h} className="text-[9px] font-mono text-slate-500 absolute"
                              style={{left: `${pct}%`, transform: 'translateX(-50%)'}}>
                            {formatHour(time.toISOString())}
                        </span>
                    );
                })}
            </div>

            {/* Timeline bar */}
            <div
                className="relative h-10 mt-5 bg-[var(--graphite-950)] rounded-xl border border-[var(--panel-line)] overflow-visible">
                {sessions.map((s, i) => {
                    const startPct = ((new Date(s.startTime).getTime() - firstStart) / totalRange) * 100;
                    const widthPct = ((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / totalRange) * 100;
                    const status = sessionStatus(s, now);
                    const color = statusColor(status);
                    const risk = (s as any).riskScore;

                    return (
                        <div
                            key={i}
                            className="absolute top-1 bottom-1 rounded-lg transition-opacity"
                            style={{
                                left: `${startPct}%`,
                                width: `${Math.max(widthPct, 1)}%`,
                                backgroundColor: color,
                                opacity: status === 'upcoming' ? 0.25 : status === 'completed' ? 0.5 : 0.85,
                                borderLeft: risk ? `3px solid ${riskBorderColor(risk)}` : undefined,
                            }}
                            title={`${s.sessionLabel || s.taskTitle} (${formatTime(s.startTime)} – ${formatTime(s.endTime)})`}
                        >
                            {widthPct > 8 && (
                                <span
                                    className="text-[10px] font-medium text-white/90 px-2 py-1 truncate block leading-tight">
                                    {s.sessionLabel || s.taskTitle}
                                </span>
                            )}
                        </div>
                    );
                })}

                {/* Now marker */}
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[var(--violet)] z-10"
                    style={{left: `${nowPct}%`}}
                >
                    <div
                        className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--violet)] flight-pulse"/>
                </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-3 justify-center">
                {(['completed', 'active', 'upcoming', 'missed'] as const).map(s => (
                    <div key={s} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{backgroundColor: statusColor(s)}}/>
                        <span className="text-[10px] text-slate-500 capitalize">{s}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function VerticalTimeline({sessions, now}: { sessions: ScheduledSession[]; now: number }) {
    const sorted = useMemo(
        () => [...sessions].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
        [sessions]
    );

    const nowTime = now;

    return (
        <div className="relative pl-10">
            {/* Vertical axis line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-[var(--panel-line)]"/>

            {sorted.map((s, i) => {
                const status = sessionStatus(s, nowTime);
                const color = statusColor(status);
                const risk = (s as any).riskScore;
                const isActive = status === 'active';

                return (
                    <div key={i} className="relative mb-3 last:mb-0">
                        {/* Time label on axis */}
                        <div className="absolute -left-10 top-1 text-[10px] font-mono text-slate-500 w-8 text-right">
                            {formatTime(s.startTime)}
                        </div>

                        {/* Node on axis */}
                        <div
                            className="absolute -left-[13px] top-2 w-2.5 h-2.5 rounded-full border-2 border-[var(--graphite-950)]"
                            style={{backgroundColor: color, zIndex: isActive ? 2 : 1}}
                        />

                        {/* Session card */}
                        <div
                            className={`ml-4 p-3 rounded-xl border transition-all ${
                                isActive ? 'border-[var(--violet)]/30 bg-[var(--violet)]/5' : 'border-[var(--panel-line)] bg-[var(--graphite-900)]'
                            } ${status === 'completed' ? 'opacity-60' : ''}`}
                            style={{
                                borderLeftColor: risk ? riskBorderColor(risk) : undefined,
                                borderLeftWidth: risk ? '3px' : undefined
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    {isActive && (
                                        <span className="relative flex h-2 w-2 shrink-0">
                                            <span
                                                className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--violet)] opacity-75"/>
                                            <span
                                                className="relative inline-flex rounded-full h-2 w-2 bg-[var(--violet)]"/>
                                        </span>
                                    )}
                                    <span
                                        className={`text-sm font-medium truncate ${status === 'completed' ? 'text-slate-500 line-through' : 'text-white'}`}>
                                        {s.sessionLabel || s.taskTitle}
                                    </span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">
                                    {formatTime(s.startTime)} – {formatTime(s.endTime)}
                                </span>
                            </div>
                            {risk != null && risk > 30 && (
                                <div className="mt-1.5 text-[10px] font-medium" style={{color: riskBorderColor(risk)}}>
                                    Risk: {risk}%
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Now line */}
            {(() => {
                if (sorted.length === 0) return null;
                const first = new Date(sorted[0].startTime).getTime();
                const last = new Date(sorted[sorted.length - 1].endTime).getTime();
                const total = last - first || 1;
                const pct = Math.max(0, Math.min(100, ((nowTime - first) / total) * 100));
                return (
                    <div
                        className="absolute left-0 right-0 h-px bg-[var(--violet)] z-10"
                        style={{top: `${pct}%`}}
                    >
                        <div
                            className="absolute -left-[13px] -top-1 w-2.5 h-2.5 rounded-full bg-[var(--violet)] flight-pulse"/>
                    </div>
                );
            })()}
        </div>
    );
}

export default function DayTimelineView({sessions}: DayTimelineViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === 'horizontal' || stored === 'vertical' ? stored : 'horizontal';
    });
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, viewMode);
    }, [viewMode]);

    if (sessions.length === 0) return null;

    const completedCount = sessions.filter(s => s.completed).length;

    return (
        <div role="region" aria-label="Day timeline visualization"
             className="bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--violet)]"/>
                    <h3 className="text-sm font-semibold text-white font-heading">Day Timeline</h3>
                    <span className="text-[10px] font-mono text-slate-500">
                        {completedCount}/{sessions.length} done
                    </span>
                </div>
                <div className="flex items-center gap-1 bg-[var(--graphite-950)] rounded-lg p-0.5">
                    <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 px-2 text-[10px] rounded-md ${viewMode === 'horizontal' ? 'bg-[var(--violet)] text-white' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setViewMode('horizontal')}
                    >
                        <LayoutGrid className="w-3 h-3 mr-1"/>
                        Horizontal
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 px-2 text-[10px] rounded-md ${viewMode === 'vertical' ? 'bg-[var(--violet)] text-white' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setViewMode('vertical')}
                    >
                        <LayoutList className="w-3 h-3 mr-1"/>
                        Vertical
                    </Button>
                </div>
            </div>

            {viewMode === 'horizontal' ? (
                <HorizontalTimeline sessions={sessions} now={now}/>
            ) : (
                <VerticalTimeline sessions={sessions} now={now}/>
            )}
        </div>
    );
}
