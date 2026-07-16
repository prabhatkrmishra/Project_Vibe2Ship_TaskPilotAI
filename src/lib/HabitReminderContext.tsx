import {createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode} from 'react';
import {Goal} from '../types';
import {minutesOfDay, getTodayISO} from '@/lib/time.ts';

export type ReminderStage = 'approaching' | 'soon' | 'logging' | 'overdue';

export interface HabitReminder {
    goal: Goal;
    stage: ReminderStage;
    minutesUntil: number; // negative if past scheduled time
}

interface HabitReminderContextValue {
    activeReminder: HabitReminder | null;
    dismissReminder: (goalId: string) => void;
    snoozeReminder: (goalId: string, minutes?: number) => void;
    habits: Goal[];
    setHabits: (habits: Goal[]) => void;
}

const HabitReminderContext = createContext<HabitReminderContextValue | null>(null);

const APPROACHING_WINDOW = 60; // don't surface a reminder more than 60 min before scheduled time
const OVERDUE_EXPIRY = -120;   // stop nagging 2 hours after a missed habit

function getStage(minutesUntil: number): ReminderStage | null {
    if (minutesUntil <= OVERDUE_EXPIRY) return null; // too late, give up quietly
    if (minutesUntil <= -5) return 'overdue';
    if (minutesUntil <= 5) return 'logging';
    if (minutesUntil <= 10) return 'soon';
    if (minutesUntil <= APPROACHING_WINDOW) return 'approaching';
    return null; // too far out, don't show yet
}

export function HabitReminderProvider({children}: { children: ReactNode }) {
    const [habits, setHabits] = useState<Goal[]>([]);
    const [activeReminder, setActiveReminder] = useState<HabitReminder | null>(null);
    const dismissedRef = useRef<Set<string>>(new Set());
    const snoozedUntilRef = useRef<Record<string, number>>({});

    const dismissReminder = useCallback((goalId: string) => {
        dismissedRef.current.add(`${goalId}-${getTodayISO()}`);
        setActiveReminder(null);
    }, []);

    const snoozeReminder = useCallback((goalId: string, minutes: number = 10) => {
        snoozedUntilRef.current[goalId] = Date.now() + minutes * 60 * 1000;
        setActiveReminder(null);
    }, []);

    useEffect(() => {
        const checkReminders = () => {
            const now = new Date();
            const currentMinutes = minutesOfDay(now);
            const today = getTodayISO();

            const timeBasedHabits = habits.filter(h => {
                if (!h.scheduledTime || h.completed || h.lastLogged === today) return false;
                if (dismissedRef.current.has(`${h.id}-${today}`)) return false;
                const snoozedUntil = snoozedUntilRef.current[h.id];
                if (snoozedUntil && Date.now() < snoozedUntil) return false;
                return true;
            });

            let bestReminder: HabitReminder | null = null;

            for (const habit of timeBasedHabits) {
                const [h, m] = habit.scheduledTime!.split(':').map(Number);
                const scheduledMinutes = h * 60 + m;
                const diff = scheduledMinutes - currentMinutes;
                const stage = getStage(diff);
                if (!stage) continue;

                if (!bestReminder) {
                    bestReminder = {goal: habit, stage, minutesUntil: diff};
                } else {
                    // Prioritize: overdue > logging > soon > approaching
                    const stagePriority: Record<ReminderStage, number> = {
                        overdue: 4,
                        logging: 3,
                        soon: 2,
                        approaching: 1
                    };
                    if (stagePriority[stage] > stagePriority[bestReminder.stage]) {
                        bestReminder = {goal: habit, stage, minutesUntil: diff};
                    } else if (stagePriority[stage] === stagePriority[bestReminder.stage] && diff < bestReminder.minutesUntil) {
                        // Same stage, pick the one closest to its time
                        bestReminder = {goal: habit, stage, minutesUntil: diff};
                    }
                }
            }

            setActiveReminder(bestReminder);
        };

        checkReminders();
        const interval = setInterval(checkReminders, 30000);
        return () => clearInterval(interval);
    }, [habits]);

    return (
        <HabitReminderContext.Provider value={{activeReminder, dismissReminder, snoozeReminder, habits, setHabits}}>
            {children}
        </HabitReminderContext.Provider>
    );
}

export function useHabitReminders() {
    const ctx = useContext(HabitReminderContext);
    if (!ctx) throw new Error('useHabitReminders must be used within HabitReminderProvider');
    return ctx;
}
