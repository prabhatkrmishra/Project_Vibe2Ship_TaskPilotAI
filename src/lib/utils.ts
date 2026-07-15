import {clsx, type ClassValue} from "clsx"
import {twMerge} from "tailwind-merge"
import {Goal, Task} from "../types"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// Safely parse JSON from a fetch Response, throwing if the server returned HTML
// (e.g. a session-expiry redirect) instead of JSON.
export const safeJson = async (res: Response) => {
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
        throw new Error('Server returned HTML. Please refresh or try again.');
    }
    return res.json();
};

// Compute delay text for a task/goal that had a deadline.
export const getDelayText = (deadlineStr?: string, completedAtStr?: string) => {
    if (!deadlineStr) return null;
    const deadline = new Date(deadlineStr);
    const completedAt = completedAtStr ? new Date(completedAtStr) : new Date();
    const diffTime = completedAt.getTime() - deadline.getTime();
    if (diffTime <= 0) {
        return {text: "On time", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"};
    }
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
        return {text: "1 day delay", color: "text-red-400 bg-red-500/10 border-red-500/20"};
    }
    return {text: `${diffDays} days delay`, color: "text-red-400 bg-red-500/10 border-red-500/20"};
};

// Get the completion date for a quest: either its own completedAt or the latest
// completedAt among its linked tasks.
export const getGoalCompletionDate = (goal: Goal, linkedTasks: Task[]): string | undefined => {
    if (goal.completedAt) return goal.completedAt;
    const qTasks = linkedTasks.filter(t => t.goalId === goal.id && t.status === 'completed');
    const dates = qTasks.map(t => t.completedAt).filter(Boolean) as string[];
    if (dates.length > 0) {
        return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    }
    return undefined;
};
