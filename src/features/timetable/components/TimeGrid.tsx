import {useState, useEffect, useMemo} from 'react';
import type {ScheduledSession, Task, Goal} from '@/types.ts';
import {SessionBlock} from './SessionBlock';
import {deriveSessionView} from '../lib/sessionState';

interface TimeGridProps {
    sessions: ScheduledSession[];
    tasks: Task[];
    completedTasks: Task[];
    goals: Goal[];
    formatTime: (isoString: string) => string;
    isoToTimeStr: (isoString: string) => string;
    onSessionClick: (idx: number, session: ScheduledSession) => void;
    onSessionDrop: (fromIdx: number, toIdx: number) => void;
    onInsertSession: (startTime: string, endTime: string) => void;
    onStartSession: (idx: number) => void;
    onCompleteSession: (idx: number) => void;
    highlightedIdx: number | null;
    draggedIdx: number | null;
    dragOverIdx: number | null;
    onDragStart: (e: React.DragEvent, idx: number) => void;
    onDragOver: (e: React.DragEvent, idx: number) => void;
    onDrop: (e: React.DragEvent, idx: number) => void;
    onDragEnd: () => void;
    onMobileReorder: (from: number, to: number) => void;
    currentTime?: Date;
}

export function TimeGrid({
                             sessions,
                             tasks,
                             completedTasks,
                             goals,
                             formatTime,
                             isoToTimeStr,
                             onSessionClick,
                             onInsertSession,
                             onStartSession,
                             onCompleteSession,
                             highlightedIdx,
                             draggedIdx,
                             dragOverIdx,
                             onDragStart,
                             onDragOver,
                             onDrop,
                             onDragEnd,
                             onMobileReorder
                         }: TimeGridProps) {
    const [clockTick, setClockTick] = useState(0);

    useEffect(() => {
        const id = window.setInterval(() => setClockTick((t) => t + 1), 30000);
        return () => window.clearInterval(id);
    }, []);

    const now = useMemo(() => new Date(), [clockTick]);

    const blocks = useMemo(() => {
        return sessions.map((session, index) => {
            return {
                ...deriveSessionView(session, tasks, completedTasks, now),
                index,
                session
            };
        });
    }, [sessions, tasks, completedTasks, now]);

    return (
        <div className="relative">
            <div className="relative border-l-2 border-border ml-4 sm:ml-8 pl-6 space-y-6">
                {blocks.map(({
                                 session,
                                 index,
                                 isCompleted,
                                 isActive,
                                 isStartedPastEnd,
                                 isNotAttended,
                                 isPast,
                                 matchingTask,
                                 riskColor,
                                 canMarkCompleted
                             }) => (
                    <SessionBlock
                        key={session.startTime}
                        session={session}
                        index={index}
                        visibleSessionsLength={blocks.length}
                        isCompleted={isCompleted}
                        isActive={isActive}
                        isStartedPastEnd={isStartedPastEnd}
                        isNotAttended={isNotAttended}
                        isPast={isPast}
                        canMarkCompleted={canMarkCompleted}
                        riskColor={riskColor}
                        isDragged={draggedIdx === index}
                        isDragOver={dragOverIdx === index}
                        highlighted={highlightedIdx === index}
                        matchingTask={matchingTask}
                        goals={goals}
                        formatTime={formatTime}
                        isoToTimeStr={isoToTimeStr}
                        onEdit={onSessionClick}
                        onStart={onStartSession}
                        onComplete={onCompleteSession}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragEnd={onDragEnd}
                        onMobileReorder={onMobileReorder}
                        onInsertSession={onInsertSession}
                        nextSessionStartTime={blocks[index + 1]?.session.startTime}
                    />
                ))}
            </div>
        </div>
    );
}
