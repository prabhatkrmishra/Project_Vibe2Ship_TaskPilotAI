import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, limit, setDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Task, Subtask, TaskStatus } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Plus, Clock, Rocket, CheckCircle2, Circle, CalendarIcon } from 'lucide-react';
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

  const toggleExpand = (taskId: string) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  useEffect(() => {
    if (!user) return;
    const db = getDb();
    const q = query(collection(db, 'tasks'), where('userId', '==', user.uid), limit(20));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(tasksData.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const triggerAutonomousPipeline = async (eventName: string, eventDetail: string, currentTasks: Task[]) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const selectedModel = localStorage.getItem('selected_gemini_model') || 'models/gemini-2.0-flash';
      const res = await fetch('/api/autonomous-pipeline', {
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
      if (res.ok) {
        const result = await res.json();
        const db = getDb();
        if (result.decision) {
          await addDoc(collection(db, 'users', user.uid, 'ai_decisions'), {
            ...result.decision,
            timestamp: new Date().toISOString()
          });
        }
        const todayDateStr = new Date().toISOString().split('T')[0];
        if (result.plan && result.plan.sessions) {
          await setDoc(doc(db, 'users', user.uid, 'daily_plan', todayDateStr), {
            ...result.plan,
            updatedAt: new Date().toISOString()
          });
        } else if (currentTasks.length === 0) {
          await setDoc(doc(db, 'users', user.uid, 'daily_plan', todayDateStr), {
            sessions: [],
            updatedAt: new Date().toISOString()
          });
        }
      }
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
      // Combine date and time
      const deadlineString = new Date(`${format(date, 'yyyy-MM-dd')}T${time}`).toISOString();

      // 1. Ask Gemini to analyze the task
      const token = await user.getIdToken();
      const selectedModel = localStorage.getItem('selected_gemini_model') || 'models/gemini-2.0-flash';
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
        userId: user.uid,
        title,
        description,
        deadline: deadlineString,
        priority: analysis.priority || 'medium',
        status: 'pending',
        category: 'general',
        estimatedHours: analysis.estimatedHours || 1,
        riskScore: analysis.riskScore || 0,
        subtasks,
        createdAt: serverTimestamp()
      };

      // 2. Save to Firestore
      const db = getDb();
      await addDoc(collection(db, 'tasks'), newTask);
      
      toast.success("Task analyzed and created successfully!");
      setIsDialogOpen(false);
      setTitle('');
      setDescription('');
      setDate(undefined);
      setTime('');

      // 3. Trigger AI Pipeline
      triggerAutonomousPipeline("Task Created", `Created task: ${title}`, [...tasks, { ...newTask, id: 'temp' } as any]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create task");
    } finally {
      setIsAnalyzing(false);
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
      const db = getDb();
      await updateDoc(doc(db, 'tasks', taskId), {
        subtasks: updatedSubtasks,
        status: isAllCompleted ? 'completed' : 'in_progress'
      });

      if (isAllCompleted) {
        toast.success("Task completed!");
        triggerAutonomousPipeline("Task Completed", `Completed task: ${task.title}`, tasksList.filter(t => t.id !== taskId));
      } else {
        const subtaskTitle = task.subtasks.find(s => s.id === subtaskId)?.title;
        triggerAutonomousPipeline("Subtask Updated", `Updated subtask in ${task.title}: ${subtaskTitle}`, tasksList);
      }
    } catch (error) {
       toast.error("Failed to update subtask");
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
                <Input className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Complete Spring Boot Backend" required />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Description (Optional)</Label>
                <Textarea className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600" value={description} onChange={e => setDescription(e.target.value)} placeholder="Any specific requirements..." />
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
        <div className="grid grid-cols-12 gap-4">
          {filteredTasks.map(task => {
            const hoursLeft = (new Date(task.deadline).getTime() - Date.now()) / 36e5;
            const countdownText = hoursLeft < 0 ? 'OVERDUE' 
              : hoursLeft < 24 ? `${Math.floor(hoursLeft)}h left`
              : `${Math.floor(hoursLeft / 24)}d left`;
            const countdownColor = hoursLeft < 0 ? 'text-red-400' 
              : hoursLeft < 24 ? 'text-orange-400' 
              : 'text-[#8b949e]';
            
            const done = task.subtasks?.filter(s => s.completed).length || 0;
            const total = task.subtasks?.length || 1;
            const progress = (done / total) * 100;

            return (
              <div key={task.id} className={`col-span-12 md:col-span-6 lg:col-span-4 bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 flex flex-col group card-lift ${task.status === 'completed' ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-[#f0f6fc] mb-1 leading-tight">{task.title}</h3>
                    <p className={`text-[10px] font-mono font-bold ${countdownColor} mb-2 uppercase tracking-wider`}>{countdownText}</p>
                    <p className="text-xs text-[#8b949e] line-clamp-2">{task.description}</p>
                  </div>
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
                        {task.subtasks?.map(sub => (
                          <div 
                            key={sub.id} 
                            className="flex items-center gap-3 group/sub cursor-pointer p-2 bg-[#161b22]/50 rounded-xl border border-transparent hover:border-[#21262d] hover:bg-[#161b22] transition-colors"
                            onClick={() => toggleSubtask(task.id, sub.id, tasks)}
                          >
                            {sub.completed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-[#8b949e] group-hover/sub:text-indigo-400 flex-shrink-0" />
                            )}
                            <span className={`text-xs font-medium ${sub.completed ? 'text-[#8b949e] line-through' : 'text-[#f0f6fc]'}`}>
                              {sub.title}
                            </span>
                          </div>
                        ))}
                        {(!task.subtasks || task.subtasks.length === 0) && (
                           <p className="text-xs text-[#8b949e] italic p-1">No subtasks generated.</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
