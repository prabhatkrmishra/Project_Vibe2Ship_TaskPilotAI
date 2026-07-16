import type {ScheduledSession, Task} from '@/types.ts';

export type RiskLevel = 'high' | 'medium' | 'low';

export function getRiskLevel(score: number | undefined): RiskLevel {
    const s = score || 0;
    if (s > 60) return 'high';
    if (s > 30) return 'medium';
    return 'low';
}

export function getRiskColorClass(score: number | undefined): string {
    switch (getRiskLevel(score)) {
        case 'high':
            return 'bg-destructive';
        case 'medium':
            return 'bg-warning';
        default:
            return 'bg-success';
    }
}

export function getMatchingTask(
    session: ScheduledSession,
    tasks: Task[]
): Task | undefined {
    if (session.taskId) {
        return tasks.find(t => t.id === session.taskId);
    }
    return tasks.find(t => t.title === session.taskTitle);
}

export interface SessionView {
    isPast: boolean;
    isCompleted: boolean;
    isActive: boolean;
    isStartedPastEnd: boolean;
    isNotAttended: boolean;
    canMarkCompleted: boolean;
    riskColor: string;
    matchingTask?: Task;
}

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const ROUTINE_RE = /sleep|lunch|dinner|breakfast|workout|commute|rest|relax|break/i;

export function isRoutineTitle(title: string | undefined): boolean {
    return !!title && ROUTINE_RE.test(title);
}

export function deriveSessionView(
    session: ScheduledSession,
    tasks: Task[],
    completedTasks: Task[],
    now: Date = new Date()
): SessionView {
    const nowMs = now.getTime();
    const sessionStart = new Date(session.startTime).getTime();
    const sessionEnd = new Date(session.endTime).getTime();
    const isPast = nowMs > sessionEnd;

    const matchingTask = getMatchingTask(session, tasks);

    const isCompleted = session.completed || (
        session.taskId
            ? completedTasks.some(t => t.id === session.taskId)
            : false
    );

    const isActive = !!session.started && !isCompleted && nowMs <= sessionEnd;
    const isStartedPastEnd = !!session.started && !isCompleted && isPast;
    const isNotAttended = isPast && !isCompleted && !session.started;
    const isObjectId = OBJECT_ID_RE.test(session.taskId || '');
    const remainingMs = sessionEnd - nowMs;
    const canMarkCompleted = !!session.taskId && isObjectId && (isActive || isStartedPastEnd) && remainingMs <= 10 * 60 * 1000;

    const riskColor = isCompleted
        ? 'bg-success'
        : !matchingTask
            ? 'bg-primary/40'
            : getRiskColorClass(matchingTask.riskScore);

    return {
        isPast,
        isCompleted,
        isActive,
        isStartedPastEnd,
        isNotAttended,
        canMarkCompleted,
        riskColor,
        matchingTask
    };
}

export function getHighestSubtaskPriority(
    priority: string | undefined,
    subtaskIds: string[] | undefined,
    subtasks: {id: string; priority?: string}[] | undefined
): string {
    let highest = priority || 'medium';
    if (subtaskIds && subtaskIds.length > 0 && subtasks) {
        for (const stId of subtaskIds) {
            const subtask = subtasks.find(st => st.id === stId);
            const sp = subtask?.priority || 'medium';
            if (sp === 'high' || (sp === 'medium' && highest !== 'high') || (highest === 'low' && sp !== 'low')) {
                highest = sp;
            }
        }
    }
    return highest;
}

export function findSubtaskById(
    subtasks: {id: string; title: string; completed: boolean}[] | undefined,
    stId: string
): {id: string; title: string; completed: boolean} | undefined {
    return subtasks?.find(st => st.id === stId);
}
