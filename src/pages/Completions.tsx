import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { Goal, Task } from '../types';
import { Sparkles, CheckCircle2, Clock, ListTree, Award } from 'lucide-react';

export function Completions() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});

  const fetchGoalsAndTasks = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch goals
      const resGoals = await fetch('/api/goals', { headers });
      if (resGoals.ok) {
        const goalsData = await resGoals.json() as Goal[];
        setGoals(goalsData);
      }

      // Fetch tasks
      const resTasks = await fetch('/api/tasks', { headers });
      if (resTasks.ok) {
        const tasksData = await resTasks.json() as Task[];
        setLinkedTasks(tasksData);
      }
    } catch (err) {
      console.error("Failed to load completions data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGoalsAndTasks();
    }
  }, [user]);

  // Helper functions for completions delay tracking
  const getDelayText = (deadlineStr?: string, completedAtStr?: string) => {
    if (!deadlineStr) return null;
    const deadline = new Date(deadlineStr);
    const completedAt = completedAtStr ? new Date(completedAtStr) : new Date();
    const diffTime = completedAt.getTime() - deadline.getTime();
    if (diffTime <= 0) {
      return { text: "On time", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    }
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      return { text: "1 day delay", color: "text-red-400 bg-red-500/10 border-red-500/20" };
    }
    return { text: `${diffDays} days delay`, color: "text-red-400 bg-red-500/10 border-red-500/20" };
  };

  const getGoalCompletionDate = (goal: Goal) => {
    if (goal.completedAt) return goal.completedAt;
    const qTasks = linkedTasks.filter(t => t.goalId === goal.id && t.status === 'completed');
    const dates = qTasks.map(t => t.completedAt).filter(Boolean) as string[];
    if (dates.length > 0) {
      return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    }
    return undefined;
  };

  const toggleGoalExpand = (goalId: string) => {
    setExpandedGoals(prev => ({ ...prev, [goalId]: !prev[goalId] }));
  };

  const completedQuests = goals.filter(g => g.type === 'quest' && g.completed);
  const activeQuestsWithCompletions = goals.filter(g => g.type === 'quest' && !g.completed && linkedTasks.some(t => t.goalId === g.id && t.status === 'completed'));
  const standaloneCompletedTasks = linkedTasks.filter(t => t.status === 'completed' && (!t.goalId || !goals.some(g => g.id === t.goalId)));

  const hasCompletions = completedQuests.length > 0 || activeQuestsWithCompletions.length > 0 || standaloneCompletedTasks.length > 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none bg-[#030712]">
      <header className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-light text-[#f0f6fc] leading-tight">
            Completions & <br/>
            <span className="font-semibold italic text-emerald-400">Achievements</span>
          </h1>
          <p className="text-xs text-[#8b949e] mt-1">Review, inspect, and celebrate your finished missions and task progressions.</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
          <Award className="w-6 h-6" />
        </div>
      </header>

      {loading ? (
        <div className="text-center text-[#8b949e] py-12">Loading completions board...</div>
      ) : (
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-[#111622] border border-[#21262d] rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Quests Completed</p>
                <p className="text-xl font-bold text-slate-100">{completedQuests.length}</p>
              </div>
            </div>
            <div className="p-4 bg-[#111622] border border-[#21262d] rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-100">
                  {linkedTasks.filter(t => t.status === 'completed').length}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Tasks Completed</p>
              </div>
            </div>
            <div className="p-4 bg-[#111622] border border-[#21262d] rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">On-Time Rate</p>
                <p className="text-xl font-bold text-slate-100">
                  {(() => {
                    const completedWithDeadline = linkedTasks.filter(t => t.status === 'completed' && t.deadline);
                    if (completedWithDeadline.length === 0) return '100%';
                    const onTime = completedWithDeadline.filter(t => {
                      const dl = new Date(t.deadline);
                      const cmp = t.completedAt ? new Date(t.completedAt) : new Date();
                      return cmp <= dl;
                    }).length;
                    return `${Math.round((onTime / completedWithDeadline.length) * 100)}%`;
                  })()}
                </p>
              </div>
            </div>
          </div>

          {/* Combined Completions List */}
          {!hasCompletions ? (
            <div className="text-center py-24 bg-[#0d1117] rounded-3xl border border-dashed border-[#21262d]">
              <CheckCircle2 className="mx-auto h-12 w-12 text-slate-500 mb-4 animate-pulse" />
              <h3 className="text-lg font-medium text-[#f0f6fc]">No completions logged yet</h3>
              <p className="text-[#8b949e] max-w-sm mx-auto mt-1 text-xs">Completed quests and scheduled tasks from your Mission Board will be celebrated right here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Completed Quests section */}
              {completedQuests.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-widest font-bold text-cyan-400 pl-1 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" /> Completed Quests ({completedQuests.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {completedQuests.map(quest => {
                      const questTasks = linkedTasks.filter(t => t.goalId === quest.id);
                      const compDate = getGoalCompletionDate(quest);
                      const delay = getDelayText(quest.targetDate, compDate);
                      const isExpanded = expandedGoals[quest.id] !== undefined ? expandedGoals[quest.id] : false;

                      return (
                        <div 
                          key={quest.id} 
                          onClick={() => toggleGoalExpand(quest.id)}
                          className="bg-[#0d1117] border-2 border-emerald-500/20 rounded-3xl p-5 relative overflow-hidden flex flex-col gap-3 cursor-pointer hover:border-emerald-500/40 transition-colors"
                        >
                          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
                          
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/50 animate-pulse"></span>
                              <span className="text-xs uppercase tracking-widest font-mono font-bold text-emerald-400">Complete</span>
                            </div>
                            <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded uppercase tracking-wider">
                              Quest
                            </span>
                          </div>

                          <div className="flex justify-between items-start mt-1">
                            <div>
                              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 leading-tight">
                                {quest.title}
                              </h3>
                            </div>
                            
                            {delay && (
                              <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded uppercase tracking-wider border ${delay.color}`}>
                                {delay.text}
                              </span>
                            )}
                          </div>

                          {isExpanded ? (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-3 pt-3 border-t border-[#21262d] mt-2"
                            >
                              {quest.description && (
                                <p className="text-[11px] text-[#8b949e] leading-relaxed">{quest.description}</p>
                              )}

                              <div className="pt-1">
                                <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-2">Quest Tasks:</p>
                                <div className="space-y-2">
                                  {questTasks.map(t => {
                                    const tDelay = getDelayText(t.deadline, t.completedAt);
                                    return (
                                      <div key={t.id} className="flex items-center justify-between gap-2 p-2 bg-[#161b22] border border-[#21262d]/50 rounded-xl text-xs">
                                        <span className="text-slate-300 font-medium truncate flex-1 leading-snug">{t.title}</span>
                                        {tDelay && (
                                          <span className={`px-1.5 py-0.5 text-[8px] font-mono font-semibold rounded shrink-0 border ${tDelay.color}`}>
                                            {tDelay.text}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {compDate && (
                                <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between pt-2">
                                  <span>Completed on:</span>
                                  <span>{new Date(compDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                                </div>
                              )}
                            </motion.div>
                          ) : (
                            <div className="text-[10px] text-slate-500 italic text-center mt-1 border-t border-[#21262d]/40 pt-2 font-light">
                              Click to expand quest steps & details
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* In-Progress Quests (Completed Tasks) */}
              {activeQuestsWithCompletions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-widest font-bold text-amber-400 pl-1 flex items-center gap-2">
                    <ListTree className="w-3.5 h-3.5" /> Tasks Grouped in Active Quests
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeQuestsWithCompletions.map(quest => {
                      const compTasks = linkedTasks.filter(t => t.goalId === quest.id && t.status === 'completed');
                      return (
                        <div key={quest.id} className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 flex flex-col gap-3">
                          <div>
                            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-bold uppercase tracking-wider rounded">
                              Quest Active
                            </span>
                            <h3 className="text-sm font-bold text-slate-200 mt-2 leading-tight">{quest.title}</h3>
                          </div>

                          <div className="space-y-2">
                            {compTasks.map(t => {
                              const tDelay = getDelayText(t.deadline, t.completedAt);
                              return (
                                <div key={t.id} className="flex items-center justify-between gap-2 p-2 bg-[#161b22] border border-[#21262d]/50 rounded-xl text-xs">
                                  <span className="text-slate-300 font-medium truncate flex-1 leading-snug">{t.title}</span>
                                  {tDelay && (
                                    <span className={`px-1.5 py-0.5 text-[8px] font-mono font-semibold rounded shrink-0 border ${tDelay.color}`}>
                                      {tDelay.text}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Standalone completed tasks */}
              {standaloneCompletedTasks.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-widest font-bold text-emerald-400 pl-1 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Standalone Completed Tasks ({standaloneCompletedTasks.length})
                  </h4>
                  <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {standaloneCompletedTasks.map(t => {
                        const tDelay = getDelayText(t.deadline, t.completedAt);
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-3 p-3 bg-[#161b22] border border-[#21262d] rounded-2xl text-xs">
                            <span className="text-slate-200 font-semibold truncate flex-1 leading-snug">{t.title}</span>
                            {tDelay && (
                              <span className={`px-1.5 py-0.5 text-[8px] font-mono font-semibold rounded shrink-0 border ${tDelay.color}`}>
                                {tDelay.text}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
