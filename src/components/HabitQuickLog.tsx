import {useState, useMemo} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Flame, X, ChevronDown, ChevronUp, Check} from 'lucide-react';
import {Goal} from '../types';
import {useAuth} from '../lib/AuthContext';

interface HabitQuickLogProps {
    goals: Goal[];
    onLogged: (goalId: string) => void;
}

export function HabitQuickLog({goals, onLogged}: HabitQuickLogProps) {
    const {user} = useAuth();
    const [logging, setLogging] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const unloggedHabits = useMemo(() => {
        return goals.filter(g => g.type === 'habit' && !g.completed && g.lastLogged !== today);
    }, [goals, today]);

    const {dueNow, upcoming, anytime} = useMemo(() => {
        const dueNow: Goal[] = [];
        const upcoming: Goal[] = [];
        const anytime: Goal[] = [];

        for (const h of unloggedHabits) {
            if (!h.scheduledTime) {
                anytime.push(h);
            } else {
                const [sh, sm] = h.scheduledTime.split(':').map(Number);
                const schedMin = sh * 60 + sm;
                if (currentMinutes >= schedMin) {
                    dueNow.push(h);
                } else {
                    upcoming.push(h);
                }
            }
        }
        return {dueNow, upcoming, anytime};
    }, [unloggedHabits, currentMinutes]);

    const handleLog = async (goal: Goal) => {
        if (!user || logging) return;
        setLogging(goal.id);
        try {
            const token = await user.getIdToken();
            const newProgress = (goal.progress || 0) + 1;
            const newStreak = goal.lastLogged !== today ? (goal.streak || 0) + 1 : (goal.streak || 0);

            const res = await fetch(`/api/goals/${goal.id}`, {
                method: 'PUT',
                headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
                body: JSON.stringify({progress: newProgress, streak: newStreak, lastLogged: today})
            });

            if (res.ok) {
                const data = await res.json();
                if (data.habitGamification?.xpEarned) {
                    const {showSuccess} = await import('../lib/toastTheme');
                    showSuccess(`+${data.habitGamification.xpEarned} XP for habit`);
                }
            }
            onLogged(goal.id);
        } catch (e) {
            console.error(e);
        } finally {
            setLogging(null);
        }
    };

    if (dismissed || unloggedHabits.length === 0) return null;

    const GroupSection = ({title, items, color}: { title: string; items: Goal[]; color: string }) => {
        if (items.length === 0) return null;
        return (
            <div className="space-y-1.5">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{title}</p>
                {items.map(h => (
                    <button
                        key={h.id}
                        type="button"
                        onClick={() => handleLog(h)}
                        disabled={logging === h.id}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-[var(--graphite-900)] hover:bg-[var(--graphite-900)] border border-[var(--panel-line)] hover:border-slate-700 transition-all group cursor-pointer disabled:opacity-50 text-left"
                    >
                        <div
                            className="shrink-0 w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                            {logging === h.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400"/>
                            ) : (
                                <Flame className="w-3.5 h-3.5 text-orange-400"/>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{h.title}</p>
                            {h.scheduledTime && (
                                <p className="text-[10px] text-slate-500 font-mono">{h.scheduledTime}</p>
                            )}
                        </div>
                        <span className="text-[10px] font-bold text-orange-400/80 shrink-0">
              {h.streak || 0}d
            </span>
                    </button>
                ))}
            </div>
        );
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{opacity: 0, y: 20, scale: 0.95}}
                animate={{opacity: 1, y: 0, scale: 1}}
                exit={{opacity: 0, y: 20, scale: 0.9}}
                className="fixed bottom-[88px] right-6 z-40 w-64 bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-2xl shadow-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--panel-line)]">
                    <div className="flex items-center gap-2">
                        <Flame className="w-3.5 h-3.5 text-orange-400"/>
                        <span className="text-[11px] font-bold text-white uppercase tracking-wider">Daily Habits</span>
                        <span
                            className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded-md">
              {unloggedHabits.length}
            </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setCollapsed(!collapsed)}
                            className="text-slate-500 hover:text-white transition-colors cursor-pointer p-0.5"
                        >
                            {collapsed ? <ChevronDown className="w-3.5 h-3.5"/> : <ChevronUp className="w-3.5 h-3.5"/>}
                        </button>
                        <button
                            type="button"
                            onClick={() => setDismissed(true)}
                            className="text-slate-500 hover:text-white transition-colors cursor-pointer p-0.5"
                        >
                            <X className="w-3.5 h-3.5"/>
                        </button>
                    </div>
                </div>

                <AnimatePresence>
                    {!collapsed && (
                        <motion.div
                            initial={{height: 0, opacity: 0}}
                            animate={{height: 'auto', opacity: 1}}
                            exit={{height: 0, opacity: 0}}
                            className="overflow-hidden"
                        >
                            <div className="p-2.5 space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
                                <GroupSection title="Due Now" items={dueNow} color="text-red-400"/>
                                <GroupSection title="Upcoming" items={upcoming} color="text-amber-400"/>
                                <GroupSection title="Anytime" items={anytime} color="text-slate-400"/>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
