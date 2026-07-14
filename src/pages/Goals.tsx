import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { Goal, Task } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Flame, CheckCircle2, Circle, Plus, Trash2, Sparkles, Bell, X, Clock, ListTree, Pencil, Plane, Target, Route } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { toast } from 'sonner';
import { showSuccess, showError } from '../lib/toastTheme';
import { getDelayText, getGoalCompletionDate } from '../lib/utils';

export function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const shownCompletionsRef = useRef<Set<string>>(new Set());
  const syncingGoalsRef = useRef<Map<string, { progress: number, completed: boolean }>>(new Map());

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'habit' | 'quest'>('habit');
  const [targetDate, setTargetDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [timetableSessions, setTimetableSessions] = useState<any[]>([]);
  const [isCheckingTimetable, setIsCheckingTimetable] = useState(false);
  const [timetableConflict, setTimetableConflict] = useState<string | null>(null);

  useEffect(() => {
    const checkTargetDateTimetable = async () => {
      if (!user || !targetDate || type !== 'quest') {
        setTimetableConflict(null);
        setTimetableSessions([]);
        return;
      }
      setIsCheckingTimetable(true);
      setTimetableConflict(null);
      try {
        const token = await user.getIdToken();
        const tDate = new Date(targetDate);
        const year = tDate.getFullYear();
        const month = String(tDate.getMonth() + 1).padStart(2, '0');
        const day = String(tDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const res = await fetch(`/api/plans/${dateStr}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const sessions = data.sessions || [];
          setTimetableSessions(sessions);

          const tHours = tDate.getHours();
          const tMins = tDate.getMinutes();
          const targetVal = tHours * 60 + tMins;

          for (const s of sessions) {
            const sStart = new Date(s.startTime);
            const sEnd = new Date(s.endTime);
            const startVal = sStart.getHours() * 60 + sStart.getMinutes();
            const endVal = sEnd.getHours() * 60 + sEnd.getMinutes();

            if (targetVal >= startVal && targetVal < endVal) {
              const isRoutine = /sleep|lunch|dinner|breakfast|workout|commute|rest|relax|break/i.test(s.taskTitle);
              const displayTime = sStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + sEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              if (isRoutine) {
                setTimetableConflict(`⚠️ Overlap Warning: Selected deadline time (${tDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) falls during your scheduled routine "${s.taskTitle}" (${displayTime}). Adjusting is recommended.`);
              } else {
                setTimetableConflict(`⚠️ Note: Selected deadline overlaps with scheduled session "${s.taskTitle}" (${displayTime}).`);
              }
              break;
            }
          }
        } else {
          setTimetableSessions([]);
        }
      } catch (err) {
        console.error("Failed to fetch timetable in goals check:", err);
      } finally {
        setIsCheckingTimetable(false);
      }
    };

    checkTargetDateTimetable();
  }, [targetDate, type, user]);

  const [activeTab, setActiveTab] = useState<'goals' | 'habits'>('goals');
  const [dismissedReminders, setDismissedReminders] = useState<Record<string, boolean>>({});
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});

  // Quest Manual Task & Editing State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [newManualTaskTitles, setNewManualTaskTitles] = useState<Record<string, string>>({});
  const [questTrails, setQuestTrails] = useState<Record<string, any[]>>({});

  const toggleGoalExpand = (goalId: string) => {
    setExpandedGoals(prev => ({ ...prev, [goalId]: !prev[goalId] }));
    if (!expandedGoals[goalId]) fetchQuestTrail(goalId);
  };

  const tasksByGoal = (goalId: string) =>
    linkedTasks.filter(t => t.goalId === goalId).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  const fetchQuestTrail = async (goalId: string) => {
    if (!user || questTrails[goalId]) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/plans/trail/${goalId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const trail = await res.json();
        setQuestTrails(prev => ({ ...prev, [goalId]: trail }));
      }
    } catch (err) {
      console.error("Failed to fetch quest trail:", err);
    }
  };

  type Reminder = { id: string; goalId: string; tone: 'risk' | 'urgent' | 'nudge'; text: string };

  const reminders: Reminder[] = goals.reduce<Reminder[]>((acc, goal) => {
    if (goal.completed) return acc;

    if (goal.type === 'habit') {
      const streak = goal.streak || 0;
      if (streak >= 3) {
        acc.push({
          id: `habit-streak-${goal.id}`,
          goalId: goal.id,
          tone: 'nudge',
          text: `You're on a ${streak}-day streak for "${goal.title}". Log it today to keep it alive.`
        });
      } else if (streak === 0 && goal.progress > 0) {
        acc.push({
          id: `habit-reset-${goal.id}`,
          goalId: goal.id,
          tone: 'risk',
          text: `Your streak for "${goal.title}" reset. A quick win today gets you back on track.`
        });
      }
    }

    if (goal.type === 'quest') {
      const tasks = tasksByGoal(goal.id);
      const incomplete = tasks.filter(t => t.status !== 'completed');
      const overdue = incomplete.filter(t => new Date(t.deadline).getTime() < Date.now());

      if (tasks.length === 0) {
        // still generating or generation failed silently
      } else if (overdue.length > 0) {
        acc.push({
          id: `quest-overdue-${goal.id}`,
          goalId: goal.id,
          tone: 'urgent',
          text: `"${goal.title}" has ${overdue.length} overdue task(s). Check Mission Board to reschedule.`
        });
      } else {
        const next = incomplete.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0];
        if (next) {
          const hoursLeft = (new Date(next.deadline).getTime() - Date.now()) / 36e5;
          if (hoursLeft < 48) {
            acc.push({
              id: `quest-soon-${goal.id}`,
              goalId: goal.id,
              tone: 'urgent',
              text: `Next task for "${goal.title}" — "${next.title}" — is due in ${Math.round(hoursLeft)}h.`
            });
          }
        }
      }
    }

    return acc;
  }, []).filter(r => !dismissedReminders[r.id]);

  const dismissReminder = (id: string) => {
    setDismissedReminders(prev => ({ ...prev, [id]: true }));
  };

  const showBeautifulCompletion = (goalTitle: string, goalType: 'habit' | 'quest') => {
    toast.custom((t) => (
      <div className="relative flex flex-col gap-3 p-6 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#0f172a] border-2 border-emerald-400/50 rounded-3xl shadow-[0_20px_50px_rgba(16,185,129,0.3)] max-w-sm w-full text-white pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-6 h-6 text-white animate-bounce" />
            </div>
            <div>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold uppercase tracking-widest rounded-full">
                Goal Accomplished
              </span>
              <h4 className="font-black text-[#f0f6fc] text-sm uppercase tracking-wide mt-0.5">Mission Complete</h4>
            </div>
          </div>
          <button onClick={() => toast.dismiss(t)} className="text-slate-400 hover:text-white text-xs font-bold transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-xl">
            Dismiss
          </button>
        </div>

        <div className="mt-2 border-t border-slate-800 pt-3">
          <p className="text-slate-200 text-sm leading-relaxed">
            Outstanding progress! You have successfully completed: <span className="text-emerald-400 font-extrabold text-base tracking-tight block mt-1 drop-shadow-[0_2px_8px_rgba(52,211,153,0.2)]">{goalTitle}</span>
          </p>
          <span className="inline-block mt-3 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold uppercase tracking-widest rounded-full">
            {goalType === 'habit' ? '🔁 Habit Streak Completed' : '🏆 Quest Complete!'}
          </span>
        </div>
      </div>
    ), {
      duration: 6000,
    });
  };

  const fetchGoalsAndTasks = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch goals
      const resGoals = await fetch('/api/goals', { headers });
      if (resGoals.ok) {
        const goalsData = await resGoals.json() as Goal[];
        const sortedData = goalsData.sort((a, b) => {
          if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
          }
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        setGoals(sortedData);
      }

      // Fetch tasks
      const resTasks = await fetch('/api/tasks', { headers });
      if (resTasks.ok) {
        const tasksData = await resTasks.json() as Task[];
        setLinkedTasks(tasksData);
      }
    } catch (err) {
      console.error("Failed to load goals and tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGoalsAndTasks();
    }
  }, [user]);

  const syncQuestProgress = async (goalId: string, taskList: Task[]) => {
    if (!user) return;
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const tasks = taskList.filter(t => t.goalId === goalId);
    if (tasks.length === 0) return;

    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completedCount / tasks.length) * 100);
    const isCompleted = progress === 100;

    if (goal.progress === progress && goal.completed === isCompleted) return;

    // Guard duplicate or subsequent sync calls for this state change
    const cached = syncingGoalsRef.current.get(goalId);
    if (cached && cached.progress === progress && cached.completed === isCompleted) {
      return;
    }
    syncingGoalsRef.current.set(goalId, { progress, completed: isCompleted });

    const shouldShowCompletion = isCompleted && !goal.completed && !shownCompletionsRef.current.has(goalId);
    if (shouldShowCompletion) {
      shownCompletionsRef.current.add(goalId);
    }

    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ progress, completed: isCompleted })
      });
      if (res.ok) {
        if (shouldShowCompletion) {
          showBeautifulCompletion(goal.title, 'quest');
        }
        fetchGoalsAndTasks();
      }
    } catch (error) {
      console.error('Failed to sync quest progress', error);
    }
  };

  useEffect(() => {
    const questIds = Array.from(new Set(linkedTasks.map(t => t.goalId).filter(Boolean))) as string[];
    questIds.forEach(id => syncQuestProgress(id, linkedTasks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTasks]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !user) return;

    setIsCreating(true);
    try {
      const token = await user.getIdToken();
      const resGoal = await fetch('/api/goals', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          description,
          type,
          targetDate: type === 'quest' ? targetDate : null,
          scheduledTime: type === 'habit' && scheduledTime ? scheduledTime : null,
          progress: 0,
          streak: type === 'habit' ? 0 : null,
          completed: false,
          createdAt: new Date().toISOString()
        })
      });

      if (!resGoal.ok) throw new Error("Failed to create goal");
      const goalRef = await resGoal.json();

      if (type === 'quest') {
        const selectedModel = localStorage.getItem('default_gemini_model') || 'gemini-3.1-flash-lite';
        const res = await fetch('/api/generate-quest-steps', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title,
            description,
            targetDate,
            createdDate: new Date().toISOString(),
            model: selectedModel
          })
        });

        if (res.ok) {
          const data = await res.json();
          const generatedTasks = Array.isArray(data.tasks) ? data.tasks : [];

          if (generatedTasks.length > 0) {
            for (const t of generatedTasks) {
              await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  title: t.title || 'Untitled step',
                  description: t.description || '',
                  deadline: t.deadline || (targetDate ? new Date(targetDate).toISOString() : new Date().toISOString()),
                  priority: t.priority || 'medium',
                  status: 'pending',
                  category: 'quest',
                  estimatedHours: t.estimatedHours || 1,
                  riskScore: t.riskScore ?? 30,
                  resources: t.resources || [],
                  subtasks: [],
                  goalId: goalRef.id,
                  createdAt: new Date().toISOString()
                })
              });
            }
            showSuccess(`Quest created with ${generatedTasks.length} scheduled task(s)!`);
          } else {
            showError("AI couldn't generate tasks. You can add them manually from Mission Board.");
          }
        } else {
          showError("Failed to generate tasks with AI. You can add them manually from Mission Board.");
        }
      } else {
        showSuccess("Habit created successfully!");
      }

      setIsDialogOpen(false);
      setTitle('');
      setDescription('');
      setTargetDate('');
      setScheduledTime('');
      setType('habit');
      fetchGoalsAndTasks();
    } catch (error) {
      console.error(error);
      showError("Failed to create goal");
    } finally {
      setIsCreating(false);
    }
  };

  const updateProgress = async (goalId: string, increment: boolean) => {
    if (!user) return;
    const goal = goals.find(g => g.id === goalId);
    if (!goal || goal.type !== 'habit') return;

    try {
      const token = await user?.getIdToken();
      let newStreak = goal.streak || 0;
      let newProgress = goal.progress;
      const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

      if (increment) {
        newProgress += 1;
        if (goal.lastLogged !== today) {
          newStreak += 1;
        }
      } else {
        newStreak = 0;
      }

      await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          progress: newProgress,
          streak: newStreak,
          lastLogged: increment ? today : goal.lastLogged
        })
      });

      showSuccess(increment ? "Habit logged!" : "Streak reset. Tomorrow's a fresh start.");
      fetchGoalsAndTasks();
    } catch (error) {
      showError("Failed to update progress");
    }
  };

  const deleteGoal = async (goal: Goal) => {
    if (!user) return;
    try {
      const token = await user?.getIdToken();
      const deletedTasks = linkedTasks.filter(t => t.goalId === goal.id);

      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error();

      const labelType = goal.type === 'quest' ? 'Quest' : 'Habit';

      showSuccess(`${labelType} deleted`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              const resGoal = await fetch('/api/goals', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(goal)
              });
              
              if (resGoal.ok && deletedTasks.length > 0) {
                for (const t of deletedTasks) {
                  await fetch('/api/tasks', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(t)
                  });
                }
              }

              showSuccess(`${labelType} restored`);
              fetchGoalsAndTasks();
            } catch (e) {
              showError(`Failed to restore ${labelType.toLowerCase()}`);
            }
          }
        },
        duration: 5000,
      });

      fetchGoalsAndTasks();
    } catch (error) {
      showError(`Failed to delete ${goal.type === 'quest' ? 'quest' : 'habit'}`);
    }
  };

  const toggleLinkedTask = async (taskId: string, currentStatus: string) => {
    if (!user) return;
    try {
      const token = await user?.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: currentStatus === 'completed' ? 'pending' : 'completed'
        })
      });
      fetchGoalsAndTasks();
    } catch (error) {
      showError("Failed to update task");
    }
  };

  const handleStartEditTask = (taskId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTaskId(taskId);
    setEditingTaskText(currentTitle);
  };

  const handleSaveTaskTitle = async (taskId: string) => {
    if (!user) return;
    if (!editingTaskText.trim()) {
      setEditingTaskId(null);
      return;
    }
    try {
      const token = await user?.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: editingTaskText.trim()
        })
      });
      showSuccess("Task updated!");
      fetchGoalsAndTasks();
    } catch (error) {
      showError("Failed to update task");
    } finally {
      setEditingTaskId(null);
    }
  };

  const handleAddManualTaskToQuest = async (goalId: string, targetDate: string | null) => {
    const title = newManualTaskTitles[goalId]?.trim();
    if (!title || !user) return;

    try {
      const token = await user.getIdToken();
      await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          description: '',
          deadline: targetDate ? new Date(targetDate).toISOString() : new Date().toISOString(),
          priority: 'medium',
          status: 'pending',
          category: 'quest',
          estimatedHours: 2,
          riskScore: 30,
          subtasks: [],
          goalId: goalId,
          createdAt: new Date().toISOString()
        })
      });
      showSuccess("Task added to Quest!");
      setNewManualTaskTitles(prev => ({ ...prev, [goalId]: '' }));
      fetchGoalsAndTasks();
    } catch (error) {
      showError("Failed to add task");
    }
  };

  const filteredGoals = goals.filter(g => {
    if (g.completed) return false;
    return activeTab === 'goals' ? g.type === 'quest' : g.type === 'habit';
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 flex flex-col h-full overflow-y-auto w-full">
      <AnimatePresence>
        {isCreating && type === 'quest' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-md px-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="relative flex flex-col items-center text-center p-8 rounded-3xl bg-[#0d1117]/90 border border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.2)] max-w-sm w-full"
            >
              {/* Pulsing & Rotating futuristic radar core with elegant flying plane */}
              <div className="relative w-32 h-32 mb-6">
                {/* Glowing outer orbit */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/20 flex items-center justify-center"
                >
                  {/* The running plane gliding along the orbit */}
                  <div className="absolute top-0 -mt-2.5">
                    <motion.div
                      animate={{ 
                        y: [-2, 2, -2],
                        rotate: [0, 5, -5, 0]
                      }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 1.5, 
                        ease: "easeInOut" 
                      }}
                    >
                      <Plane className="w-5 h-5 text-cyan-400 transform rotate-45 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                    </motion.div>
                  </div>
                </motion.div>

                {/* Inner counter-rotating ring */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                  className="absolute inset-4 rounded-full border border-indigo-500/30 border-t-indigo-400/80 border-b-cyan-400/80"
                />

                {/* Center glowing core */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-tr from-cyan-950/80 to-indigo-950/80 flex items-center justify-center border border-cyan-500/30 shadow-[inset_0_0_15px_rgba(34,211,238,0.2)]">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.15, 1],
                      filter: ["drop-shadow(0 0 4px rgba(34,211,238,0.3))", "drop-shadow(0 0 12px rgba(34,211,238,0.6))", "drop-shadow(0 0 4px rgba(34,211,238,0.3))"]
                    }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  >
                    <Sparkles className="w-8 h-8 text-cyan-400" />
                  </motion.div>
                </div>
              </div>

              {/* Text */}
              <h3 className="text-xl font-bold text-white tracking-wide uppercase mb-2">
                Quest Planner <span className="text-cyan-400 italic font-light">Active</span>
              </h3>
              <p className="text-sm text-slate-300 mb-5 px-2 leading-relaxed">
                TaskPilot AI is designing your quest trajectory, distributing deadlines, and evaluating risk structures...
              </p>

              {/* Pulsing state badge */}
              <div className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/20 px-3.5 py-1.5 rounded-full">
                <span className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-widest">
                  Formulating Steps
                </span>
                <span className="flex gap-0.5 ml-1">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PageHeader
        icon={Target}
        badge="Quest & Habit"
        color="cyan"
        title="Track Your"
        titleAccent="Progress"
        description="Build consistent routines and chase down long-term goals with AI planning."
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger render={
            <Button className="bg-white text-emerald-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-50 transition-colors shadow-lg px-4 card-lift">
              <Plus className="mr-2 h-4 w-4" /> New Objective
            </Button>
          } />
          <DialogContent className="bg-[#0d1117] border border-[#21262d] text-[#f0f6fc]">
            <DialogHeader>
              <DialogTitle className="text-white">Create New Objective</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateGoal} className="space-y-6 mt-4">
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  type="button"
                  onClick={() => setType('habit')}
                  className={`p-4 rounded-2xl border text-left transition-all ${type === 'habit' ? 'bg-indigo-500/10 border-indigo-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-xl ${type === 'habit' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                      <Flame className="w-5 h-5" />
                    </div>
                    <h4 className={`font-semibold ${type === 'habit' ? 'text-indigo-400' : 'text-slate-300'}`}>Daily Habit</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">Track daily streaks and build consistent long-term routines.</p>
                </button>

                <button 
                  type="button"
                  onClick={() => setType('quest')}
                  className={`p-4 rounded-2xl border text-left transition-all ${type === 'quest' ? 'bg-cyan-500/10 border-cyan-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-xl ${type === 'quest' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}>
                      <Target className="w-5 h-5" />
                    </div>
                    <h4 className={`font-semibold ${type === 'quest' ? 'text-cyan-400' : 'text-slate-300'}`}>Quest</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">A major goal. AI automatically breaks it down into actionable tasks.</p>
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-400">Objective Title</Label>
                  <div className="flex gap-2">
                    <Input className="flex-1 bg-slate-900 border-slate-800 text-white rounded-xl h-11" value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'habit' ? "e.g. Meditate for 10 minutes" : "e.g. Launch new mobile app"} required />
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-slate-900 border-slate-800 text-slate-400 hover:text-white px-4 rounded-xl h-11"
                      onClick={() => {
                        if (!('webkitSpeechRecognition' in window)) {
                          showError("Speech recognition is not supported in this browser.");
                          return;
                        }
                        const recognition = new (window as any).webkitSpeechRecognition();
                        recognition.onresult = (e: any) => setTitle(e.results[0][0].transcript);
                        recognition.onerror = (err: any) => {
                          console.error('Speech recognition error:', err.error);
                          if (err.error === 'network') {
                            showError("Speech recognition network error. If you are inside the embedded preview, please open the app in a new tab for microphone access.");
                          } else {
                            showError(`Speech recognition error: ${err.error}`);
                          }
                        };
                        recognition.start();
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/><line x1="8" x2="16" y1="22" y2="22"/></svg>
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-400">Description <span className="text-slate-600 text-xs">(Optional)</span></Label>
                  <Input className="bg-slate-900 border-slate-800 text-white rounded-xl h-11" value={description} onChange={e => setDescription(e.target.value)} placeholder="Why is this important?" />
                </div>
                {type === 'habit' && (
                  <div className="space-y-2">
                    <Label className="text-slate-400">Scheduled Time <span className="text-slate-600 text-xs">(Optional)</span></Label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Clock className="h-4 w-4 text-slate-500 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <Input
                        type="time"
                        className="bg-slate-900 border-slate-800 text-slate-200 rounded-xl h-11 pl-10 pr-4 [color-scheme:dark] focus-visible:ring-indigo-500/50 hover:bg-slate-800/80 hover:border-indigo-500/30 transition-all w-full"
                        value={scheduledTime}
                        onChange={e => setScheduledTime(e.target.value)}
                      />
                    </div>
                    <p className="text-[10px] text-slate-600">Set a time for daily reminders. Leave empty for anytime habits.</p>
                  </div>
                )}
                {type === 'quest' && (
                  <div className="space-y-2">
                    <Label className="text-slate-400">Target Deadline</Label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Clock className="h-4 w-4 text-slate-500 group-hover:text-cyan-500 transition-colors" />
                      </div>
                      <Input 
                        type="datetime-local" 
                        className="bg-slate-900 border-slate-800 text-slate-200 rounded-xl h-11 pl-10 pr-4 [color-scheme:dark] focus-visible:ring-cyan-500/50 hover:bg-slate-800/80 hover:border-cyan-500/30 transition-all w-full [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        value={targetDate} 
                        onChange={e => setTargetDate(e.target.value)} 
                        required 
                      />
                    </div>
                    {isCheckingTimetable && (
                      <div className="text-[10px] text-cyan-400 animate-pulse font-mono mt-1">Comparing against daily timetable...</div>
                    )}
                    {timetableConflict && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-[11px] leading-relaxed font-medium animate-in fade-in duration-200 mt-1.5">
                        {timetableConflict}
                      </div>
                    )}
                    {!timetableConflict && targetDate && !isCheckingTimetable && (
                      <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 mt-1.5">
                        ✓ Target deadline is clear of daily routine blocks.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Button type="submit" className={`w-full text-white font-bold tracking-widest uppercase text-xs rounded-xl h-12 transition-all shadow-lg ${type === 'habit' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20' : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20'}`} disabled={isCreating}>
                {isCreating ? (type === 'quest' ? "AI is planning your quest..." : "Creating...") : (type === 'habit' ? "Save Habit" : "Schedule new quest with AI")}
              </Button>
            </form>
          </DialogContent>
          </Dialog>
        }
      />

      {reminders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Bell className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8b949e]">Smart Reminders</span>
          </div>
          <AnimatePresence>
            {reminders.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-sm ${
                  r.tone === 'urgent'
                    ? 'bg-red-500/10 border-red-500/25 text-red-200'
                    : r.tone === 'risk'
                    ? 'bg-orange-500/10 border-orange-500/25 text-orange-200'
                    : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-200'
                }`}
              >
                <span className="leading-snug">{r.text}</span>
                <button
                  onClick={() => dismissReminder(r.id)}
                  className="shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity p-1"
                  aria-label="Dismiss reminder"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <div className="flex gap-3 mb-2 border-b border-[#21262d] pb-4">
        <button
          onClick={() => setActiveTab('goals')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${activeTab === 'goals' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10' : 'bg-[#161b22] text-[#8b949e] border border-[#21262d] hover:bg-[#21262d]'}`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Quests
        </button>
        <button
          onClick={() => setActiveTab('habits')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${activeTab === 'habits' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-lg shadow-orange-500/10' : 'bg-[#161b22] text-[#8b949e] border border-[#21262d] hover:bg-[#21262d]'}`}
        >
          <Flame className="w-3.5 h-3.5" /> Daily Habits
        </button>
      </div>

      {loading ? (
        <div className="text-center text-[#8b949e] py-12">Loading...</div>
      ) : filteredGoals.length === 0 ? (
        <div className="text-center py-24 bg-[#0d1117] rounded-3xl border border-dashed border-[#21262d]">
          {activeTab === 'goals' ? (
            <>
              <Sparkles className="mx-auto h-12 w-12 text-cyan-400/50 mb-4" />
              {goals.some(g => g.type === 'quest' && g.completed) ? (
                <>
                  <h3 className="text-lg font-medium text-[#f0f6fc]">All Quests Completed!</h3>
                  <p className="text-[#8b949e] max-w-md mx-auto mt-1">You have completed all active quests. Check the <strong className="text-emerald-400">Completions</strong> page in the sidebar to celebrate your journey!</p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-[#f0f6fc]">No active quests yet</h3>
                  <p className="text-[#8b949e]">Set a quest to start tracking progress.</p>
                </>
              )}
            </>
          ) : (
            <>
              <Flame className="mx-auto h-12 w-12 text-orange-400/50 mb-4" />
              <h3 className="text-lg font-medium text-[#f0f6fc]">No active habits yet</h3>
              <p className="text-[#8b949e]">Set a habit to start tracking progress.</p>
            </>
          )}
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <AnimatePresence>
          {filteredGoals.map(goal => {
            const tasks = goal.type === 'quest' ? tasksByGoal(goal.id) : [];
            const isGeneratingTasks = goal.type === 'quest' && tasks.length === 0 && isCreating;
            const isExpanded = expandedGoals[goal.id] !== undefined
              ? expandedGoals[goal.id]
              : (goal.completed ? false : true);
            const completedTasks = tasks.filter(t => t.status === 'completed').length;

            let countdownText = '';
            let countdownColor = 'text-[#8b949e]';
            if (goal.type === 'quest' && goal.targetDate) {
              const hoursLeft = (new Date(goal.targetDate).getTime() - Date.now()) / 36e5;
              countdownText = goal.completed ? 'COMPLETE' : hoursLeft < 0 ? 'OVERDUE'
                : hoursLeft < 24 ? `${Math.floor(hoursLeft)}h left`
                : `${Math.floor(hoursLeft / 24)}d left`;
              countdownColor = goal.completed ? 'text-emerald-400' : hoursLeft < 0 ? 'text-red-400'
                : hoursLeft < 24 ? 'text-orange-400'
                : 'text-[#8b949e]';
            }

            return (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => {
                if (goal.type === 'quest') {
                  toggleGoalExpand(goal.id);
                }
              }}
              className={`bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 relative overflow-hidden group card-lift flex flex-col ${goal.completed ? 'opacity-50' : ''} ${goal.type === 'quest' ? 'cursor-pointer' : ''}`}
            >
              {goal.type === 'quest' && goal.targetDate && (
                <div className={`absolute top-0 left-0 w-full h-1 ${
                  !goal.completed && new Date(goal.targetDate).getTime() < Date.now()
                    ? 'bg-red-500'
                    : !goal.completed && (new Date(goal.targetDate).getTime() - Date.now()) / 36e5 < 48
                    ? 'bg-orange-500'
                    : 'bg-cyan-500'
                } opacity-60`}></div>
              )}
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0">
                  {goal.type === 'quest' && goal.targetDate && !goal.completed && new Date(goal.targetDate).getTime() < Date.now() && (
                    <span className="inline-block px-2 py-0.5 mb-2 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold rounded uppercase tracking-wider">
                      Deadline Passed
                    </span>
                  )}
                  <h3 className={`text-lg font-medium text-[#f0f6fc] leading-tight ${goal.completed ? 'line-through text-[#8b949e]' : ''}`}>{goal.title}</h3>
                  {goal.type === 'quest' && goal.targetDate && (
                    <p className={`text-[10px] font-mono font-bold ${countdownColor} mt-1 mb-2 uppercase tracking-wider`}>{countdownText}</p>
                  )}
                  {(goal.type !== 'quest' || isExpanded) && (
                    <p className="text-xs text-[#8b949e] line-clamp-2">{goal.description}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-[#8b949e] hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => { e.stopPropagation(); deleteGoal(goal); }}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex gap-2 mb-4 flex-wrap">
                {goal.type === 'habit' ? (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider flex items-center border ${(goal.streak || 0) >= 7 ? 'bg-red-500/15 text-red-400 border-red-500/25' : (goal.streak || 0) >= 3 ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-[#161b22] text-[#8b949e] border-[#21262d]'}`}>
                    <Flame className="w-3.5 h-3.5 mr-1" />
                    {goal.streak || 0} Day Streak
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center">
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    Quest
                  </span>
                )}
                {goal.type === 'quest' && tasks.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center">
                    <ListTree className="w-3.5 h-3.5 mr-1" />
                    {completedTasks}/{tasks.length} Done
                  </span>
                )}
              </div>

              {(goal.type !== 'quest' || isExpanded) && (
                <div className="mt-auto pt-2">
                  {goal.type === 'habit' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#161b22] border border-[#21262d] shrink-0">
                        <span className={`text-xl font-black ${(goal.streak || 0) >= 7 ? 'text-red-400' : (goal.streak || 0) >= 3 ? 'text-orange-400' : 'text-[#f0f6fc]'}`}>{goal.streak || 0}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-[#8b949e] mb-1.5">Progress to next badge</p>
                        <div className="h-1.5 bg-[#161b22] rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500" style={{ width: `${((goal.streak || 0) % 7) / 7 * 100}%` }}></div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="flex-1 bg-[#161b22] border-[#21262d] text-emerald-400 hover:text-white hover:bg-emerald-600 hover:border-emerald-600 transition-colors" onClick={() => updateProgress(goal.id, true)}>
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Log Habit
                      </Button>
                      <Button variant="outline" size="sm" className="bg-[#161b22] border-[#21262d] text-[#8b949e] hover:text-white hover:bg-red-600 hover:border-red-600 transition-colors" onClick={() => updateProgress(goal.id, false)}>
                        <X className="w-4 h-4 mr-2" /> Missed
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-2 bg-[#161b22] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500" style={{ width: `${goal.progress}%` }}></div>
                      </div>
                      <span className="text-xs font-mono text-cyan-400 shrink-0">{goal.progress}%</span>
                    </div>

                    {tasks.length > 0 ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGoalExpand(goal.id);
                          }}
                          className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[#8b949e] hover:text-[#f0f6fc] transition-colors py-1 cursor-pointer focus:outline-none"
                        >
                          <span className="flex items-center gap-1.5">
                            <ListTree className="w-3.5 h-3.5" /> Scheduled Tasks <span className="text-cyan-400 font-mono">({completedTasks}/{tasks.length})</span>
                          </span>
                          <span className="text-[9px] transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="overflow-hidden space-y-2"
                            >
                              {tasks.map(t => {
                                const hoursLeft = (new Date(t.deadline).getTime() - Date.now()) / 36e5;
                                const overdue = hoursLeft < 0 && t.status !== 'completed';
                                return (
                                  <div
                                    key={t.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (editingTaskId !== t.id) {
                                        toggleLinkedTask(t.id, t.status);
                                      }
                                    }}
                                    className="flex items-center justify-between gap-2 group/task cursor-pointer p-2 bg-[#161b22]/50 rounded-xl border border-transparent hover:border-[#21262d] hover:bg-[#161b22] transition-colors"
                                  >
                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                      {t.status === 'completed' ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                      ) : (
                                        <Circle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${overdue ? 'text-red-400' : 'text-[#8b949e] group-hover/task:text-cyan-400'}`} />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        {editingTaskId === t.id ? (
                                          <input
                                            autoFocus
                                            type="text"
                                            value={editingTaskText}
                                            onChange={(e) => setEditingTaskText(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                handleSaveTaskTitle(t.id);
                                              } else if (e.key === 'Escape') {
                                                setEditingTaskId(null);
                                              }
                                            }}
                                            onBlur={() => handleSaveTaskTitle(t.id)}
                                            className="w-full bg-[#0d1117] border border-[#21262d] rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-[#f0f6fc]"
                                          />
                                        ) : (
                                          <span className={`text-sm block truncate ${t.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                            {t.title}
                                          </span>
                                        )}
                                        <span className={`text-[10px] font-mono flex items-center gap-1 mt-0.5 ${overdue ? 'text-red-400' : 'text-slate-500'}`}>
                                          <Clock className="w-2.5 h-2.5" />
                                          {overdue ? 'Overdue' : new Date(t.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                      </div>
                                    </div>

                                    {editingTaskId !== t.id && t.status !== 'completed' && (
                                      <button
                                        onClick={(e) => handleStartEditTask(t.id, t.title, e)}
                                        className="opacity-0 group-hover/task:opacity-100 transition-opacity text-[#8b949e] hover:text-cyan-400 p-1 rounded shrink-0"
                                        title="Edit Task Title"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <p className="text-xs text-[#8b949e] italic flex items-center gap-1.5 mb-2">
                        {isGeneratingTasks && <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse shrink-0" />}
                        {isGeneratingTasks ? 'AI is planning your quest...' : 'No tasks generated yet.'}
                      </p>
                    )}

                    {questTrails[goal.id] && questTrails[goal.id].length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#21262d]/50">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[#8b949e] hover:text-[#f0f6fc] transition-colors py-1 cursor-pointer focus:outline-none"
                        >
                          <span className="flex items-center gap-1.5">
                            <Route className="w-3.5 h-3.5" /> Quest Trail <span className="text-cyan-400 font-mono">({questTrails[goal.id].length} sessions)</span>
                          </span>
                        </button>
                        <div className="mt-2 space-y-0 relative">
                          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-cyan-500/40 via-indigo-500/30 to-transparent"></div>
                          {questTrails[goal.id].map((entry: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-3 py-2 pl-0">
                              <div className="w-[15px] h-[15px] rounded-full bg-[#161b22] border-2 border-cyan-500/60 flex items-center justify-center shrink-0 mt-0.5 z-10">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-[#f0f6fc] font-medium leading-snug">{entry.sessionLabel}</p>
                                <p className="text-[9px] text-[#8b949e] font-mono mt-0.5">
                                  {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} &middot; {entry.startTime && entry.endTime ? `${new Date(entry.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} — ${new Date(entry.endTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-[#21262d]/50">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add manual task to quest..."
                          value={newManualTaskTitles[goal.id] || ''}
                          onChange={(e) => setNewManualTaskTitles(prev => ({ ...prev, [goal.id]: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={async (e: any) => {
                            if (e.key === 'Enter' && e.target.value.trim() !== '') {
                              await handleAddManualTaskToQuest(goal.id, goal.targetDate);
                            }
                          }}
                          className="bg-[#161b22] border border-[#21262d] rounded-xl text-xs h-8 px-3 text-[#f0f6fc] placeholder:text-slate-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none flex-1 min-w-0"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddManualTaskToQuest(goal.id, goal.targetDate);
                          }}
                          className="h-8 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 text-[11px] font-bold px-3 rounded-xl shrink-0"
                        >
                          Add Task
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
            </motion.div>
            );
          })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}