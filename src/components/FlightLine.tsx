import {useEffect, useState} from 'react';
import {useAuth} from '../lib/AuthContext';

interface Session {
    startTime: string;
    endTime: string;
    taskTitle: string;
    completed?: boolean;
    started?: boolean;
}

interface FlightLineProps {
    sessions?: Session[];
}

export default function FlightLine({sessions = []}: FlightLineProps) {
    const {user} = useAuth();
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    if (sessions.length === 0) return null;

    // Find the first and last session to define the day's time range
    const firstStart = Math.min(...sessions.map(s => new Date(s.startTime).getTime()));
    const lastEnd = Math.max(...sessions.map(s => new Date(s.endTime).getTime()));
    const totalRange = lastEnd - firstStart || 1;
    const nowTime = now.getTime();

    // Calculate day status
    const completedCount = sessions.filter(s => s.completed).length;
    const ratio = completedCount / sessions.length;
    let statusColor = 'var(--status-on-track)';
    let statusLabel = 'On track';
    if (ratio < 0.3 && nowTime > firstStart + totalRange * 0.4) {
        statusColor = 'var(--status-risk)';
        statusLabel = 'Behind';
    } else if (ratio < 0.6 && nowTime > firstStart + totalRange * 0.5) {
        statusColor = 'var(--status-attention)';
        statusLabel = 'Needs attention';
    }

    const nowPosition = Math.max(0, Math.min(100,
        ((nowTime - firstStart) / totalRange) * 100
    ));

    const currentTime = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

    return (
        <div role="region" aria-label="Day timeline progress"
             className="flex items-center gap-3 px-4 py-2.5 bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-xl mb-4 select-none">
            <span className="text-xs font-mono font-medium text-[var(--violet)] tabular-nums shrink-0">
                {currentTime}
            </span>

            <div className="flex-1 relative h-3 bg-[var(--graphite-950)] rounded-full overflow-hidden">
                {sessions.map((session, i) => {
                    const startPct = ((new Date(session.startTime).getTime() - firstStart) / totalRange) * 100;
                    const widthPct = ((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / totalRange) * 100;
                    let barColor = 'var(--panel-line)';
                    if (session.completed) barColor = 'var(--horizon-blue)';
                    else if (session.started) barColor = 'var(--violet)';
                    return (
                        <div
                            key={i}
                            className="absolute top-0 h-full rounded-sm"
                            style={{
                                left: `${startPct}%`,
                                width: `${Math.max(widthPct, 0.5)}%`,
                                backgroundColor: barColor,
                                opacity: session.completed ? 0.5 : 0.8,
                            }}
                            title={`${session.taskTitle} (${new Date(session.startTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                            })} - ${new Date(session.endTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                            })})`}
                        />
                    );
                })}

                {/* Now marker */}
                <div
                    className="absolute top-0 h-full w-0.5 bg-[var(--violet)]"
                    style={{left: `${nowPosition}%`}}
                >
                    <div
                        className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[var(--violet)] flight-pulse"/>
                </div>
            </div>

            <span className="text-[10px] font-mono font-medium shrink-0" style={{color: statusColor}}>
                {statusLabel}
            </span>
        </div>
    );
}
