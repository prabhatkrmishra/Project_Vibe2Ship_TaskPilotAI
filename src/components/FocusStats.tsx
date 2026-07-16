import {useEffect, useState} from 'react';
import {Clock, Flame, Target, TrendingUp, BarChart3} from 'lucide-react';
import type {FocusStats as FocusStatsType, FocusMethod} from '../types';

const METHOD_COLORS: Record<FocusMethod, string> = {
    pomodoro: 'bg-indigo-500', flowtime: 'bg-violet-500',
    '52-17': 'bg-cyan-500', ultradian: 'bg-emerald-500', custom: 'bg-amber-500'
};
const METHOD_LABELS: Record<FocusMethod, string> = {
    pomodoro: 'Pomodoro', flowtime: 'Flowtime', '52-17': '52/17', ultradian: 'Ultradian', custom: 'Custom'
};

function toLocalDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FocusStats({refreshKey = 0}: { refreshKey?: number }) {
    const [stats, setStats] = useState<FocusStatsType | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('taskpilot_jwt');
        fetch('/api/focus-sessions/stats', {headers: {Authorization: `Bearer ${token}`}})
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(setStats)
            .catch(() => {
            })
            .finally(() => setLoading(false));
    }, [refreshKey]);

    if (loading) return <div className="text-center text-slate-500 text-sm py-8">Loading stats...</div>;
    if (!stats) return null;

    const maxMethod = Math.max(...Object.values(stats.byMethod), 1);
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const maxWeek = Math.max(...weekDays.map(d => stats.dailyWeek[d] || 0), 1);

    // Generate heatmap grid using local dates
    const today = new Date();
    const todayStr = toLocalDateStr(today);
    const heatmapWeeks: { date: string; mins: number }[][] = [];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (12 * 7) - startDate.getDay() + 1);
    for (let w = 0; w < 12; w++) {
        const week: { date: string; mins: number }[] = [];
        for (let d = 0; d < 7; d++) {
            const dt = new Date(startDate);
            dt.setDate(dt.getDate() + w * 7 + d);
            const dateStr = toLocalDateStr(dt);
            week.push({date: dateStr, mins: stats.heatmap[dateStr] || 0});
        }
        heatmapWeeks.push(week);
    }
    const maxHeatmap = Math.max(...heatmapWeeks.flat().map(h => h.mins), 1);

    return (
        <div className="space-y-6">
            {/* Today / Week / Month row */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard icon={<Clock className="h-4 w-4 text-indigo-400"/>}
                          label="Today" value={`${stats.todayMinutes}m`} sub={`${stats.todaySessions} sessions`}/>
                <StatCard icon={<TrendingUp className="h-4 w-4 text-emerald-400"/>}
                          label="This Week" value={`${stats.weekMinutes}m`} sub={`${stats.weekSessions} sessions`}/>
                <StatCard icon={<BarChart3 className="h-4 w-4 text-amber-400"/>}
                          label="This Month" value={`${stats.monthMinutes}m`} sub={`${stats.monthSessions} sessions`}/>
            </div>

            {/* Streaks */}
            <div className="flex items-center gap-6 justify-center">
                <div className="flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-orange-400"/>
                    <span className="text-sm text-slate-300">Streak: <span
                        className="font-bold text-orange-300">{stats.focusStreak}d</span></span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-purple-400"/>
                    <span className="text-sm text-slate-300">Best: <span
                        className="font-bold text-purple-300">{stats.longestFocusStreak}d</span></span>
                </div>
                <div className="text-sm text-slate-400">
                    Total: <span
                    className="font-bold text-slate-200">{stats.totalFocusMinutes}m</span> ({stats.totalFocusSessions} sessions)
                </div>
            </div>

            {/* Weekly bar chart */}
            <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">This Week</div>
                <div className="flex items-end gap-2 h-24">
                    {weekDays.map(day => (
                        <div key={day} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-indigo-500/20 rounded-t" style={{
                                height: `${((stats.dailyWeek[day] || 0) / maxWeek) * 70}px`,
                                minHeight: (stats.dailyWeek[day] || 0) > 0 ? '4px' : '0'
                            }}>
                                <div className="w-full bg-indigo-500 rounded-t h-full"/>
                            </div>
                            <span className="text-[9px] text-slate-500">{day}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Method breakdown */}
            {Object.keys(stats.byMethod).length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">By Method</div>
                    <div className="space-y-1.5">
                        {(Object.entries(stats.byMethod) as [FocusMethod, number][]).sort((a, b) => b[1] - a[1]).map(([method, mins]) => (
                            <div key={method} className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 w-20">{METHOD_LABELS[method]}</span>
                                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${METHOD_COLORS[method]} rounded-full`}
                                         style={{width: `${(mins / maxMethod) * 100}%`}}/>
                                </div>
                                <span className="text-[10px] text-slate-500 w-10 text-right">{mins}m</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Heatmap (12 weeks) — using local dates */}
            <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Focus Activity</div>
                <div className="flex gap-0.5">
                    {heatmapWeeks.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-0.5">
                            {week.map(day => {
                                const intensity = day.mins > 0 ? Math.max(0.2, day.mins / maxHeatmap) : 0;
                                const isFuture = day.date > todayStr;
                                return (
                                    <div key={day.date}
                                         title={`${day.date}: ${day.mins}m`}
                                         className={`w-2.5 h-2.5 rounded-sm ${
                                             isFuture ? 'bg-slate-900' :
                                                 day.mins > 0 ? 'bg-indigo-500' : 'bg-slate-800/60'
                                         }`}
                                         style={day.mins > 0 ? {opacity: intensity} : undefined}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatCard({icon, label, value, sub}: { icon: React.ReactNode; label: string; value: string; sub: string }) {
    return (
        <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">{icon}<span
                className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span></div>
            <div className="text-xl font-bold text-slate-100">{value}</div>
            <div className="text-[10px] text-slate-500">{sub}</div>
        </div>
    );
}
