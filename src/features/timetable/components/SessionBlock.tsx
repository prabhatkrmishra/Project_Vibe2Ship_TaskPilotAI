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
                    className={`absolute -left-[33px] top-6 w-4 h-4 rounded-full border-2 bg-background transition-all duration-300 ${
                        isCompleted
                            ? 'border-emerald-400 bg-emerald-400/30 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                            : isActive
                                ? 'border-cyan-300 bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,1),0_0_16px_rgba(34,211,238,0.8),0_0_32px_rgba(34,211,238,0.4)] animate-pulse'
                                : isNotAttended
                                    ? 'border-rose-500/70 bg-rose-500/20'
                                    : 'border-slate-700 bg-background'
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
                    className={`flex flex-col sm:flex-row gap-3 p-4 rounded-2xl border-l-[3px] border-y border-r items-start sm:items-center relative overflow-hidden transition-all duration-500 group/card ${
                        isDragged ? 'opacity-30' : ''
                    } ${
                        highlighted
                            ? 'ring-2 ring-fuchsia-400/80 border-l-fuchsia-400 border-y-fuchsia-400/40 border-r-fuchsia-400/40 shadow-[0_0_20px_rgba(232,121,249,0.45),0_0_40px_rgba(232,121,249,0.15)] scale-[1.01]'
                            : ''
                    } ${
                        isDragOver && !isDragged
                            ? 'border-dashed border-cyan-400 bg-cyan-400/10 shadow-[0_0_12px_rgba(34,211,238,0.25)] scale-[1.01]'
                            : isCompleted
                                ? 'bg-emerald-400/[0.06] border-l-emerald-400/70 border-y-emerald-400/15 border-r-emerald-400/15 opacity-80'
                                : isActive
                                    ? 'bg-cyan-400/[0.07] border-l-cyan-300 border-y-cyan-400/25 border-r-cyan-400/25 shadow-[0_0_25px_rgba(34,211,238,0.25),0_0_50px_rgba(34,211,238,0.08)]'
                                    : isStartedPastEnd
                                        ? 'bg-amber-400/[0.06] border-l-amber-400/70 border-y-amber-400/20 border-r-amber-400/20'
                                        : isNotAttended
                                            ? 'bg-rose-500/[0.03] border-l-rose-500/50 border-y-rose-500/15 border-r-rose-500/15 opacity-50'
                                            : isPast
                                                ? 'bg-muted/40 border-l-slate-700 border-y-border border-r-border opacity-50'
                                                : 'bg-[#0b0f1a] bg-[radial-gradient(circle_at_10%_20%,rgba(34,211,238,0.05),transparent_40%),radial-gradient(circle_at_90%_80%,rgba(167,139,250,0.05),transparent_40%)] border-l-slate-600 border-y-white/[0.06] border-r-white/[0.06] hover:border-l-violet-400/70 hover:shadow-[0_0_16px_rgba(167,139,250,0.12)]'
                    }`}
                >
                    {isActive && !isCompleted && (
                        <div
                            className="absolute top-0 left-0 h-[3px] bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]"
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
                                className="text-cyan-400/70 disabled:text-slate-800 disabled:cursor-not-allowed hover:text-cyan-300 hover:drop-shadow-[0_0_6px_rgba(34,211,238,0.6)] p-0.5 rounded transition-colors"
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
                                className="text-amber-400/70 disabled:text-slate-800 disabled:cursor-not-allowed hover:text-amber-300 hover:drop-shadow-[0_0_6px_rgba(252,211,77,0.6)] p-0.5 rounded transition-colors"
                            >
                                <ChevronDown className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    </div>

                    {/* Time block - highlighted based on session state */}
                    <div
                        className="text-xs font-mono font-bold text-left shrink-0 sm:border-r sm:border-white/[0.08] sm:pr-4 uppercase">
                        <span className={isActive ? 'text-cyan-300 font-extrabold drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]' : 'text-muted-foreground'}>{formatTime(session.startTime)}</span>
                        <span className="mx-2 sm:hidden text-slate-600">—</span>
                        <span className="hidden sm:block text-slate-500 text-[10px]">{formatTime(session.endTime)}</span>
                        <span className="sm:hidden text-slate-500">{formatTime(session.endTime)}</span>
                    </div>

                    {/* Task information */}
                    <div className="flex-grow min-w-0">
                        {(() => {
                            const headingPriority = matchingTask
                                ? getHighestSubtaskPriority(matchingTask.priority, session.subtaskIds, matchingTask.subtasks)
                                : null;
                            const headingColorClass = isCompleted
                                ? 'text-muted-foreground line-through font-normal'
                                : headingPriority === 'high'
                                    ? 'text-rose-400 drop-shadow-[0_0_10px_rgba(251,113,133,0.35)]'
                                    : headingPriority === 'medium'
                                        ? 'text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.3)]'
                                        : headingPriority === 'low'
                                            ? 'text-emerald-300 drop-shadow-[0_0_10px_rgba(110,231,183,0.3)]'
                                            : 'text-foreground';
                            return (
                                <h4 className={`font-semibold text-base break-words ${headingColorClass}`}>
                                    {session.taskTitle}
                                </h4>
                            );
                        })()}

                        {/* Subtask bullet list */}
                        {matchingTask && session.subtaskIds && session.subtaskIds.length > 0 && (
                            <ul className="mt-2.5 space-y-1.5">
                                {session.subtaskIds.map((stId: string) => {
                                    const subtask = findSubtaskById(matchingTask.subtasks, stId);
                                    const stCompleted = subtask?.completed || isCompleted;
                                    return (
                                        <li
                                            key={stId}
                                            className={`flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
                                                stCompleted
                                                    ? 'border-transparent'
                                                    : 'bg-black/25 border-white/[0.08] hover:bg-black/35 hover:border-white/[0.14]'
                                            }`}
                                        >
                                            <span
                                                className={`mt-[3px] shrink-0 rounded-full flex items-center justify-center ${
                                                    stCompleted
                                                        ? 'w-3.5 h-3.5 bg-emerald-400/20 text-emerald-300'
                                                        : 'w-1.5 h-1.5 mt-[7px] bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.9)] ring-2 ring-violet-400/20'
                                                }`}
                                            >
                                                {stCompleted && (
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-2.5 h-2.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                                    </svg>
                                                )}
                                            </span>
                                            <span className={`${stCompleted ? 'text-muted-foreground line-through' : 'text-foreground/90'} break-words leading-relaxed`}>
                                                {subtask?.title || stId}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {/* Badges row: Quest · Priority · Status */}
                        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-white/[0.06] flex-wrap">
                            {/* Quest badge */}
                            {matchingTask?.goalId && (() => {
                                const quest = goals.find(g => g.id === matchingTask.goalId);
                                return quest ? (
                                    <>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider border bg-violet-400/10 text-violet-300 border-violet-400/40 shadow-[0_0_8px_rgba(167,139,250,0.15)]">
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
                                        highestPriority === 'high' ? 'bg-rose-500/10 text-rose-300 border-rose-400/40 shadow-[0_0_8px_rgba(251,113,133,0.2)]' :
                                        highestPriority === 'medium' ? 'bg-amber-400/10 text-amber-300 border-amber-400/40 shadow-[0_0_8px_rgba(252,211,77,0.15)]' :
                                        'bg-emerald-400/10 text-emerald-300 border-emerald-400/40 shadow-[0_0_8px_rgba(110,231,183,0.15)]'
                                    }`}>{highestPriority}</span>
                                        <span className="text-slate-700 text-xs">·</span>
                                    </>
                                );
                            })()}

                            {/* Status badge */}
                            {isCompleted ? (
                                <span className="text-[10px] text-emerald-300 flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-ping"/>
                                    Completed
                                </span>
                            ) : isNotAttended ? (
                                <span className="text-[10px] text-rose-400/90 flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"/>
                                    NOT ATTENDED
                                </span>
                            ) : isActive ? (
                                <span className="text-[10px] text-cyan-300 flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"/>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.9)]"/>
                                    </span>
                                    Active
                                </span>
                            ) : isStartedPastEnd ? (
                                <span className="text-[10px] text-amber-300 flex items-center gap-1 font-bold uppercase tracking-widest">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(252,211,77,0.7)]"/>
                                    Started
                                </span>
                            ) : !matchingTask ? (
                                <span className="text-[10px] text-violet-300 font-semibold uppercase tracking-widest">
                                    Discipline Routine
                                </span>
                            ) : (
                                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                                    Scheduled
                                </span>
                            )}

                            {/* Start + Edit buttons — inline at end of badges row (desktop) */}
                            <div className="hidden sm:flex items-center gap-1 ml-auto">
                                {!isCompleted && !session.started && !isPast && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStart(index);
                                        }}
                                        className="text-cyan-300 hover:text-cyan-200 p-1.5 rounded-lg hover:bg-cyan-400/10 border border-transparent hover:border-cyan-400/30 hover:shadow-[0_0_10px_rgba(34,211,238,0.25)] transition-all shrink-0 cursor-pointer"
                                        title="Start Session"
                                    >
                                        <PlayCircle className="w-4 h-4"/>
                                    </button>
                                )}
                                {!isNotAttended && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit(index, session);
                                        }}
                                        className="opacity-0 group-hover/card:opacity-100 text-violet-300 hover:text-violet-200 p-1.5 rounded-lg hover:bg-violet-400/10 border border-transparent hover:border-violet-400/30 hover:shadow-[0_0_10px_rgba(167,139,250,0.25)] transition-all shrink-0 cursor-pointer"
                                        title="Edit Session"
                                    >
                                        <Pencil className="w-3.5 h-3.5"/>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Start Button (mobile) */}
                    {!isCompleted && !session.started && !isPast && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStart(index);
                            }}
                            className="sm:hidden text-cyan-300 hover:text-cyan-200 p-2 rounded-xl hover:bg-cyan-400/10 border border-transparent hover:border-cyan-400/30 hover:shadow-[0_0_10px_rgba(34,211,238,0.25)] transition-all ml-2 shrink-0 cursor-pointer"
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
                                className="text-emerald-300 hover:text-emerald-200 p-2 rounded-xl hover:bg-emerald-400/10 border border-transparent hover:border-emerald-400/30 hover:shadow-[0_0_10px_rgba(52,211,153,0.25)] transition-all ml-2 shrink-0 cursor-pointer"
                                title="Mark as Completed"
                            >
                                <CheckCircle2 className="w-4 h-4"/>
                            </button>
                        ) : null
                    ) : (
                        <div
                            className="text-emerald-300 shrink-0 self-center ml-2 p-2"
                            title="Completed">
                            <svg className="w-5 h-5 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]" fill="none"
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
                            className="text-violet-300 hover:text-violet-200 p-2 rounded-xl hover:bg-violet-400/10 border border-white/[0.08] hover:border-violet-400/30 transition-all mt-3 w-full text-xs font-bold uppercase tracking-wider sm:hidden flex items-center justify-center gap-1.5 cursor-pointer"
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
                        className="absolute inset-x-0 h-[1px] bg-white/[0.06] group-hover/divider:bg-violet-400/40 transition-all"/>
                    <button
                        type="button"
                        onClick={() => {
                            const prevEnd = isoToTimeStr(session.endTime);
                            const nextStart = nextSessionStartTime ? isoToTimeStr(nextSessionStartTime) : prevEnd;
                            onInsertSession(prevEnd, nextStart);
                        }}
                        className="opacity-100 sm:opacity-0 sm:group-hover/divider:opacity-100 bg-background border border-white/[0.1] hover:border-violet-400/60 hover:shadow-[0_0_12px_rgba(167,139,250,0.25)] text-muted-foreground hover:text-white rounded-full px-3 py-1 text-[10px] font-bold flex items-center gap-1 shadow-lg transition-all z-10 cursor-pointer"
                    >
                        <Plus className="w-3 h-3 text-violet-300"/>
                        Insert Session Here
                    </button>
                </div>
            )}
        </div>
    );
}