import {
    GripVertical,
    Pencil,
    PlayCircle,
    CheckCircle2,
    Plus,
    ChevronUp,
    ChevronDown
} from 'lucide-react';
import {Task, ScheduledSession, Goal} from '../../../types';
import {getHighestSubtaskPriority, findSubtaskById} from '../lib/sessionState.ts';

interface SessionBlockProps {
    session: ScheduledSession;
    index: number;
    visibleSessionsLength: number;
    isCompleted: boolean;
    isActive: boolean;
    isStartedPastEnd: boolean;
    isNotAttended: boolean;
    isPast: boolean;
    canMarkCompleted: boolean;
    riskColor: string;
    isDragged: boolean;
    isDragOver: boolean;
    highlighted: boolean;
    matchingTask: Task | undefined;
    goals: Goal[];
    formatTime: (isoString: string) => string;
    isoToTimeStr: (isoString: string) => string;
    onEdit: (idx: number, session: ScheduledSession) => void;
    onStart: (idx: number) => void;
    onComplete: (idx: number) => void;
    onDragStart: (e: React.DragEvent, idx: number) => void;
    onDragOver: (e: React.DragEvent, idx: number) => void;
    onDrop: (e: React.DragEvent, idx: number) => void;
    onDragEnd: () => void;
    onMobileReorder: (from: number, to: number) => void;
    onInsertSession: (startTime: string, endTime: string) => void;
    nextSessionStartTime?: string;
}

export function SessionBlock({
    session,
    index,
    visibleSessionsLength,
    isCompleted,
    isActive,
    isStartedPastEnd,
    isNotAttended,
    isPast,
    canMarkCompleted,
    riskColor,
    isDragged,
    isDragOver,
    highlighted,
    matchingTask,
    goals,
    formatTime,
    isoToTimeStr,
    onEdit,
    onStart,
    onComplete,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onMobileReorder,
    onInsertSession,
    nextSessionStartTime
}: SessionBlockProps) {
    return (
        <div className="space-y-4">
            <div
                className="relative"
                draggable={true}
                onDragStart={(e) => onDragStart(e, index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => onDrop(e, index)}
                onDragEnd={onDragEnd}
            >
                {/* Timeline node */}
                <div
                    className={`absolute -left-[33px] top-6 w-4 h-4 rounded-full border-4 bg-background transition-all duration-300 ${
                        isCompleted
                            ? 'border-success bg-success/20'
                            : isActive
                                ? 'border-primary bg-primary/20 shadow-[0_0_10px_rgba(99,102,241,0.7)] animate-pulse'
                                : isNotAttended
                                    ? 'border-destructive bg-destructive/20'
                                    : 'border-border bg-background'
                    }`}/>

                <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Session: ${session.taskTitle || 'Untitled'}. Press Enter to edit.`}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onEdit(index, session);
                        }
                    }}
                    className={`flex flex-col sm:flex-row gap-3 p-4 rounded-2xl border items-start sm:items-center relative overflow-hidden transition-all duration-500 group/card ${
                        isDragged ? 'opacity-30' : ''
                    } ${
                        highlighted
                            ? 'ring-2 ring-amber-400/80 border-amber-400/60 shadow-[0_0_20px_rgba(251,191,36,0.45),0_0_40px_rgba(251,191,36,0.15)] scale-[1.01]'
                            : ''
                    } ${
                        isDragOver && !isDragged
                            ? 'border-dashed border-primary bg-primary/10 shadow-[0_0_12px_rgba(99,102,241,0.2)] scale-[1.01]'
                            : isCompleted
                                ? 'bg-success/10 border-success/40 opacity-80'
                                : isActive
                                    ? 'bg-primary/10 border-primary/60 ring-1 ring-primary/30 shadow-[0_0_20px_rgba(99,102,241,0.35),0_0_40px_rgba(99,102,241,0.12)]'
                                    : isStartedPastEnd
                                        ? 'bg-amber-500/10 border-amber-500/30'
                                        : isNotAttended
                                            ? 'bg-destructive/5 border-destructive/25 opacity-50'
                                            : isPast
                                                ? 'bg-muted/40 border-border opacity-50'
                                                : 'bg-card border-border hover:border-muted'
                    }`}
                >
                    {/* Status bar takes priority over risk color; falls back to riskColor when status is neutral */}
                    <div
                        className={`absolute top-0 left-0 w-full h-1 ${
                            isCompleted
                                ? 'bg-success'
                                : isNotAttended
                                    ? 'bg-destructive'
                                    : isActive
                                        ? 'bg-primary'
                                        : isStartedPastEnd
                                            ? 'bg-amber-500'
                                            : riskColor
                        } ${isCompleted ? 'opacity-90' : isNotAttended ? 'opacity-40' : 'opacity-40'}`}></div>
                    {isActive && !isCompleted && (
                        <div
                            className="absolute top-0 left-0 h-1 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                            style={{width: `${((new Date().getTime() - new Date(session.startTime).getTime()) / (new Date(session.endTime).getTime() - new Date(session.startTime).getTime())) * 100}%`}}></div>
                    )}

                    {/* Drag Grip Handle (desktop) + Move Buttons (mobile) */}
                    <div
                        className="flex items-center gap-0.5 p-1 shrink-0 transition-colors">
                        <div
                            className="text-slate-600 group-hover/card:text-muted-foreground cursor-grab active:cursor-grabbing hidden sm:block">
                            <GripVertical className="w-4 h-4"/>
                        </div>
                        {/* Mobile move buttons */}
                        <div className="flex flex-col sm:hidden gap-0.5">
                            <button
                                type="button"
                                disabled={index === 0}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (index > 0) onMobileReorder(index, index - 1);
                                }}
                                className="text-muted-foreground disabled:text-slate-800 disabled:cursor-not-allowed hover:text-primary p-0.5 rounded transition-colors"
                            >
                                <ChevronUp className="w-3.5 h-3.5"/>
                            </button>
                            <button
                                type="button"
                                disabled={index === visibleSessionsLength - 1}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (index < visibleSessionsLength - 1) onMobileReorder(index, index + 1);
                                }}
                                className="text-muted-foreground disabled:text-slate-800 disabled:cursor-not-allowed hover:text-primary p-0.5 rounded transition-colors"
                            >
                                <ChevronDown className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    </div>

                    {/* Time block - highlighted based on session state */}
                    <div
                        className="text-xs font-mono font-bold text-left shrink-0 sm:border-r sm:border-border sm:pr-4 uppercase">
                        <span className={isActive ? 'text-indigo-400 font-extrabold' : 'text-muted-foreground'}>{formatTime(session.startTime)}</span>
                        <span className="mx-2 sm:hidden text-slate-600">—</span>
                        <span className="hidden sm:block text-slate-500 text-[10px]">{formatTime(session.endTime)}</span>
                        <span className="sm:hidden text-slate-500">{formatTime(session.endTime)}</span>
                    </div>

                    {/* Task information */}
                    <div className="flex-grow min-w-0">
                        <h4 className={`font-medium text-sm break-words ${isCompleted ? 'text-muted-foreground line-through font-normal' : 'text-foreground'}`}>
                            {session.taskTitle}
                        </h4>

                        {/* Subtask bullet list */}
                        {matchingTask && session.subtaskIds && session.subtaskIds.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                                {session.subtaskIds.map((stId: string) => {
                                    const subtask = findSubtaskById(matchingTask.subtasks, stId);
                                    const stCompleted = subtask?.completed || isCompleted;
                                    return (
                                        <li key={stId} className="flex items-start gap-1.5 text-xs">
                                            <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${stCompleted ? 'bg-success' : 'bg-slate-500'}`}/>
                                            <span className={`${stCompleted ? 'text-muted-foreground line-through' : 'text-foreground'} break-words`}>
                                                {subtask?.title || stId}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {/* Badges row: Quest · Priority · Status */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {/* Quest badge */}
                            {matchingTask?.goalId && (() => {
                                const quest = goals.find(g => g.id === matchingTask.goalId);
                                return quest ? (
                                    <>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider border bg-primary/15 text-primary border-primary/25">
                                            Quest
                                        </span>
                                        <span className="text-slate-700 text-xs">·</span>
                                    </>
                                ) : null;
                            })()}

                            {/* Priority badge */}
                            {matchingTask && !isCompleted && (() => {
                                const highestPriority = getHighestSubtaskPriority(matchingTask.priority, session.subtaskIds, matchingTask.subtasks);
                                return (
                                    <><span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider border ${
                                        highestPriority === 'high' ? 'bg-red-500/15 text-red-400 border-red-500/25' :
                                        highestPriority === 'medium' ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' :
                                        'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                    }`}>{highestPriority}</span>
                                        <span className="text-slate-700 text-xs">·</span>
                                    </>
                                );
                            })()}

                            {/* Status badge */}
                            {isCompleted ? (
                                <span className="text-[10px] text-success flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-ping"/>
                                    Completed
                                </span>
                            ) : isNotAttended ? (
                                <span className="text-[10px] text-destructive/80 flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive"/>
                                    NOT ATTENDED
                                </span>
                            ) : isActive ? (
                                <span className="text-[10px] text-indigo-400 flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"/>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"/>
                                    </span>
                                    Active
                                </span>
                            ) : isStartedPastEnd ? (
                                <span className="text-[10px] text-warning flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning"/>
                                    Started
                                </span>
                            ) : !matchingTask ? (
                                <span className="text-[10px] text-primary font-semibold uppercase tracking-widest">
                                    Discipline Routine
                                </span>
                            ) : (
                                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                                    Scheduled
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Edit Button — hidden for not-attended sessions */}
                    {!isNotAttended && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(index, session);
                            }}
                            className="opacity-0 group-hover/card:opacity-100 text-muted-foreground hover:text-white p-2 rounded-xl hover:bg-card border border-transparent hover:border-border transition-all ml-2 shrink-0 cursor-pointer hidden sm:block"
                            title="Edit Session"
                        >
                            <Pencil className="w-3.5 h-3.5"/>
                        </button>
                    )}

                    {/* Start Button */}
                    {!isCompleted && !session.started && !isPast && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStart(index);
                            }}
                            className="text-primary hover:text-primary/80 p-2 rounded-xl hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all ml-2 shrink-0 cursor-pointer"
                            title="Start Session"
                        >
                            <PlayCircle className="w-4 h-4"/>
                        </button>
                    )}

                    {/* Completion indicator / Mark as completed button */}
                    {!isCompleted ? (
                        canMarkCompleted ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onComplete(index);
                                }}
                                className="text-success hover:text-success/80 p-2 rounded-xl hover:bg-success/10 border border-transparent hover:border-success/20 transition-all ml-2 shrink-0 cursor-pointer"
                                title="Mark as Completed"
                            >
                                <CheckCircle2 className="w-4 h-4"/>
                            </button>
                        ) : null
                    ) : (
                        <div
                            className="text-success shrink-0 self-center ml-2 p-2"
                            title="Completed">
                            <svg className="w-5 h-5" fill="none"
                                 stroke="currentColor" strokeWidth="2.5"
                                 viewBox="0 0 24 24">
                                <path strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"/>
                            </svg>
                        </div>
                    )}

                    {/* Mobile Edit Button */}
                    {!isNotAttended && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(index, session);
                            }}
                            className="text-muted-foreground hover:text-white p-2 rounded-xl hover:bg-card border border-border transition-all mt-3 w-full text-xs font-bold uppercase tracking-wider sm:hidden flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <Pencil className="w-3.5 h-3.5"/> Edit Session
                        </button>
                    )}
                </div>
            </div>

            {/* Insert Divider */}
            {index < visibleSessionsLength - 1 && (
                <div
                    className="relative group/divider h-6 -my-3 flex items-center justify-center">
                    <div
                        className="absolute inset-x-0 h-[1px] bg-slate-800 group-hover/divider:bg-primary/40 transition-all"/>
                    <button
                        type="button"
                        onClick={() => {
                            const prevEnd = isoToTimeStr(session.endTime);
                            const nextStart = nextSessionStartTime ? isoToTimeStr(nextSessionStartTime) : prevEnd;
                            onInsertSession(prevEnd, nextStart);
                        }}
                        className="opacity-100 sm:opacity-0 sm:group-hover/divider:opacity-100 bg-background border border-border hover:border-primary text-muted-foreground hover:text-white rounded-full px-3 py-1 text-[10px] font-bold flex items-center gap-1 shadow-lg transition-all z-10 cursor-pointer"
                    >
                        <Plus className="w-3 h-3 text-indigo-400"/>
                        Insert Session Here
                    </button>
                </div>
            )}
        </div>
    );
}
