import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Goal } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Target, Flame, CheckCircle2, Circle, Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

function GoalStepItem({ step, goal, toggleStep, updateStepTitle }: { step: any, goal: Goal, toggleStep: any, updateStepTitle: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(step.title);

  const handleSave = () => {
    if (editTitle.trim() !== '' && editTitle !== step.title) {
      updateStepTitle(goal, step.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-2 group/step">
      <button 
        onClick={() => toggleStep(goal, step.id)}
        className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors ${step.completed ? 'text-emerald-400 hover:text-emerald-300' : 'text-red-400/80 hover:text-red-400'}`}
      >
        {step.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
      </button>
      
      {isEditing ? (
        <input 
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          className="flex-1 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-sm focus:ring-1 focus:ring-cyan-500 focus:outline-none text-slate-200"
        />
      ) : (
        <span className={`flex-1 text-sm ${step.completed ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
          {step.title}
        </span>
      )}

      {!isEditing && (
        <button 
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover/step:opacity-100 transition-opacity text-slate-500 hover:text-cyan-400 p-1 rounded"
        >
          <Edit2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'habit' | 'milestone'>('habit');
  const [targetDate, setTargetDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'goals' | 'habits'>('goals');

  useEffect(() => {
    if (!user) return;
    const db = getDb();
    const q = query(collection(db, 'goals'), where('userId', '==', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const goalsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Goal[];
      setGoals(goalsData.sort((a, b) => b.progress - a.progress));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !user) return;
    
    setIsCreating(true);
    try {
      const db = getDb();
      let steps: any[] = [];
      
      if (type === 'milestone') {
        const token = await user.getIdToken();
        const res = await fetch('/api/generate-milestone-steps', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title,
            description,
            targetDate,
            model: 'gemini-2.5-flash'
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.steps && Array.isArray(data.steps)) {
            steps = data.steps.map((stepTitle: string) => ({
              id: crypto.randomUUID(),
              title: stepTitle,
              completed: false
            }));
          }
        } else {
          toast.error("Failed to generate steps with AI. Creating empty milestone.");
        }
      }

      await addDoc(collection(db, 'goals'), {
        userId: user.uid,
        title,
        description,
        type,
        targetDate: type === 'milestone' ? targetDate : null,
        progress: 0,
        streak: type === 'habit' ? 0 : null,
        steps: type === 'milestone' ? steps : null,
        completed: false,
        createdAt: serverTimestamp()
      });
      
      toast.success("Goal created successfully!");
      setIsDialogOpen(false);
      setTitle('');
      setDescription('');
      setTargetDate('');
      setType('habit');
    } catch (error) {
      console.error(error);
      toast.error("Failed to create goal");
    } finally {
      setIsCreating(false);
    }
  };

  const updateProgress = async (goalId: string, increment: boolean) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    try {
      const db = getDb();
      let newProgress = goal.progress;
      let newStreak = goal.streak || 0;
      let completed = goal.completed;
      
      if (goal.type === 'habit') {
        if (increment) {
          newProgress += 1;
          newStreak += 1;
        } else {
          newStreak = 0;
        }
      } else {
        if (increment) {
          newProgress = Math.min(newProgress + 10, 100);
          if (newProgress === 100) completed = true;
        } else {
          newProgress = Math.max(newProgress - 10, 0);
          completed = false;
        }
      }

      await updateDoc(doc(db, 'goals', goalId), {
        progress: newProgress,
        streak: newStreak,
        completed
      });
      
      toast.success("Progress updated!");
    } catch (error) {
      toast.error("Failed to update progress");
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!window.confirm("Are you sure you want to delete this goal?")) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, 'goals', goalId));
      toast.success("Goal deleted");
    } catch (error) {
      toast.error("Failed to delete goal");
    }
  };

  const toggleStep = async (goal: Goal, stepId: string) => {
    if (!goal.steps) return;
    const newSteps = goal.steps.map(step => 
      step.id === stepId ? { ...step, completed: !step.completed } : step
    );
    
    const completedCount = newSteps.filter(s => s.completed).length;
    const totalCount = newSteps.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    try {
      const db = getDb();
      await updateDoc(doc(db, 'goals', goal.id), {
        steps: newSteps,
        progress,
        completed: progress === 100
      });
    } catch (error) {
      toast.error("Failed to update step");
    }
  };

  const updateStepTitle = async (goal: Goal, stepId: string, newTitle: string) => {
    if (!goal.steps) return;
    const newSteps = goal.steps.map(step => 
      step.id === stepId ? { ...step, title: newTitle } : step
    );
    try {
      const db = getDb();
      await updateDoc(doc(db, 'goals', goal.id), { steps: newSteps });
    } catch (error) {
      toast.error("Failed to edit step");
    }
  };

  const addStep = async (goal: Goal, title: string) => {
    if (!title.trim()) return;
    const newSteps = [...(goal.steps || []), { id: crypto.randomUUID(), title, completed: false }];
    
    const completedCount = newSteps.filter(s => s.completed).length;
    const totalCount = newSteps.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    try {
      const db = getDb();
      await updateDoc(doc(db, 'goals', goal.id), { 
        steps: newSteps,
        progress,
        completed: progress === 100
      });
    } catch (error) {
      toast.error("Failed to add step");
    }
  };

  const filteredGoals = goals.filter(g => activeTab === 'goals' ? g.type === 'milestone' : g.type === 'habit');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 flex flex-col h-full overflow-y-auto w-full">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-light text-[#f0f6fc] leading-tight">Objectives</h1>
        </div>
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
            <form onSubmit={handleCreateGoal} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-slate-400">Objective Title</Label>
                <div className="flex gap-2">
                  <Input className="flex-1 bg-slate-800/50 border-slate-700 text-white" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Meditate daily" required />
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white px-3"
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
                <Label className="text-slate-400">Description</Label>
                <Input className="bg-slate-800/50 border-slate-700 text-white" value={description} onChange={e => setDescription(e.target.value)} placeholder="Why is this important?" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Type</Label>
                <Select value={type} onValueChange={(val: any) => setType(val)}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="habit">Daily Habit</SelectItem>
                    <SelectItem value="milestone">Project Milestone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === 'milestone' && (
                <div className="space-y-2">
                  <Label className="text-slate-400">Target Date & Time</Label>
                  <Input type="datetime-local" className="bg-slate-800/50 border-slate-700 text-white" value={targetDate} onChange={e => setTargetDate(e.target.value)} required />
                </div>
              )}
              <Button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold tracking-widest uppercase text-xs rounded-xl" disabled={isCreating}>
                {isCreating ? "Creating..." : "Save Objective"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex gap-3 mb-2 border-b border-[#21262d] pb-4">
        <button 
          onClick={() => setActiveTab('goals')} 
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'goals' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10' : 'bg-[#161b22] text-[#8b949e] border border-[#21262d] hover:bg-[#21262d]'}`}
        >
          Project Milestones
        </button>
        <button 
          onClick={() => setActiveTab('habits')} 
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'habits' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-lg shadow-orange-500/10' : 'bg-[#161b22] text-[#8b949e] border border-[#21262d] hover:bg-[#21262d]'}`}
        >
          Daily Habits
        </button>
      </div>

      {loading ? (
        <div className="text-center text-[#8b949e] py-12">Loading...</div>
      ) : filteredGoals.length === 0 ? (
        <div className="text-center py-24 bg-[#0d1117] rounded-3xl border border-dashed border-[#21262d]">
          <Target className="mx-auto h-12 w-12 text-emerald-400/50 mb-4" />
          <h3 className="text-lg font-medium text-[#f0f6fc]">No {activeTab === 'goals' ? 'milestones' : 'habits'} yet</h3>
          <p className="text-[#8b949e]">Set a {activeTab === 'goals' ? 'milestone' : 'habit'} to start tracking progress.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGoals.map(goal => (
            <div key={goal.id} className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 relative overflow-hidden group">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-lg font-medium text-[#f0f6fc]">{goal.title}</h3>
                  <p className="text-xs text-[#8b949e] mt-1">{goal.description}</p>
                  {goal.type === 'milestone' && goal.targetDate && (
                    <p className="text-xs text-orange-400 mt-2 flex items-center">
                      <Target className="w-3 h-3 mr-1" />
                      Due: {new Date(goal.targetDate).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {goal.type === 'habit' ? (
                    <span className="px-2 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-bold rounded uppercase tracking-wider flex items-center">
                      <Flame className="w-3 h-3 mr-1" />
                      {goal.streak} Streak
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold rounded uppercase tracking-wider">
                      Milestone
                    </span>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-[#8b949e] hover:text-red-400" onClick={() => deleteGoal(goal.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                {goal.type === 'habit' ? (
                  <>
                    <Button variant="outline" size="sm" className="bg-[#161b22] border-[#21262d] text-emerald-400 hover:text-white hover:bg-emerald-600" onClick={() => updateProgress(goal.id, true)}>
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Log Habit
                    </Button>
                    <Button variant="outline" size="sm" className="bg-[#161b22] border-[#21262d] text-red-400 hover:text-white hover:bg-red-600" onClick={() => updateProgress(goal.id, false)}>
                       Missed
                    </Button>
                  </>
                ) : (
                  <div className="w-full space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-2 bg-[#161b22] rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${goal.progress}%` }}></div>
                      </div>
                      <span className="text-xs font-mono text-cyan-400">{goal.progress}%</span>
                    </div>
                    {goal.steps && goal.steps.length > 0 && (
                      <div className="space-y-2 mt-4">
                        {goal.steps.map(step => (
                          <GoalStepItem 
                            key={step.id} 
                            step={step} 
                            goal={goal} 
                            toggleStep={toggleStep} 
                            updateStepTitle={updateStepTitle} 
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        placeholder="Add new step... (Press Enter)"
                        className="bg-[#161b22] border-[#21262d] text-xs h-8"
                        onKeyDown={(e: any) => {
                          if (e.key === 'Enter' && e.target.value.trim() !== '') {
                            addStep(goal, e.target.value);
                            e.target.value = '';
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
