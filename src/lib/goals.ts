import type {Task, Goal} from '@/types.ts';
import {getTodayISO} from './time.ts';

export function computeQuestProgress(tasks: Task[]): {progress: number; isCompleted: boolean} {
    if (tasks.length === 0) return {progress: 0, isCompleted: false};
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completedCount / tasks.length) * 100);
    return {progress, isCompleted: progress === 100};
}

export function incrementHabitProgress(goal: {progress?: number}): number {
    return (goal.progress || 0) + 1;
}

export function incrementHabitStreak(
    goal: {streak?: number; lastLogged?: string | null},
    today: string
): number {
    return goal.lastLogged !== today ? (goal.streak || 0) + 1 : (goal.streak || 0);
}

export interface HabitStreakUpdateInput {
    goalId: string;
    goalTitle: string;
    streak: number;
    progress: number;
    lastLogged: string;
    alreadyLoggedToday: boolean;
}

export async function updateHabitStreak(
    token: string,
    input: HabitStreakUpdateInput,
    onSuccess?: (newStreak: number) => void
): Promise<boolean> {
    try {
        const res = await fetch(`/api/goals/${input.goalId}`, {
            method: 'PUT',
            headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                streak: input.streak,
                progress: input.progress,
                lastLogged: input.lastLogged
            })
        });
        if (res.ok && !input.alreadyLoggedToday && onSuccess) {
            onSuccess(input.streak);
        }
        return res.ok;
    } catch {
        return false;
    }
}

export function getStreakBadgeClass(streak: number): string {
    if (streak >= 7) return 'bg-red-500/15 text-red-400 border-red-500/25';
    if (streak >= 3) return 'bg-orange-500/15 text-orange-400 border-orange-500/25';
    return 'bg-[#161b22] text-[#8b949e] border-[#21262d]';
}

export function getStreakEmojiColor(streak: number): string {
    if (streak >= 7) return 'text-red-400';
    if (streak >= 3) return 'text-orange-400';
    return 'text-[#f0f6fc]';
}

export function getStreakProgressWidth(streak: number): number {
    return ((streak % 7) / 7) * 100;
}

export function isAlreadyLoggedToday(goal: {lastLogged?: string | null}, today: string): boolean {
    return goal.lastLogged === today;
}

export function calculateNewStreak(goal: {streak?: number; lastLogged?: string | null}, today: string): number {
    return goal.lastLogged !== today ? (goal.streak || 0) + 1 : (goal.streak || 0);
}

export function calculateNewProgress(goal: {progress?: number}): number {
    return (goal.progress || 0) + 1;
}
