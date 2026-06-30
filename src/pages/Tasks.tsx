import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { Task, Subtask, TaskStatus, Goal } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Plus, Clock, Rocket, CheckCircle2, Circle, CalendarIcon, Trash2, Sparkles, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New Task Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('none');

  // Subtask Edit & AI Generation State
  const [editingSubtask, setEditingSubtask] = useState<{ taskId: string; subtaskId: string } | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [isGeneratingSubtasks, setIsGeneratingSubtasks] = useState<Record<string, boolean>>({});
  const [newSubtaskTexts, setNewSubtaskTexts] = useState<Record<string, string>>({});

  // Task Edit State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');

  const toggleExpand = (taskId: string) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const fetchTasksAndGoals = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch both simultaneously for optimal performance
      const [resTasks, resGoals] = await Promise.all([
        fetch('/api/tasks', { headers }),
        fetch('/api/goals', { headers })
      ]);

      let goalsData: Goal[] = [];
      if (resGoals.ok) {
        goalsData = await resGoals.json() as Goal[];
        setGoals(goalsData);
      }

      if (resTasks.ok) {
        const tasksData = await resTasks.json() as Task[];
        
        // Sort tasks globally based on parent quest's creation date (oldest quest first)
        const sorted = tasksData.sort((a, b) => {
          const questA = a.goalId ? goalsData.find(g => g.id === a.goalId && g.type === 'quest') : null;
          const questB = b.goalId ? goalsData.find(g => g.id === b.goalId && g.type === 'quest') : null;

          // If task belongs to a quest, get quest's creation date. Otherwise, push to the end (Infinity)
          const timeA = questA?.createdAt ? new Date(questA.createdAt).getTime() : Infinity;
          const timeB = questB?.createdAt ? new Date(questB.createdAt).getTime() : Infinity;

          if (timeA !== timeB) {
            return timeA - timeB; // ascending: oldest quest first
          }

          // Fallback to task's own deadline or creation date
          const deadlineA = a.deadline ? new Date(a.deadline).getTime() : 0;
          const deadlineB = b.deadline ? new Date(b.deadline).getTime() : 0;
          if (deadlineA !== deadlineB) {
            return deadlineA - deadlineB;
          }

          const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return createdAtA - createdAtB;
        });

        setTasks(sorted);
      }
    } catch (err) {
      console.error("Failed to load tasks and goals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTasksAndGoals();
    }
  }, [user]);

  const triggerAutonomousPipeline = async (eventName: string, eventDetail: string, currentTasks: Task[]) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const selectedModel = localStorage.getItem('selected_gemini_model') || 'models/gemini-3.5-flash';
      await fetch('/api/autonomous-pipeline', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          eventName,
          eventDetail,
          tasks: currentTasks,
          model: selectedModel
        })
      });
      fetchTasksAndGoals();
    } catch (error) {
      console.error("Pipeline failed", error);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !user || !date || !time) {
      toast.error("Please fill in all required fields.");
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const deadlineString = new Date(`${format(date, 'yyyy-MM-dd')}T${time}`).toISOString();
      const token = await user.getIdToken();
      const selectedModel = localStorage.getItem('selected_gemini_model') || 'models/gemini-3.5-flash';
      const res = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ title, description, deadline: deadlineString, model: selectedModel })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "The AI is currently busy or out of quota. Please switch the AI Brain model in Mission Control.");
      }
      
      const analysis = await res.json();
      
      const subtasks: Subtask[] = (analysis.subtasks || []).map((t: string) => ({
        id: crypto.randomUUID(),
        title: t,
        completed: false
      }));

      const newTask = {
        title,
        description,
        deadline: deadlineString,
        priority: analysis.priority || 'medium',
        status: 'pending',
        category: 'general',
        estimatedHours: analysis.estimatedHours || 1,
        riskScore: analysis.riskScore || 0,
        subtasks,
        goalId: selectedGoalId !== 'none' ? selectedGoalId : null,
        createdAt: new Date().toISOString()
      };

      const resPost = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTask)
      });

      if (!resPost.ok) throw new Error("Failed to save task");
      
      toast.success("Task analyzed and created successfully!");
      setIsDialogOpen(false);
      setTitle('');
      setDescription('');
      setDate(undefined);
      setTime('');
      setSelectedGoalId('none');

      const savedTask = await resPost.json();
      triggerAutonomousPipeline("Task Created", `Created task: ${title}`, [...tasks, savedTask]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create task");
    } finally {
      setIsAnalyzing(false);
    }
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

  const deleteTask = async (task: Task) => {
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();

      toast.success("Task deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(task)
              });
              toast.success("Task restored");
              fetchTasksAndGoals();
            } catch (error) {
              toast.error("Failed to restore task");
            }
          }
        },
        duration: 5000,
      });
      fetchTasksAndGoals();
    } catch (error) {
      toast.error("Failed to delete task");
    }
  };

  const handleGenerateSubtasks = async (task: Task) => {
    if (!user) return;
    setIsGeneratingSubtasks(prev => ({ ...prev, [task.id]: true }));
    try {
      const token = await user.getIdToken();
      const selectedModel = localStorage.getItem('selected_gemini_model') || 'models/gemini-3.5-flash';
      const res = await fetch('/api/generate-subtasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          model: selectedModel
        })
      });

      if (!res.ok) {
        throw new Error("Failed to generate subtasks");
      }

      const data = await res.json();
      if (data.subtasks && Array.isArray(data.subtasks)) {
        const newSubtasks = data.subtasks.map((title: string) => ({
          id: crypto.randomUUID(),
          title,
          completed: false
        }));

        await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            subtasks: newSubtasks,
            status: 'pending'
          })
        });

        if (data.isFallback) {
          toast.success(`Generated ${newSubtasks.length} structured subtasks for you!`);
        } else {
          toast.success(`Generated ${newSubtasks.length} subtasks with AI!`);
        }
        setExpandedTasks(prev => ({ ...prev, [task.id]: true }));
        fetchTasksAndGoals();
      } else {
        toast.error("Could not generate subtasks. Please try again.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate subtasks. Quota limit may have been reached.");
    } finally {
      setIsGeneratingSubtasks(prev => ({ ...prev, [task.id]: false }));
    }
  };

  const handleAddManualSubtask = async (taskId: string, subtaskTitle: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newSubtask = {
      id: crypto.randomUUID(),
      title: subtaskTitle,
      completed: false
    };
    const updatedSubtasks = [...(task.subtasks || []), newSubtask];
    try {
      const token = await user?.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subtasks: updatedSubtasks,
          status: 'in_progress'
        })
      });
      toast.success("Subtask added!");
      fetchTasksAndGoals();
    } catch (error) {
      toast.error("Failed to add subtask");
    }
  };

  const handleStartEditSubtask = (taskId: string, subtaskId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubtask({ taskId, subtaskId });
    setEditingSubtaskText(currentTitle);
  };

  const handleSaveSubtaskTitle = async (taskId: string, subtaskId: string) => {
    if (!editingSubtaskText.trim()) {
      setEditingSubtask(null);
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).map(s =>
      s.id === subtaskId ? { ...s, title: editingSubtaskText.trim() } : s
    );

    try {
      const token = await user?.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subtasks: updatedSubtasks })
      });
      toast.success("Subtask updated!");
      fetchTasksAndGoals();
    } catch (error) {
      toast.error("Failed to update subtask");
    } finally {
      setEditingSubtask(null);
    }
  };

  const handleDeleteSubtask = async (taskId: string, subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).filter(s => s.id !== subtaskId);

    try {
      const token = await user?.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subtasks: updatedSubtasks })
      });
      toast.success("Subtask deleted!");
      fetchTasksAndGoals();
    } catch (error) {
      toast.error("Failed to delete subtask");
    }
  };

  const handleStartEditTask = (taskId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTaskId(taskId);
    setEditingTaskText(currentTitle);
  };

  const handleSaveTaskTitle = async (taskId: string) => {
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
        body: JSON.stringify({ title: editingTaskText.trim() })
      });
      toast.success("Task updated!");
      fetchTasksAndGoals();
    } catch (error) {
      toast.error("Failed to update task");
    } finally {
      setEditingTaskId(null);
    }
  };

  const toggleSubtask = async (taskId: string, subtaskId: string, tasksList: Task[]) => {
    const task = tasksList.find(t => t.id === taskId);
    if (!task) return;
    
    const updatedSubtasks = task.subtasks.map(s => 
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    
    const isAllCompleted = updatedSubtasks.every(s => s.completed);
    
    try {
      const token = await user?.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subtasks: updatedSubtasks,
          status: isAllCompleted ? 'completed' : 'in_progress'
        })
      });

      if (isAllCompleted) {
        toast.success("Task completed!");
        triggerAutonomousPipeline("Task Completed", `Completed task: ${task.title}`, tasksList.filter(t => t.id !== taskId));
      } else {
        const subtaskTitle = task.subtasks.find(s => s.id === subtaskId)?.title;
        triggerAutonomousPipeline("Subtask Updated", `Updated subtask in ${task.title}: ${subtaskTitle}`, tasksList);
      }

      const goalId = task.goalId;
      if (goalId) {
        const matchingGoal = goals.find(g => g.id === goalId);
        if (matchingGoal && matchingGoal.type === 'habit' && isAllCompleted) {
          const currentStreak = matchingGoal.streak || 0;
          await fetch(`/api/goals/${goalId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              streak: currentStreak + 1,
              progress: (matchingGoal.progress || 0) + 1
            })
          });
          toast.success(`🔥 Linked Habit "${matchingGoal.title}" streak is now ${currentStreak + 1}!`);
        }
      }
      fetchTasksAndGoals();
    } catch (error) {
       toast.error("Failed to update subtask");
    }
  };

  const toggleTaskComplete = async (task: Task) => {
    const isNowCompleted = task.status !== 'completed';
    const updatedSubtasks = (task.subtasks || []).map(s => ({ ...s, completed: isNowCompleted }));
    
    try {
      const token = await user?.getIdToken();
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: isNowCompleted ? 'completed' : 'pending',
          subtasks: updatedSubtasks
        })
      });

      if (isNowCompleted) {
        toast.success("Task completed!");
        triggerAutonomousPipeline("Task Completed", `Completed task: ${task.title}`, tasks.filter(t => t.id !== task.id));
      } else {
        toast.success("Task marked active");
        triggerAutonomousPipeline("Task Reactivated", `Reactivated task: ${task.title}`, [...tasks, { ...task, status: 'pending' }]);
      }

      const goalId = task.goalId;
      if (goalId) {
        const matchingGoal = goals.find(g => g.id === goalId);
        if (matchingGoal && matchingGoal.type === 'habit' && isNowCompleted) {
          const currentStreak = matchingGoal.streak || 0;
          await fetch(`/api/goals/${goalId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              streak: currentStreak + 1,
              progress: (matchingGoal.progress || 0) + 1
            })
          });
          toast.success(`🔥 Linked Habit "${matchingGoal.title}" streak is now ${currentStreak + 1}!`);
        }
      }
      fetchTasksAndGoals();
    } catch (error) {
      toast.error("Failed to update task status");
    }
  };

  const rescueDeadline = async (taskId: string, currentDeadline: string) => {
    try {
      const token = await user?.getIdToken();
      const newDeadline = new Date(currentDeadline);
      newDeadline.setDate(newDeadline.getDate() + 1); // push by 1 day
      
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deadline: newDeadline.toISOString() })
      });
      toast.success("Deadline automatically rescued (+1 Day)!");
      fetchTasksAndGoals();
    } catch (error) {
      toast.error("Failed to rescue deadline");
    }
  };

  const [filter, setFilter] = useState<'all' | 'high_risk' | 'due_today' | 'completed'>('all');

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return task.status !== 'completed';
    if (filter === 'completed') return task.status === 'completed';
    if (filter === 'high_risk') return (task.riskScore || 0) > 60 && task.status !== 'completed';
    if (filter === 'due_today') {
      const today = new Date().toISOString().split('T')[0];
      return task.deadline.startsWith(today) && task.status !== 'completed';
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 flex flex-col h-full overflow-y-auto w-full">
      <header className="flex flex-col gap-4 mb-2 px-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light text-[#f0f6fc] leading-tight">Your <br/><span className="font-semibold italic text-indigo-400">Commitments</span></h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger className="bg-white text-indigo-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-50 transition-colors shadow-lg px-4 py-2 inline-flex items-center justify-center card-lift">
              <Plus className="mr-2 h-4 w-4" /> New Task
            </DialogTrigger>
            <DialogContent className="bg-[#0d1117] border border-[#21262d] text-[#f0f6fc]">
            <DialogHeader>
              <DialogTitle className="text-white">Create Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-slate-400">What do you need to do?</Label>
                <div className="flex gap-2">
                  <Input className="flex-1 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Complete Spring Boot Backend" required />
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white"
                    onClick={() => {
                      if (!('webkitSpeechRecognition' in window)) {
                        toast.error("Speech recognition is not supported in this browser.");
                        return;
                      }
                      const recognition = new (window as any).webkitSpeechRecognition();
                      recognition.onresult = (e: any) => setTitle(e.results[0][0].transcript);
                      recognition.start();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/><line x1="8" x2="16" y1="22" y2="22"/></svg>
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Description (Optional)</Label>
                <Textarea className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600" value={description} onChange={e => setDescription(e.target.value)} placeholder="Any specific requirements..." />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Connect to Goal or Habit (Optional)</Label>
                <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white w-full">
                    <SelectValue placeholder="No connection">
                      {(value: string) => {
                        if (!value || value === 'none') return 'No connection';
                        const g = goals.find(g => g.id === value);
                        return g ? `${g.type === 'habit' ? '🔁 Habit' : '🎯 Quest'}: ${g.title}` : 'No connection';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border border-[#21262d] text-[#f0f6fc] max-h-[200px]">
                    <SelectItem value="none" className="focus:bg-slate-800 focus:text-white cursor-pointer">No connection</SelectItem>
                    {goals.map(g => (
                      <SelectItem key={g.id} value={g.id} className="focus:bg-slate-800 focus:text-white cursor-pointer">
                        {`${g.type === 'habit' ? '🔁 Habit' : '🎯 Quest'}: ${g.title}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex flex-col">
                <Label className="text-slate-400">Deadline</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Popover>
                    <PopoverTrigger className={`inline-flex items-center justify-start whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border h-10 px-4 py-2 w-full font-normal bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:text-white ${!date ? 'text-slate-500' : 'text-white'}`}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : <span>Pick a date</span>}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-800 text-white" align="start">
                      <Calendar mode="single" selected={date} onSelect={setDate} />
                    </PopoverContent>
                  </Popover>
                  <Select value={time} onValueChange={setTime}>
                    <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[200px]">
                      {Array.from({ length: 24 * 2 }).map((_, i) => {
                        const hours = Math.floor(i / 2);
                        const mins = i % 2 === 0 ? '00' : '30';
                        const timeStr = `${hours.toString().padStart(2, '0')}:${mins}`;
                        return (
                          <SelectItem key={timeStr} value={timeStr} className="focus:bg-slate-800 focus:text-white cursor-pointer">
                            {timeStr}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white border-0 font-bold tracking-widest uppercase text-xs rounded-xl" disabled={isAnalyzing}>
                {isAnalyzing ? "AI Analyzing & Planning..." : "Create & Analyze"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 px-2">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${filter === 'all' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-[#161b22] text-[#8b949e] border-[#21262d] hover:bg-[#21262d]'}`}>Active</button>
        <button onClick={() => setFilter('high_risk')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${filter === 'high_risk' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-[#161b22] text-[#8b949e] border-[#21262d] hover:bg-[#21262d]'}`}>High Risk</button>
        <button onClick={() => setFilter('due_today')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${filter === 'due_today' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-[#161b22] text-[#8b949e] border-[#21262d] hover:bg-[#21262d]'}`}>Due Today</button>
        <button onClick={() => setFilter('completed')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${filter === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-[#161b22] text-[#8b949e] border-[#21262d] hover:bg-[#21262d]'}`}>Completed</button>
      </div>

      {loading ? (
        <div className="text-center text-[#8b949e] py-12">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-24 bg-[#0d1117] rounded-3xl border border-dashed border-[#21262d]">
          <Rocket className="mx-auto h-12 w-12 text-indigo-400/50 mb-4" />
          <h3 className="text-lg font-medium text-[#f0f6fc]">Your runway is clear</h3>
          <p className="text-[#8b949e]">Add a task and let AI build your execution plan.</p>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-12 gap-4 items-start">
          <AnimatePresence>
            {filteredTasks.map(task => {
            const hoursLeft = (new Date(task.deadline).getTime() - Date.now()) / 36e5;
            const countdownText = hoursLeft < 0 ? 'OVERDUE' 
              : hoursLeft < 24 ? `${Math.floor(hoursLeft)}h left`
              : `${Math.floor(hoursLeft / 24)}d left`;
            const countdownColor = hoursLeft < 0 ? 'text-red-400' 
              : hoursLeft < 24 ? 'text-orange-400' 
              : 'text-[#8b949e]';
            
            const done = task.subtasks?.filter(s => s.completed).length || 0;
            const total = task.subtasks?.length || 0;
            const progress = total > 0 ? (done / total) * 100 : 0;

            return (
              <motion.div 
                key={task.id} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`col-span-12 md:col-span-6 lg:col-span-4 bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 flex flex-col group card-lift ${task.status === 'completed' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button 
                      onClick={() => toggleTaskComplete(task)}
                      className="mt-1 focus:outline-none shrink-0"
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 hover:text-emerald-400 transition-colors" />
                      ) : (
                        <Circle className="w-5 h-5 text-[#8b949e] hover:text-indigo-400 transition-colors" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0 group/task-title">
                      {editingTaskId === task.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingTaskText}
                          onChange={(e) => setEditingTaskText(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveTaskTitle(task.id);
                            } else if (e.key === 'Escape') {
                              setEditingTaskId(null);
                            }
                          }}
                          onBlur={() => handleSaveTaskTitle(task.id)}
                          className="w-full bg-[#161b22] border border-[#21262d] rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-[#f0f6fc] mb-1"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className={`text-lg font-medium text-[#f0f6fc] leading-tight ${task.status === 'completed' ? 'line-through text-[#8b949e]' : ''}`}>{task.title}</h3>
                          {task.status !== 'completed' && (
                            <button
                              onClick={(e) => handleStartEditTask(task.id, task.title, e)}
                              className="opacity-0 group-hover/task-title:opacity-100 transition-opacity text-[#8b949e] hover:text-indigo-400 p-1 rounded shrink-0"
                              title="Edit Task Title"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      <p className={`text-[10px] font-mono font-bold ${countdownColor} mb-2 uppercase tracking-wider`}>{countdownText}</p>
                      <p className="text-xs text-[#8b949e] line-clamp-2">{task.description}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-[#8b949e] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteTask(task)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex gap-2 mb-6 flex-wrap">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${task.priority === 'high' ? 'bg-red-500/15 text-red-400 border border-red-500/25' : task.priority === 'medium' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'}`}>
                    {task.priority}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {task.estimatedHours}h
                  </span>
                  {task.riskScore !== undefined && (
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider flex items-center border ${task.riskScore > 70 ? 'bg-red-500/15 text-red-400 border-red-500/25' : task.riskScore > 30 ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'}`}>
                      Risk: {task.riskScore}%
                    </span>
                  )}
                  {(() => {
                    const matchingGoal = goals.find(g => g.id === (task as any).goalId);
                    return matchingGoal ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                        🎯 {matchingGoal.type === 'habit' ? 'Habit: ' : 'Quest: '}{matchingGoal.title}
                      </span>
                    ) : null;
                  })()}
                  {hoursLeft < 0 && task.status !== 'completed' && (
                    <button 
                      onClick={() => rescueDeadline(task.id, task.deadline)}
                      className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/25 hover:bg-purple-500/30 transition-colors"
                    >
                      Rescue Deadline
                    </button>
                  )}
                </div>
                
                <div className="space-y-3 mt-auto">
                  <button 
                    onClick={() => toggleExpand(task.id)}
                    className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[#8b949e] hover:text-[#f0f6fc] transition-colors py-1 cursor-pointer focus:outline-none"
                  >
                    <span className="flex items-center gap-1">
                      Subtasks <span className="text-indigo-400 font-mono">({done}/{total})</span>
                    </span>
                    <span className="text-[9px] transition-transform duration-200" style={{ transform: expandedTasks[task.id] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      ▼
                    </span>
                  </button>
                  <div className="h-1 bg-[#161b22] rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                  </div>
                  
                  <AnimatePresence initial={false}>
                    {expandedTasks[task.id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden space-y-2 pt-1"
                      >
                        {task.subtasks?.map(sub => {
                          const isEditing = editingSubtask?.taskId === task.id && editingSubtask?.subtaskId === sub.id;
                          return (
                            <div 
                              key={sub.id} 
                              className="flex items-start justify-between gap-3 group/sub p-2 bg-[#161b22]/50 rounded-xl border border-transparent hover:border-[#21262d] hover:bg-[#161b22] transition-colors cursor-pointer"
                              onClick={() => {
                                if (!isEditing) {
                                  toggleSubtask(task.id, sub.id, tasks);
                                }
                              }}
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {sub.completed ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <Circle className="w-4 h-4 text-[#8b949e] group-hover/sub:text-indigo-400 flex-shrink-0 mt-0.5" />
                                )}
                                
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    type="text"
                                    value={editingSubtaskText}
                                    onChange={(e) => setEditingSubtaskText(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveSubtaskTitle(task.id, sub.id);
                                      } else if (e.key === 'Escape') {
                                        setEditingSubtask(null);
                                      }
                                    }}
                                    onBlur={() => handleSaveSubtaskTitle(task.id, sub.id)}
                                    className="flex-1 bg-[#0d1117] border border-slate-700 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-200"
                                  />
                                ) : (
                                  <span className={`text-xs font-medium leading-relaxed break-words line-clamp-2 ${sub.completed ? 'text-[#8b949e] line-through' : 'text-[#f0f6fc]'}`}>
                                    {sub.title}
                                  </span>
                                )}
                              </div>

                              {!isEditing && (
                                <div className="flex items-center gap-1.5 shrink-0 mt-0.5 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => handleStartEditSubtask(task.id, sub.id, sub.title, e)}
                                    className="text-[#8b949e] hover:text-indigo-400 p-1 rounded transition-colors cursor-pointer"
                                    title="Edit Subtask"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteSubtask(task.id, sub.id, e)}
                                    className="text-[#8b949e] hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                                    title="Delete Subtask"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {(!task.subtasks || task.subtasks.length === 0) && (
                           <p className="text-xs text-[#8b949e] italic p-1">No subtasks generated yet.</p>
                        )}

                        <div className="mt-4 pt-4 border-t border-[#21262d]/50 space-y-4">
                          {/* AI Generator Block */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider block">
                              AI Automation
                            </label>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isGeneratingSubtasks[task.id]}
                              onClick={() => handleGenerateSubtasks(task)}
                              className="w-full h-10 bg-[#1e1b4b]/20 hover:bg-[#1e1b4b]/40 border-indigo-500/25 hover:border-indigo-500/40 text-indigo-300 hover:text-indigo-200 text-xs font-bold flex items-center justify-center gap-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Sparkles className={`w-3.5 h-3.5 text-cyan-400 ${isGeneratingSubtasks[task.id] ? 'animate-spin' : ''}`} />
                              <span>
                                {isGeneratingSubtasks[task.id] ? "Planning Subtasks with AI..." : "Generate Subtasks with AI"}
                              </span>
                            </Button>
                          </div>

                          {/* Manual Subtask Entry Block */}
                          <div className="space-y-1.5 pb-2">
                            <label className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider block">
                              Manual Creation
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                placeholder="Add a subtask manually..."
                                value={newSubtaskTexts[task.id] || ''}
                                onChange={(e) => setNewSubtaskTexts(prev => ({ ...prev, [task.id]: e.target.value }))}
                                onKeyDown={async (e: any) => {
                                  if (e.key === 'Enter') {
                                    const val = (newSubtaskTexts[task.id] || '').trim();
                                    if (val) {
                                      await handleAddManualSubtask(task.id, val);
                                      setNewSubtaskTexts(prev => ({ ...prev, [task.id]: '' }));
                                    }
                                  }
                                }}
                                className="flex-1 min-w-0 bg-[#161b22] border border-[#21262d] rounded-xl text-xs h-10 px-3 text-[#f0f6fc] placeholder:text-slate-600 outline-none transition-colors focus:bg-[#1f242c] focus:border-indigo-500/60 focus:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.6),0_0_0_3px_rgba(99,102,241,0.15)]"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={async () => {
                                  const val = (newSubtaskTexts[task.id] || '').trim();
                                  if (val) {
                                    await handleAddManualSubtask(task.id, val);
                                    setNewSubtaskTexts(prev => ({ ...prev, [task.id]: '' }));
                                  }
                                }}
                                className="h-10 bg-indigo-500/10 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white text-xs font-bold px-4 rounded-xl shrink-0 cursor-pointer flex items-center justify-center gap-1.5 transition-colors hover:shadow-[0_0_16px_rgba(99,102,241,0.35)]"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}