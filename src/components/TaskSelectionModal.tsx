import { useState, useMemo } from 'react';
import { Task, Goal } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Loader2, Swords, ListTodo, ChevronRight, ChevronLeft, CheckCircle2, ListTree } from 'lucide-react';

interface TaskSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  goals: Goal[];
  onConfirm: (selectedTasks: Task[]) => void;
  isGenerating: boolean;
  title?: string;
  description?: string;
}

type Step = 'choose-type' | 'select-quest' | 'select-quest-tasks' | 'select-tasks';

export function TaskSelectionModal({ open, onOpenChange, tasks, goals, onConfirm, isGenerating, title, description }: TaskSelectionModalProps) {
  const [step, setStep] = useState<Step>('choose-type');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const activeQuests = useMemo(() =>
    goals.filter(g => g.type === 'quest' && !g.completed),
    [goals]
  );

  const independentTasks = useMemo(() =>
    tasks.filter(t => !t.goalId && (t.status === 'pending' || t.status === 'in_progress')),
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
      .filter(t => t.status === 'pending' || t.status === 'in_progress');
  }, [questTasksMap, selectedQuestId]);

  const getQuestStats = (questId: string) => {
    const questTasks = questTasksMap.get(questId) || [];
    const totalSubtasks = questTasks.reduce((sum, t) => sum + (t.subtasks?.length || 0), 0);
    const completedSubtasks = questTasks.reduce((sum, t) =>
      sum + (t.subtasks?.filter(st => st.completed).length || 0), 0
    );
    return { taskCount: questTasks.length, totalSubtasks, completedSubtasks };
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

  const handleConfirmQuestTasks = () => {
    const selected = questTasksForSelection.filter(t => selectedTaskIds.has(t.id));
    if (selected.length === 0) return;
    onConfirm(selected);
    reset();
  };

  const handleConfirmIndependent = () => {
    const selected = independentTasks.filter(t => selectedTaskIds.has(t.id));
    if (selected.length === 0) return;
    onConfirm(selected);
    reset();
  };

  const reset = () => {
    setStep('choose-type');
    setSelectedQuestId(null);
    setSelectedTaskIds(new Set());
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
              'Select Independent Tasks'
            )}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            {description || (
              step === 'choose-type' ? 'Choose what to schedule into your timetable.' :
              step === 'select-quest' ? 'Pick a quest, then choose which tasks to schedule.' :
              step === 'select-quest-tasks' ? 'Select tasks — each task will be broken into subtask-level sessions.' :
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
                <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                  <Swords className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Quest</p>
                  <p className="text-xs text-slate-400">Pick a quest, then select tasks to schedule by subtasks.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
              </button>

              <button
                onClick={() => setStep('select-tasks')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group"
              >
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <ListTodo className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Independent Tasks</p>
                  <p className="text-xs text-slate-400">Select individual tasks not linked to any quest.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </button>
            </>
          )}

          {/* Step 2a: Select quest */}
          {step === 'select-quest' && (
            <>
              <button onClick={handleBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              {activeQuests.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Swords className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active quests found.</p>
                  <p className="text-xs mt-1">Create a quest in the Goals page first.</p>
                </div>
              ) : (
                activeQuests.map(quest => {
                  const stats = getQuestStats(quest.id);
                  return (
                    <button
                      key={quest.id}
                      onClick={() => handleSelectQuest(quest.id)}
                      disabled={stats.taskCount === 0}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                    >
                      <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Swords className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{quest.title}</p>
                        <p className="text-xs text-slate-400">
                          {stats.taskCount} task{stats.taskCount !== 1 ? 's' : ''}
                          {stats.totalSubtasks > 0 && ` · ${stats.completedSubtasks}/${stats.totalSubtasks} subtasks`}
                        </p>
                      </div>
                      {stats.taskCount > 0 ? (
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
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
              <button onClick={handleBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              {questTasksForSelection.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pending tasks in this quest.</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={allQuestSelected ? () => setSelectedTaskIds(new Set()) : handleSelectAllQuestTasks}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#30363d] hover:border-indigo-500/40 text-xs text-slate-400 hover:text-indigo-300 transition-all mb-1"
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      allQuestSelected ? 'border-indigo-500 bg-indigo-500' : 'border-[#30363d]'
                    }`}>
                      {allQuestSelected && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
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
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                          isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-[#30363d]'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{task.title}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                              task.priority === 'high' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                              task.priority === 'low' ? 'border-slate-500/30 text-slate-400 bg-slate-500/10' :
                              'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'
                            }`}>
                              {task.priority}
                            </span>
                            {incompleteSubtasks.length > 0 ? (
                              <span className="flex items-center gap-0.5">
                                <ListTree className="w-3 h-3" />
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
              <button onClick={handleBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              {independentTasks.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No independent tasks found.</p>
                  <p className="text-xs mt-1">Add tasks in the Mission Board page.</p>
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
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                        isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-[#30363d]'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{task.title}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                            task.priority === 'high' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                            task.priority === 'low' ? 'border-slate-500/30 text-slate-400 bg-slate-500/10' :
                            'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'
                          }`}>
                            {task.priority}
                          </span>
                          {incompleteSubtasks.length > 0 ? (
                            <span className="flex items-center gap-0.5">
                              <ListTree className="w-3 h-3" />
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
        </div>

        <DialogFooter>
          {step === 'select-quest-tasks' && (
            <Button
              onClick={handleConfirmQuestTasks}
              disabled={selectedQuestTaskCount === 0 || isGenerating}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Schedule {selectedQuestTaskCount} Task{selectedQuestTaskCount !== 1 ? 's' : ''}
            </Button>
          )}
          {step === 'select-tasks' && (
            <Button
              onClick={handleConfirmIndependent}
              disabled={selectedTaskIds.size === 0 || isGenerating}
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Schedule {selectedTaskIds.size} Task{selectedTaskIds.size !== 1 ? 's' : ''}
            </Button>
          )}
          <Button variant="ghost" onClick={() => handleClose(false)} className="text-slate-400 hover:text-white">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
