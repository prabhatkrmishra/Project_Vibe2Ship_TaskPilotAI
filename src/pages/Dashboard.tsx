import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { Task, DailyPlan, Goal } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Loader2, Calendar as CalendarIcon, Sparkles, Target, Flame } from 'lucide-react';
import { toast } from 'sonner';

export function Dashboard() {
  const { user, getAccessToken, requestWorkspaceAccess } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [activeBriefTab, setActiveBriefTab] = useState<'brief' | 'insight'>('brief');

  const today = new Date().toISOString().split('T')[0];

  const fetchDashboardData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch all dashboard data simultaneously for optimal performance
      const [resTasks, resGoals, resDecisions, resPlan] = await Promise.all([
        fetch('/api/tasks', { headers }),
        fetch('/api/goals', { headers }),
        fetch('/api/ai-decisions', { headers }),
        fetch(`/api/plans/${today}`, { headers })
      ]);

      let goalsData: Goal[] = [];
      if (resGoals.ok) {
        goalsData = await resGoals.json() as Goal[];
        setGoals(goalsData);
      }

      if (resDecisions.ok) {
        const decisionsData = await resDecisions.json();
        setDecisions(decisionsData.slice(0, 3));
      }

      if (resPlan.ok) {
        const planData = await resPlan.json();
        setPlan(planData);
      } else {
        setPlan(null);
      }

      if (resTasks.ok) {
        const allTasksData = await resTasks.json() as Task[];
        
        // Sort tasks globally based on parent quest's creation date (oldest quest first)
        const sorted = allTasksData.sort((a, b) => {
          const questA = a.goalId ? goalsData.find(g => g.id === a.goalId && g.type === 'quest') : null;
          const questB = b.goalId ? goalsData.find(g => g.id === b.goalId && g.type === 'quest') : null;

          const timeA = questA?.createdAt ? new Date(questA.createdAt).getTime() : Infinity;
          const timeB = questB?.createdAt ? new Date(questB.createdAt).getTime() : Infinity;

          if (timeA !== timeB) {
            return timeA - timeB; // ascending: oldest quest first
          }

          const deadlineA = a.deadline ? new Date(a.deadline).getTime() : 0;
          const deadlineB = b.deadline ? new Date(b.deadline).getTime() : 0;
          if (deadlineA !== deadlineB) {
            return deadlineA - deadlineB;
          }

          const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return createdAtA - createdAtB;
        });

        setTasks(sorted.filter(t => t.status === 'pending' || t.status === 'in_progress'));
        setCompletedTasks(sorted.filter(t => t.status === 'completed'));
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const tasksAtRisk = tasks.filter(t => (t.riskScore || 0) > 60).length;
  const topTask = [...tasks].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))[0];
  const focusGoal = goals.find(g => g.type === 'quest' && !g.completed) || goals.find(g => !g.completed) || goals[0];
  const focusGoalTitle = focusGoal?.title || topTask?.title || 'None';
  const productivityScore = tasks.length + completedTasks.length > 0 
    ? Math.round((completedTasks.length / (tasks.length + completedTasks.length)) * 100) 
    : 0;

  const forceReplan = async () => {
    if (tasks.length === 0) {
      toast.info("No pending tasks to plan.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const token = await user?.getIdToken();
      const selectedModel = localStorage.getItem('selected_gemini_model') || 'models/gemini-3.5-flash';
      const res = await fetch('/api/autonomous-pipeline', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          eventName: 'Manual Replan Request',
          eventDetail: 'User requested a forced replan of the schedule.',
          tasks: tasks,
          model: selectedModel
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "The AI is currently out of quota. Please switch the AI Brain model in Mission Control.");
      }

      toast.success("AI is recalculating your optimal schedule...");
      await fetchDashboardData();
    } catch (error: any) {
       console.error(error);
       toast.error(error.message || "Failed to generate plan");
    } finally {
      setIsGenerating(false);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 flex flex-col h-full overflow-y-auto w-full">
      <header className="flex items-center justify-between mb-2 px-2">
        <div>
          <h1 className="text-3xl font-light text-white leading-tight">{greeting}, <br/><span className="font-semibold italic text-indigo-300">{user?.name?.split(' ')[0] || 'User'}</span></h1>
        </div>
        <div className="flex items-center gap-4">
          
          {/* Gamification Streak & Level */}
          {user?.gamification && (
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] px-3 py-1.5 rounded-full">
                <Flame className={`w-4 h-4 ${user.gamification.currentStreak > 0 ? 'text-orange-500' : 'text-slate-500'}`} />
                <span className="text-xs font-bold text-white">{user.gamification.currentStreak} Day Streak</span>
              </div>
              <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] px-3 py-1.5 rounded-full">
                <span className="text-xs font-bold text-indigo-400">LVL {user.gamification.level}</span>
                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${(user.gamification.xp / (user.gamification.level * 200)) * 100}%` }}></div>
                </div>
              </div>
            </div>
          )}

          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="hidden sm:inline text-xs font-semibold text-emerald-400 uppercase tracking-tighter">AI Core Active</span>
          </div>
        </div>
      </header>
      
      {/* AI Daily Brief & Insights Unified Tabbed Card */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-r from-indigo-950/40 to-[#0d1117] border border-indigo-500/30 rounded-3xl p-6 shadow-lg shadow-indigo-500/5"
      >
        <div className="flex items-center justify-between border-b border-[#21262d] pb-3 mb-4">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveBriefTab('brief')}
              className={`pb-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                activeBriefTab === 'brief'
                  ? 'border-indigo-500 text-indigo-300 font-extrabold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              AI Daily Brief
            </button>
            {decisions.length > 0 && (
              <button
                onClick={() => setActiveBriefTab('insight')}
                className={`pb-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                  activeBriefTab === 'insight'
                    ? 'border-emerald-500 text-emerald-400 font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Latest AI Insight
                <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Live</span>
              </button>
            )}
          </div>
          <div className="hidden sm:flex px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-widest">Active</span>
          </div>
        </div>

        <div className="min-h-[60px]">
          {activeBriefTab === 'brief' ? (
            <motion.div 
              key="brief"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/30">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-[#f0f6fc] text-base leading-relaxed font-medium">
                  {tasks.length === 0 && completedTasks.length === 0 ? (
                    "Your schedule is completely clear. Start by adding a task or a quest!"
                  ) : tasksAtRisk > 0 ? (
                    <span>Your workload requires attention. You have <strong className="text-indigo-300">{tasksAtRisk} task(s)</strong> at risk of missing deadlines. I strongly suggest prioritizing <strong className="text-indigo-400">{topTask?.title}</strong> today.</span>
                  ) : tasks.length > 0 ? (
                    <span>Your schedule looks perfectly balanced today. You have <strong className="text-indigo-300">{tasks.length} pending task(s)</strong> with no immediate risks detected. Your productivity score is currently at {productivityScore}%. Keep up the momentum!</span>
                  ) : (
                    "Excellent work! All of your tasks are completed. You're operating at 100% efficiency today."
                  )}
                </p>
              </div>
            </motion.div>
          ) : (
            decisions.length > 0 && (
              <motion.div 
                key="insight"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-white text-base font-semibold mb-1">{decisions[0].title}</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {decisions[0].reason}
                  </p>
                </div>
              </motion.div>
            )
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-12 gap-4 flex-grow">
        {/* Main Plan Area */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="col-span-12 lg:col-span-8 bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 relative overflow-hidden group min-h-[400px]"
        >
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded uppercase tracking-wider">Active Execution</span>
              </div>
              <Button onClick={forceReplan} disabled={isGenerating || loadingTasks} size="sm" className="bg-white text-indigo-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-50 transition-colors shadow-lg">
                {isGenerating ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
                {plan ? "Regenerate" : "Auto-Schedule"}
              </Button>
            </div>
            
            <h2 className="text-3xl font-light text-white mb-2 leading-tight">Today's Execution <br/><span className="font-semibold italic text-indigo-300">Plan</span></h2>
            <p className="text-slate-400 max-w-md mb-8">Your AI-optimized schedule based on deadlines and priorities.</p>

            <div className="flex-grow">
              {!plan && !isGenerating && (
                 <div className="text-center py-12 text-slate-500">
                   <p className="text-sm">Click Auto-Schedule to let AI plan your day.</p>
                 </div>
              )}
              {isGenerating && (
                <div className="text-center py-12 text-slate-500 flex flex-col items-center">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                  <p className="text-sm">Synthesizing your execution plan...</p>
                </div>
              )}
              {plan && !isGenerating && (
                <div className="space-y-3">
                  {plan.sessions.map((session, i) => {
                    const now = new Date().getTime();
                    const start = new Date(session.startTime).getTime();
                    const end = new Date(session.endTime).getTime();
                    const isPast = now > end;
                    const isActive = now >= start && now <= end;
                    const progress = isActive ? ((now - start) / (end - start)) * 100 : 0;
                    
                    // Basic risk matching based on title
                    const matchingTask = tasks.find(t => t.title === session.taskTitle);
                    const riskColor = !matchingTask ? 'bg-emerald-500' : (matchingTask.riskScore || 0) > 60 ? 'bg-red-500' : (matchingTask.riskScore || 0) > 30 ? 'bg-orange-500' : 'bg-emerald-500';

                    return (
                      <div key={i} className={`flex gap-4 p-4 rounded-2xl bg-[#161b22] border border-[#21262d] items-center relative overflow-hidden card-lift ${isPast ? 'opacity-50' : ''}`}>
                        <div className={`absolute top-0 left-0 w-full h-1 ${riskColor} opacity-50`}></div>
                        {isActive && (
                          <div className="absolute top-0 left-0 h-1 bg-cyan-400" style={{ width: `${progress}%` }}></div>
                        )}
                        <div className="w-24 text-xs font-mono font-bold text-slate-400 text-right shrink-0 border-r border-[#21262d] pr-4 uppercase">
                          {formatTime(session.startTime)}<br/>
                          <span className="text-indigo-400/70">{formatTime(session.endTime)}</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-[#f0f6fc] text-sm">{session.taskTitle}</h4>
                          <span className="text-[10px] text-emerald-400 mt-1 block font-bold uppercase tracking-widest">Deep Work Session</span>
                        </div>
                      </div>
                    );
                  })}
                  {plan.sessions.length === 0 && (
                    <div className="text-center text-slate-500 py-8 text-sm">
                      Your day is clear! No urgent tasks required.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Side panel */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="col-span-12 lg:col-span-4 flex flex-col gap-4"
        >
          {/* Workload card */}
          <div className="bg-gradient-to-b from-indigo-600 to-indigo-900 rounded-3xl p-6 shadow-2xl shadow-indigo-500/10 flex-grow">
             <h3 className="text-xl font-bold text-white mb-6">Pending Workload</h3>
             {loadingTasks ? (
               <Loader2 className="w-5 h-5 animate-spin text-white/50" />
             ) : (
               <div className="space-y-6">
                 <div>
                   <p className="text-3xl font-black text-white">{tasks.length}</p>
                   <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-widest">Tasks Remaining</p>
                 </div>
                 <div className="space-y-3">
                   {tasks.slice(0, 4).map(t => (
                     <div key={t.id} className="flex items-center justify-between p-3 bg-white/10 rounded-2xl rounded-tr-none border border-indigo-400/30">
                       <span className="text-sm text-indigo-50 truncate pr-2">{t.title}</span>
                       <span className={`text-[10px] font-bold uppercase tracking-widest ${t.priority === 'high' ? 'text-red-300' : 'text-indigo-300'}`}>
                         {t.priority}
                       </span>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>
          
          {/* Telemetry card */}
          <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Pilot Telemetry</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Tasks Completed</p>
                <p className="text-2xl font-bold text-[#f0f6fc] font-data">{completedTasks.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Productivity Score</p>
                <p className="text-2xl font-bold text-indigo-400 font-data">{productivityScore}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Tasks At Risk</p>
                <p className={`text-2xl font-bold font-data ${tasksAtRisk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{tasksAtRisk}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Focus Goal</p>
                <p className="text-sm font-medium text-[#f0f6fc] truncate" title={focusGoalTitle}>{focusGoalTitle}</p>
              </div>
            </div>
          </div>
          
          {/* Goals & Habits Monitor */}
          <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              Goals & Habits Monitor
            </h3>
            <div className="space-y-4">
              {goals.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic">No goals or habits defined. Visit Goals & Habits to start tracking.</div>
              ) : (
                goals.slice(0, 3).map(g => (
                  <div key={g.id} className="p-3 bg-[#161b22] border border-[#21262d] rounded-2xl flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200 truncate pr-2 max-w-[150px]">{g.title}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${g.type === 'habit' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                        {g.type}
                      </span>
                    </div>
                    {g.type === 'quest' ? (
                      <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${g.progress}%` }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-cyan-400 shrink-0 font-mono">{g.progress}%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-orange-400 text-xs">
                        <Flame className="w-3.5 h-3.5 fill-orange-500/20" />
                        <span className="font-bold font-mono">{g.streak || 0}</span>
                        <span className="text-[10px] text-slate-400 font-normal">day streak</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* AI Decision Feed */}
          <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 md:col-span-2">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              AI Decisions
            </h3>
            <div className="space-y-4">
              {decisions.length === 0 && (
                <div className="text-[10px] text-slate-500 italic">No decisions yet. Generate a schedule to see AI reasoning.</div>
              )}
              {decisions.map(d => (
                <div key={d.id} className="relative pl-4 border-l-2 border-[#21262d]">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-500"></div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-indigo-300">{d.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">{d.timestamp ? new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{d.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}