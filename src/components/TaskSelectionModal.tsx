import {useState, useMemo} from 'react';
import {Task, Goal} from '../types';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from './ui/dialog';
import {Button} from './ui/button';
import {
    Loader2,
    Swords,
    ListTodo,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    ListTree,
    AlertTriangle
} from 'lucide-react';

interface TaskSelectionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tasks: Task[];
    goals: Goal[];
    onConfirm: (selectedTasks: Task[]) => void;
    isGenerating: boolean;
    title?: string;
    description?: string;
    scheduledTaskTitles?: Set<string>;
}

type Step = 'choose-type' | 'select-quest' | 'select-quest-tasks' | 'select-tasks' | 'confirm-reschedule';

export function TaskSelectionModal({
                                       open,
                                       onOpenChange,
                                       tasks,
                                       goals,
                                       onConfirm,
                                       isGenerating,
                                       title,
                                       description,
                                       scheduledTaskTitles
                                   }: TaskSelectionModalProps) {
    const [step, setStep] = useState<Step>('choose-type');
    const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    const [pendingSelectedTasks, setPendingSelectedTasks] = useState<Task[]>([]);
    const [overlappingTasks, setOverlappingTasks] = useState<Task[]>([]);
    const [preOverlapStep, setPreOverlapStep] = useState<'select-quest-tasks' | 'select-tasks'>('select-quest-tasks');

    const activeQuests = useMemo(() =>
            goals.filter(g => g.type === 'quest' && !g.completed),
        [goals]
    );

    const independentTasks = useMemo(() =>
            tasks.filter(t => !t.goalId && (t.status === 'pending' || t.status === 'in_progress' || t.status === 'todo') && (t.subtasks?.length || 0) > 0),
        [tasks]
    );

    const independentTasksNoSubtasks = useMemo(() =>
            tasks.filter(t => !t.goalId && (t.status === 'pending' || t.status === 'in_progress' || t.status === 'todo') && (!t.subtasks || t.subtasks.length === 0)),
        [tasks]
    );

    const questTasksMap = useMemo(() => {
        const map = new Map<string, Task[]>();
        for (const t of tasks) {
            if (t.goalId) {
                const existing = map.get(t.goalId) || [];
                existing.push(t);
                map.set(t.goalId, existing);
            }
        }
        return map;
    }, [tasks]);

    const selectedQuest = useMemo(() =>
            goals.find(g => g.id === selectedQuestId) || null,
        [goals, selectedQuestId]
    );

    const questTasksForSelection = useMemo(() => {
        if (!selectedQuestId) return [];
        return (questTasksMap.get(selectedQuestId) || [])
            .filter(t => (t.status === 'pending' || t.status === 'in_progress' || t.status === 'todo') && (t.subtasks?.length || 0) > 0);
    }, [questTasksMap, selectedQuestId]);

    const getQuestStats = (questId: string) => {
        const questTasks = questTasksMap.get(questId) || [];
        const schedulableTasks = questTasks.filter(t => (t.subtasks?.length || 0) > 0);
        const totalSubtasks = schedulableTasks.reduce((sum, t) => sum + (t.subtasks?.length || 0), 0);
        const completedSubtasks = schedulableTasks.reduce((sum, t) =>
            sum + (t.subtasks?.filter(st => st.completed).length || 0), 0
        );
        const noSubtaskCount = questTasks.length - schedulableTasks.length;
        return {taskCount: schedulableTasks.length, totalSubtasks, completedSubtasks, noSubtaskCount};
    };

    const handleSelectQuest = (questId: string) => {
        setSelectedQuestId(questId);
        const stats = getQuestStats(questId);
        if (stats.taskCount === 0) return;
        setStep('select-quest-tasks');
    };

    const handleToggleTask = (taskId: string) => {
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    };

    const handleSelectAllQuestTasks = () => {
        const allIds = new Set(questTasksForSelection.map(t => t.id));
        setSelectedTaskIds(allIds);
    };

    const checkOverlapAndProceed = (selected: Task[], sourceStep: 'select-quest-tasks' | 'select-tasks') => {
        if (!scheduledTaskTitles || scheduledTaskTitles.size === 0) {
            onConfirm(selected);
            reset();
            return;
        }
        const overlapping = selected.filter(t => scheduledTaskTitles.has(t.title));
        if (overlapping.length > 0) {
            setPreOverlapStep(sourceStep);
            setPendingSelectedTasks(selected);
            setOverlappingTasks(overlapping);
            setStep('confirm-reschedule');
        } else {
            onConfirm(selected);
            reset();
        }
    };

    const handleConfirmQuestTasks = () => {
        const selected = questTasksForSelection.filter(t => selectedTaskIds.has(t.id));
        if (selected.length === 0) return;
        checkOverlapAndProceed(selected, 'select-quest-tasks');
    };

    const handleConfirmIndependent = () => {
        const selected = independentTasks.filter(t => selectedTaskIds.has(t.id));
        if (selected.length === 0) return;
        checkOverlapAndProceed(selected, 'select-tasks');
    };

    const handleProceedWithOverlap = () => {
        onConfirm(pendingSelectedTasks);
        reset();
    };

    const reset = () => {
        setStep('choose-type');
        setSelectedQuestId(null);
        setSelectedTaskIds(new Set());
        setPendingSelectedTasks([]);
        setOverlappingTasks([]);
    };

    const handleClose = (v: boolean) => {
        reset();
        onOpenChange(v);
    };

    const handleBack = () => {
        if (step === 'select-quest-tasks') {
            setSelectedTaskIds(new Set());
            setStep('select-quest');
        } else if (step === 'select-quest' || step === 'select-tasks') {
            reset();
        } else if (step === 'confirm-reschedule') {
            setPendingSelectedTasks([]);
            setOverlappingTasks([]);
            setStep(preOverlapStep);
        }
    };

    const selectedQuestTaskCount = selectedTaskIds.size;
    const allQuestSelected = selectedQuestTaskCount === questTasksForSelection.length && questTasksForSelection.length > 0;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md bg-[#0d1117] border-[#21262d] text-white">
                <DialogHeader>
                    <DialogTitle className="text-white text-lg">
                        {title || (
                            step === 'choose-type' ? 'Assign Tasks to Timetable' :
                                step === 'select-quest' ? 'Select a Quest' :
                                    step === 'select-quest-tasks' ? `Tasks in "${selectedQuest?.title || ''}"` :
                                        step === 'confirm-reschedule' ? 'Already Scheduled' :
                                            'Select Independent Tasks'
                        )}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-sm">
                        {description || (
                            step === 'choose-type' ? 'Choose what to schedule into your timetable.' :
                                step === 'select-quest' ? 'Pick a quest, then choose which tasks to schedule.' :
                                    step === 'select-quest-tasks' ? 'Select tasks — each task will be broken into subtask-level sessions.' :
                                        step === 'confirm-reschedule' ? 'Some of your selected tasks already exist in the current timetable.' :
                                            'Select tasks to schedule — each will be broken into subtask-level sessions.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {/* Step 1: Choose type */}
                    {step === 'choose-type' && (
                        <>
                            <button
                                onClick={() => setStep('select-quest')}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left group"
                            >
                                <div
                                    className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                                    <Swords className="w-5 h-5"/>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white">Quest</p>
                                    <p className="text-xs text-slate-400">Pick a quest, then select tasks to schedule by
                                        subtasks.</p>
                                </div>
                                <ChevronRight
                                    className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors"/>
                            </button>

                            <button
                                onClick={() => setStep('select-tasks')}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group"
                            >
                                <div
                                    className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                                    <ListTodo className="w-5 h-5"/>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white">Independent Tasks</p>
                                    <p className="text-xs text-slate-400">Select individual tasks not linked to any
                                        quest.</p>
                                </div>
                                <ChevronRight
                                    className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors"/>
                            </button>
                        </>
                    )}

                    {/* Step 2a: Select quest */}
                    {step === 'select-quest' && (
                        <>
                            <button onClick={handleBack}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
                                <ChevronLeft className="w-3 h-3"/> Back
                            </button>
                            {activeQuests.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    <Swords className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                                    <p className="text-sm">No active quests found.</p>
                                    <p className="text-xs mt-1">Create a quest in the Goals page first.</p>
                                </div>
                            ) : (
                                activeQuests.map(quest => {
                                    const stats = getQuestStats(quest.id);
                                    const allScheduled = stats.taskCount > 0 && questTasksMap.get(quest.id)?.every(t => scheduledTaskTitles?.has(t.title));
                                    return (
                                        <button
                                            key={quest.id}
                                            onClick={() => handleSelectQuest(quest.id)}
                                            disabled={stats.taskCount === 0}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                                        >
                                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                                                <Swords className="w-4 h-4"/>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{quest.title}</p>
                                                <p className="text-xs text-slate-400">
                                                    {stats.taskCount} schedulable task{stats.taskCount !== 1 ? 's' : ''}
                                                    {stats.totalSubtasks > 0 && ` · ${stats.completedSubtasks}/${stats.totalSubtasks} subtasks`}
                                                    {stats.noSubtaskCount > 0 && <span
                                                        className="ml-1.5 text-amber-400">· {stats.noSubtaskCount} without subtasks</span>}
                                                    {allScheduled && <span className="ml-1.5 text-emerald-400">· All scheduled</span>}
                                                </p>
                                            </div>
                                            {stats.taskCount > 0 ? (
                                                <ChevronRight
                                                    className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors"/>
                                            ) : (
                                                <span className="text-xs text-slate-500">No tasks</span>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </>
                    )}

                    {/* Step 3: Select tasks within quest */}
                    {step === 'select-quest-tasks' && (
                        <>
                            <button onClick={handleBack}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
                                <ChevronLeft className="w-3 h-3"/> Back
                            </button>
                            {questTasksForSelection.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                                    <p className="text-sm">No schedulable tasks in this quest.</p>
                                    <p className="text-xs mt-1">Tasks need subtasks to be scheduled into timetable
                                        sessions.</p>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={allQuestSelected ? () => setSelectedTaskIds(new Set()) : handleSelectAllQuestTasks}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#30363d] hover:border-indigo-500/40 text-xs text-slate-400 hover:text-indigo-300 transition-all mb-1"
                                    >
                                        <div
                                            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                                allQuestSelected ? 'border-indigo-500 bg-indigo-500' : 'border-[#30363d]'
                                            }`}>
                                            {allQuestSelected && <CheckCircle2 className="w-2.5 h-2.5 text-white"/>}
                                        </div>
                                        {allQuestSelected ? 'Deselect all' : 'Select all tasks'}
                                    </button>

                                    {questTasksForSelection.map(task => {
                                        const isSelected = selectedTaskIds.has(task.id);
                                        const incompleteSubtasks = (task.subtasks || []).filter(st => !st.completed);
                                        return (
                                            <button
                                                key={task.id}
                                                onClick={() => handleToggleTask(task.id)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                                    isSelected
                                                        ? 'border-indigo-500/50 bg-indigo-500/5'
                                                        : 'border-[#21262d] bg-[#161b22] hover:border-[#30363d]'
                                                }`}
                                            >
                                                <div
                                                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                                                        isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-[#30363d]'
                                                    }`}>
                                                    {isSelected && <CheckCircle2 className="w-3 h-3 text-white"/>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{task.title}</p>
                                                    <div
                                                        className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                    task.priority === 'high' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                                        task.priority === 'low' ? 'border-slate-500/30 text-slate-400 bg-slate-500/10' :
                                            'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'
                                }`}>
                              {task.priority}
                            </span>
                                                        {incompleteSubtasks.length > 0 ? (
                                                            <span className="flex items-center gap-0.5">
                                <ListTree className="w-3 h-3"/>
                                                                {incompleteSubtasks.length} subtask{incompleteSubtasks.length !== 1 ? 's' : ''}
                              </span>
                                                        ) : (
                                                            <span className="text-slate-500">No subtasks</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </>
                    )}

                    {/* Step 2b: Select independent tasks */}
                    {step === 'select-tasks' && (
                        <>
                            <button onClick={handleBack}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
                                <ChevronLeft className="w-3 h-3"/> Back
                            </button>
                            {independentTasks.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                                    <p className="text-sm">No schedulable independent tasks found.</p>
                                    <p className="text-xs mt-1">Tasks need subtasks to be scheduled into timetable
                                        sessions.</p>
                                    {independentTasksNoSubtasks.length > 0 && (
                                        <p className="text-xs mt-2 text-amber-400/70">
                                            {independentTasksNoSubtasks.length} task{independentTasksNoSubtasks.length !== 1 ? 's' : ''} without
                                            subtasks excluded.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                independentTasks.map(task => {
                                    const isSelected = selectedTaskIds.has(task.id);
                                    const incompleteSubtasks = (task.subtasks || []).filter(st => !st.completed);
                                    return (
                                        <button
                                            key={task.id}
                                            onClick={() => handleToggleTask(task.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                                isSelected
                                                    ? 'border-emerald-500/50 bg-emerald-500/5'
                                                    : 'border-[#21262d] bg-[#161b22] hover:border-[#30363d]'
                                            }`}
                                        >
                                            <div
                                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                                                    isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-[#30363d]'
                                                }`}>
                                                {isSelected && <CheckCircle2 className="w-3 h-3 text-white"/>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{task.title}</p>
                                                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                  task.priority === 'high' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                                      task.priority === 'low' ? 'border-slate-500/30 text-slate-400 bg-slate-500/10' :
                                          'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'
                              }`}>
                            {task.priority}
                          </span>
                                                    {incompleteSubtasks.length > 0 ? (
                                                        <span className="flex items-center gap-0.5">
                              <ListTree className="w-3 h-3"/>
                                                            {incompleteSubtasks.length} subtask{incompleteSubtasks.length !== 1 ? 's' : ''}
                            </span>
                                                    ) : (
                                                        <span className="text-slate-500">No subtasks</span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </>
                    )}

                    {/* Confirm reschedule: warn about overlapping tasks */}
                    {step === 'confirm-reschedule' && (
                        <>
                            <button onClick={() => {
                                setPendingSelectedTasks([]);
                                setOverlappingTasks([]);
                                setStep(preOverlapStep);
                            }}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
                                <ChevronLeft className="w-3 h-3"/> Back to selection
                            </button>

                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-3">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5"/>
                                    <div>
                                        <p className="text-sm font-semibold text-amber-300">
                                            {overlappingTasks.length} task{overlappingTasks.length !== 1 ? 's' : ''} already
                                            scheduled
                                        </p>
                                        <p className="text-xs text-amber-400/70 mt-1">
                                            These tasks have sessions in the current timetable. Rescheduling will
                                            regenerate the timetable including them.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {overlappingTasks.map(task => (
                                <div key={task.id}
                                     className="flex items-center gap-3 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 mb-1">
                                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0"/>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-amber-200 truncate">{task.title}</p>
                                        <p className="text-xs text-amber-400/60">Currently in timetable</p>
                                    </div>
                                </div>
                            ))}

                            <p className="text-xs text-slate-500 mt-3">
                                You can go back to adjust your selection, or proceed to reschedule.
                            </p>
                        </>
                    )}
                </div>

                <DialogFooter>
                    {step === 'select-quest-tasks' && (
                        <Button
                            onClick={handleConfirmQuestTasks}
                            disabled={selectedQuestTaskCount === 0 || isGenerating}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                            Schedule {selectedQuestTaskCount} Task{selectedQuestTaskCount !== 1 ? 's' : ''}
                        </Button>
                    )}
                    {step === 'select-tasks' && (
                        <Button
                            onClick={handleConfirmIndependent}
                            disabled={selectedTaskIds.size === 0 || isGenerating}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                            Schedule {selectedTaskIds.size} Task{selectedTaskIds.size !== 1 ? 's' : ''}
                        </Button>
                    )}
                    {step === 'confirm-reschedule' && (
                        <Button
                            onClick={handleProceedWithOverlap}
                            disabled={isGenerating}
                            className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                            Proceed Anyway
                        </Button>
                    )}
                    <Button variant="ghost" onClick={() => handleClose(false)}
                            className="text-slate-400 hover:text-white">
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
