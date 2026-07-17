import {Goal} from "../db/mongodb.js";

// Determine the scheduling mode for a task based on its subtasks and quest membership.
// Tasks without subtasks cannot be scheduled — they should be filtered out before reaching here.
export async function getSchedulingMode(task: any): Promise<'SAME_DAY_SUBTASKS' | 'PACED_SUBTASKS'> {
    if (task.goalId) {
        const goal = await Goal.findOne({_id: task.goalId, userId: task.userId});
        if (goal?.type === 'quest') return 'PACED_SUBTASKS';
    }
    return 'SAME_DAY_SUBTASKS';
}

// AI-generated sessions sometimes cross midnight (e.g. "Sleep 23:30 - 06:30") but the model
// stamps both startTime and endTime with the same calendar date, which makes endTime < startTime.
// That breaks every duration-based calculation on the client (isActive, isPast, progress, and the
// Start/Mark Complete buttons). This normalizes any such session by rolling endTime forward one day,
// and drops any session that is still malformed (missing/unparseable/zero-length).
export function normalizeSessions(sessions: any[]): any[] {
    if (!Array.isArray(sessions)) return [];

    const normalized = sessions
        .map((s) => {
            if (!s || !s.startTime || !s.endTime) return null;
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

            let endTime = s.endTime;
            if (end.getTime() <= start.getTime()) {
                // Roll the calendar date portion of the naive ISO string forward by one day while
                // keeping the wall-clock time-of-day untouched. Using Date math + toISOString() here
                // would re-interpret/convert through the server process's timezone and can silently
                // shift the stored time if the server isn't running in UTC.
                const match = endTime.match(/^(\d{4})-(\d{2})-(\d{2})T(.*)$/);
                if (!match) return null;
                const [, y, m, d, rest] = match;
                const rolled = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
                const rolledDateStr = rolled.toISOString().split('T')[0];
                endTime = `${rolledDateStr}T${rest}`;

                // Guard against still-invalid ranges (e.g. identical start/end).
                if (new Date(endTime).getTime() <= start.getTime()) return null;
            }

            return {...s, endTime};
        })
        .filter((s): s is any => s !== null);

    normalized.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return normalized;
}