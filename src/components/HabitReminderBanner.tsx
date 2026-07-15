import {motion, AnimatePresence} from 'motion/react';
import {Flame, X, Bell, AlertTriangle, Clock} from 'lucide-react';
import {useHabitReminders, type ReminderStage} from '../lib/HabitReminderContext';
import {useAuth} from '../lib/AuthContext';
import {useState} from 'react';

const stageStyles: Record<ReminderStage, {
    bg: string;
    border: string;
    text: string;
    iconBg: string;
    icon: typeof Bell
}> = {
    approaching: {
        bg: 'bg-slate-800/95',
        border: 'border-slate-600/50',
        text: 'text-slate-300',
        iconBg: 'bg-slate-700/60 text-slate-300',
        icon: Clock
    },
    soon: {
        bg: 'bg-amber-950/95',
        border: 'border-amber-500/40',
        text: 'text-amber-300',
        iconBg: 'bg-amber-500/15 text-amber-400',
        icon: Bell
    },
    logging: {
        bg: 'bg-indigo-950/95',
        border: 'border-indigo-500/50',
        text: 'text-indigo-300',
        iconBg: 'bg-indigo-500/15 text-indigo-400',
        icon: Flame
    },
    overdue: {
        bg: 'bg-red-950/95',
        border: 'border-red-500/50',
        text: 'text-red-300',
        iconBg: 'bg-red-500/15 text-red-400',
        icon: AlertTriangle
    },
};

const formatMinutes = (mins: number) => {
    const abs = Math.abs(mins);
    if (abs < 60) return `${abs} min`;
    const hours = Math.floor(abs / 60);
    const remaining = abs % 60;
    const hourText = `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (remaining === 0) return hourText;
    return `${hourText} and ${remaining} minute${remaining !== 1 ? 's' : ''}`;
};

export function HabitReminderBanner() {
    const {activeReminder, dismissReminder, snoozeReminder} = useHabitReminders();
    const {user} = useAuth();
    const [logging, setLogging] = useState(false);

    const getMessage = (stage: ReminderStage, title: string, minutesUntil: number) => {
        switch (stage) {
            case 'approaching':
                return `${title} in ${formatMinutes(minutesUntil)}`;
            case 'soon':
                return `${title} in ${formatMinutes(minutesUntil)} — get ready`;
            case 'logging':
                return `Time to ${title}`;
            case 'overdue':
                return `${title} — missed ${formatMinutes(minutesUntil)} ago, streak at risk`;
        }
    };

    const handleLog = async (goalId: string) => {
        if (!user || logging || !activeReminder) return;
        setLogging(true);
        try {
            const {goal} = activeReminder;
            const token = await user.getIdToken();
            const today = new Date().toISOString().split('T')[0];
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
            dismissReminder(goalId);
        } catch (e) {
            console.error(e);
        } finally {
            setLogging(false);
        }
    };

    return (
        <AnimatePresence>
            {activeReminder && (() => {
                const {goal, stage, minutesUntil} = activeReminder;
                const styles = stageStyles[stage];
                const Icon = styles.icon;
                const canLog = stage === 'logging' || stage === 'overdue';
                const canSnooze = stage === 'approaching' || stage === 'soon';

                return (
                    <motion.div
                        key={goal.id}
                        initial={{opacity: 0, y: -20, x: '-50%'}}
                        animate={{opacity: 1, y: 0, x: '-50%'}}
                        exit={{opacity: 0, y: -20, x: '-50%'}}
                        transition={{duration: 0.2}}
                        className={`fixed top-4 left-1/2 z-[60] flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-2xl border shadow-2xl backdrop-blur-sm ${styles.bg} ${styles.border} ${styles.text} max-w-[92vw] sm:max-w-md`}
                    >
            <span className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${styles.iconBg}`}>
              <Icon className={`w-3.5 h-3.5 ${stage === 'logging' ? 'animate-pulse' : ''}`}/>
            </span>

                        <span className="text-sm font-semibold leading-snug min-w-0">
              {getMessage(stage, goal.title, minutesUntil)}
            </span>

                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                            {canLog && (
                                <button
                                    type="button"
                                    onClick={() => handleLog(goal.id)}
                                    disabled={logging}
                                    className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                    {logging ? '...' : 'Log Now'}
                                </button>
                            )}
                            {canSnooze && (
                                <button
                                    type="button"
                                    onClick={() => snoozeReminder(goal.id, 10)}
                                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                                    title="Remind me again in 10 minutes"
                                >
                                    Snooze
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => dismissReminder(goal.id)}
                                className="p-1 text-current opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                                title="Dismiss for today"
                            >
                                <X className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    </motion.div>
                );
            })()}
        </AnimatePresence>
    );
}
