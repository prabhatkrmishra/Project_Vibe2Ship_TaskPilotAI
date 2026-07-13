import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Task, DailyPlan, Goal } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Loader2, Calendar as CalendarIcon, Sparkles, Target, Flame, MessageSquare, Clock } from 'lucide-react';
import { showSuccess, showError, showInfo } from '../lib/toastTheme';
import { CircularProgress } from '../components/CircularProgress';
import { ActiveSessionCard } from '../components/ActiveSessionCard';
import { safeJson } from '../lib/utils';
import { TaskSelectionModal } from '../components/TaskSelectionModal';
import { useAIJobs } from '../lib/AIJobContext';

export function Dashboard() {
  const { user, getAccessToken, requestWorkspaceAccess } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeBriefTab, setActiveBriefTab] = useState<'brief' | 'insight'>('brief');
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const { startJob, endJob, isJobRunning } = useAIJobs();
  const isJobActive = isJobRunning('generate-plan');

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

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
        goalsData = await safeJson(resGoals) as Goal[];
        setGoals(goalsData);
      }

      if (resDecisions.ok) {
        const decisionsData = await safeJson(resDecisions);
        setDecisions(decisionsData.slice(0, 3));
      }

      if (resPlan.ok) {
        const planData = await safeJson(resPlan);
        setPlan(planData);
      } else {
        setPlan(null);
      }

      if (resTasks.ok) {
        const allTasksData = await safeJson(resTasks) as Task[];
        
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

  // NOTE: This calls /api/generate-plan, which only assigns pending tasks into the
  // EXISTING timetable's work slots and preserves each session's completed/started
  // progress. It intentionally does NOT regenerate the day from scratch — that is a
  // different, more destructive action available from the Timetable page's "Force
  // Replan" button (POST /api/autonomous-pipeline). Keep these two contracts distinct.
  const scheduleTasksIntoTimetable = async (selectedTasks: Task[]) => {
    if (!user) return;
    if (selectedTasks.length === 0) {
      showInfo("No pending tasks to plan.");
      return;
    }

    setIsGenerating(true);
    startJob('generate-plan', 'Scheduling tasks into timetable');
    try {
      const token = await user?.getIdToken();
      const selectedModel = localStorage.getItem('default_gemini_model') || 'gemini-3.1-flash-lite';
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          date: today,
          tasks: selectedTasks,
          model: selectedModel
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate schedule.");
      }

      showSuccess("AI is recalculating your optimal schedule...");
      await fetchDashboardData();
    } catch (error: any) {
       console.error(error);
       showError(error.message || "Failed to generate plan");
    } finally {
      setIsGenerating(false);
      endJob('generate-plan');
    }
  };

  const tasksAtRisk = tasks.filter(t => (t.riskScore || 0) > 60).length;
  const topTask = [...tasks].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))[0];
  const focusGoal = goals.find(g => g.type === 'quest' && !g.completed) || goals.find(g => !g.completed) || goals[0];
  const focusGoalTitle = focusGoal?.title || topTask?.title || 'None';
  const productivityScore = tasks.length + completedTasks.length > 0 
    ? Math.round((completedTasks.length / (tasks.length + completedTasks.length)) * 100) 
    : 0;

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
                <CircularProgress progress={user.gamification.level > 0 ? Math.min(100, (user.gamification.xp / (user.gamification.level * 200)) * 100) : 0} size={24} strokeWidth={3} color="stroke-indigo-500">
                  <span className="text-[8px] font-bold text-indigo-400">XP</span>
                </CircularProgress>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 flex-grow auto-rows-min">
        {/* Main Plan Area - large block, plus the Active Session card stacked above it */}
        <div className="col-span-1 md:col-span-2 lg:col-span-8 lg:row-span-3 flex flex-col gap-4 h-full">
        <ActiveSessionCard plan={plan} />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 relative overflow-hidden group flex-1 min-h-[280px] transition-all hover:border-[#30363d] shadow-lg"
        >
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded uppercase tracking-wider">Active Execution</span>
              </div>
              {tasks.length > 0 && (
                <Button onClick={() => setShowSelectionModal(true)} disabled={isGenerating || isJobActive || loadingTasks} size="sm" className="bg-white text-indigo-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-50 transition-colors shadow-lg">
                  {(isGenerating || isJobActive) ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
                  {plan ? "Assign Tasks to Timetable" : "Auto-Schedule"}
                </Button>
              )}
            </div>
            
            <h2 className="text-3xl font-light text-white mb-2 leading-tight">Today's Execution <br/><span className="font-semibold italic text-indigo-300">Plan</span></h2>
            <p className="text-slate-400 max-w-md mb-8">Your AI-optimized schedule based on deadlines and priorities.</p>

            <div className="flex-grow">
              {!plan && !isGenerating && !isJobActive && (
                tasks.length === 0 ? (
                  <div className="text-center py-12 px-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                    <span className="inline-block p-3 rounded-full bg-indigo-500/10 text-indigo-400 mb-3">
                      <Sparkles className="w-6 h-6" />
                    </span>
                    <h4 className="text-sm font-semibold text-white">Your Dashboard is Clear</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">You don't have any pending tasks right now. Go to the Mission Board to add tasks and define your quests!</p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-sm">Click Auto-Schedule to let AI plan your day.</p>
                  </div>
                )
              )}
              {(isGenerating || isJobActive) && (
                <div className="text-center py-12 text-slate-500 flex flex-col items-center">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                  <p className="text-sm">Synthesizing your execution plan...</p>
                </div>
              )}
              {plan && !isGenerating && !isJobActive && (
                <div className="space-y-3">
                  {(() => {
                    // Filter out sessions that do not correspond to any of our current tasks (pending or completed)
                    const visibleSessions = plan.sessions.filter(session => {
                      const isPending = tasks.some(t => t.title === session.taskTitle);
                      const isCompleted = session.completed || completedTasks.some(t => t.title === session.taskTitle);
                      return isPending || isCompleted;
                    });

                    if (tasks.length === 0) {
                      return (
                        <div className="text-center py-12 px-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                          <span className="inline-block p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-3 animate-bounce">
                            <Sparkles className="w-6 h-6" />
                          </span>
                          <h4 className="text-sm font-semibold text-white">Execution Plan Fully Completed!</h4>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Fantastic job, Pilot! All scheduled tasks have been finished. Your daily dashboard is completely clear.</p>
                        </div>
                      );
                    }

                    if (visibleSessions.length === 0) {
                      return (
                        <div className="text-center py-12 text-slate-500">
                          <p className="text-sm">No scheduled sessions for your pending tasks. Click Reschedule to build a new timeline.</p>
                        </div>
                      );
                    }

                    return visibleSessions.map((session, i) => {
                      const now = new Date().getTime();
                      const start = new Date(session.startTime).getTime();
                      const end = new Date(session.endTime).getTime();
                      const isPast = now > end;
                      const isTimeWindowActive = now >= start && now <= end;
                      const isActive = isTimeWindowActive && !!session.started;
                      const progress = isActive ? ((now - start) / (end - start)) * 100 : 0;
                      
                      const matchingTask = tasks.find(t => t.title === session.taskTitle);
                      const isCompleted = session.completed || completedTasks.some(t => t.title === session.taskTitle);
                      
                      const riskColor = isCompleted 
                        ? 'bg-emerald-500' 
                        : !matchingTask 
                          ? 'bg-emerald-500' 
                          : (matchingTask.riskScore || 0) > 60 
                            ? 'bg-red-500' 
                            : (matchingTask.riskScore || 0) > 30 
                              ? 'bg-orange-500' 
                              : 'bg-emerald-500';

                      return (
                        <div 
                          key={i} 
                          className={`flex gap-4 p-4 rounded-2xl border items-center relative overflow-hidden transition-all ${
                            isCompleted 
                              ? 'bg-emerald-500/5 border-emerald-500/20 opacity-75' 
                              : isPast 
                                ? 'bg-[#161b22] border-[#21262d] opacity-50' 
                                : 'bg-[#161b22] border-[#21262d] card-lift'
                          }`}
                        >
                          <div className={`absolute top-0 left-0 w-full h-1 ${riskColor} ${isCompleted ? 'opacity-80' : 'opacity-50'}`}></div>
                          {isActive && !isCompleted && (
                            <div className="absolute top-0 left-0 h-1 bg-cyan-400" style={{ width: `${progress}%` }}></div>
                          )}
                          <div className="w-24 text-xs font-mono font-bold text-slate-400 text-right shrink-0 border-r border-[#21262d] pr-4 uppercase">
                            {formatTime(session.startTime)}<br/>
                            <span className="text-indigo-400/70">{formatTime(session.endTime)}</span>
                          </div>
                          <div className="flex-grow">
                            <h4 className={`font-medium text-sm ${isCompleted ? 'text-slate-400 line-through font-normal' : 'text-[#f0f6fc]'}`}>
                              {session.sessionLabel || session.taskTitle}
                            </h4>
                            {isCompleted ? (
                              <span className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1 font-bold uppercase tracking-widest">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                Completed
                              </span>
                            ) : (
                              <span className="text-[10px] text-indigo-400 mt-1 block font-bold uppercase tracking-widest">Deep Work Session</span>
                            )}
                          </div>
                          {isCompleted && (
                            <div className="text-emerald-400 shrink-0">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="col-span-1 md:col-span-1 lg:col-span-4 bg-gradient-to-b from-indigo-600 to-indigo-900 rounded-3xl p-6 shadow-2xl shadow-indigo-500/10 flex flex-col justify-between transition-transform hover:-translate-y-1"
        >
          {/* Workload card */}
          <div className="flex-grow">
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
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider border ${
                          t.priority === 'high' ? 'bg-red-500/15 text-red-400 border-red-500/25' :
                          t.priority === 'medium' ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' :
                          'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                        }`}>
                          {t.priority}
                        </span>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>
        </motion.div>
          
        {/* Telemetry card */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="col-span-1 md:col-span-1 lg:col-span-4 bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 transition-colors hover:border-[#30363d]"
        >
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Pilot Telemetry</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center justify-center bg-[#161b22] rounded-2xl p-4">
                <CircularProgress progress={Math.min(100, completedTasks.length * 10)} size={64} color="stroke-indigo-400" trackColor="stroke-[#21262d]">
                  <span className="text-lg font-mono font-bold text-[#f0f6fc]">{completedTasks.length}</span>
                </CircularProgress>
                <p className="text-[10px] text-slate-500 uppercase font-bold mt-2 text-center">Tasks<br/>Done</p>
              </div>
              <div className="flex flex-col items-center justify-center bg-[#161b22] rounded-2xl p-4">
                <CircularProgress progress={Math.min(100, productivityScore)} size={64} color="stroke-cyan-400" trackColor="stroke-[#21262d]">
                  <span className="text-lg font-mono font-bold text-cyan-400">{productivityScore}</span>
                </CircularProgress>
                <p className="text-[10px] text-slate-500 uppercase font-bold mt-2 text-center">Prod<br/>Score</p>
              </div>
              <div className="flex flex-col items-center justify-center bg-[#161b22] rounded-2xl p-4">
                <CircularProgress progress={tasksAtRisk > 0 ? 100 : 0} size={64} color={tasksAtRisk > 0 ? "stroke-red-500" : "stroke-emerald-400"} trackColor="stroke-[#21262d]">
                  <span className={`text-lg font-mono font-bold ${tasksAtRisk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{tasksAtRisk}</span>
                </CircularProgress>
                <p className="text-[10px] text-slate-500 uppercase font-bold mt-2 text-center">At<br/>Risk</p>
              </div>
              <div className="flex flex-col items-center justify-center bg-[#161b22] rounded-2xl p-4 overflow-hidden">
                <Target className="w-8 h-8 text-indigo-400/50 mb-2" />
                <p className="text-xs font-medium text-[#f0f6fc] text-center w-full truncate px-2" title={focusGoalTitle}>{focusGoalTitle}</p>
                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Focus</p>
              </div>
            </div>
          </motion.div>
          
        {/* Goals & Habits Monitor */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="col-span-1 md:col-span-2 lg:col-span-4 bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 transition-colors hover:border-[#30363d] flex flex-col justify-between min-h-[240px]"
        >
          <div className="flex flex-col h-full w-full justify-between gap-4">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              Goals & Habits Monitor
            </h3>
            <div className="w-full flex-grow flex flex-col justify-center">
              {goals.filter(g => !g.completed).length === 0 ? (
                <div className="text-[11px] text-slate-500 italic py-6 text-center">No active goals or habits defined. Visit Goals & Habits to start tracking.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3 w-full">
                  {goals.filter(g => !g.completed).slice(0, 3).map(g => (
                    <div key={g.id} className="p-3 bg-[#161b22] border border-[#21262d] rounded-2xl flex flex-col justify-between gap-2 min-h-[90px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200 truncate" title={g.title}>{g.title}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${g.type === 'habit' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                          {g.type}
                        </span>
                      </div>
                      {g.type === 'quest' ? (
                        <div className="flex items-center gap-3 w-full justify-between mt-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Progress</span>
                          <CircularProgress progress={g.progress} size={28} strokeWidth={3.5} color="stroke-cyan-400">
                            <span className="text-[8px] font-mono font-bold text-cyan-400">{g.progress}%</span>
                          </CircularProgress>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <motion.div animate={{ filter: ["drop-shadow(0px 0px 2px rgba(249,115,22,0.4))", "drop-shadow(0px 0px 6px rgba(249,115,22,0.8))", "drop-shadow(0px 0px 2px rgba(249,115,22,0.4))"] }} transition={{ duration: 2, repeat: Infinity }} className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-500/10 rounded-lg border border-orange-500/20 text-orange-400">
                            <Flame className="w-3 h-3 animate-pulse" />
                            <span className="text-xs font-bold font-mono">{g.streak || 0}</span>
                          </motion.div>
                          <span className="text-[9px] text-slate-500 font-medium uppercase tracking-widest">Day Streak</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
          
        {/* AI Decision Feed */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="col-span-1 md:col-span-2 lg:col-span-12 bg-[#0d1117] border border-[#21262d] rounded-3xl p-5 transition-colors hover:border-[#30363d]"
        >
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
        </motion.div>
      </div>

      {/* Task Selection Modal */}
      <TaskSelectionModal
        open={showSelectionModal}
        onOpenChange={setShowSelectionModal}
        tasks={tasks}
        goals={goals}
        onConfirm={(selected) => {
          setShowSelectionModal(false);
          scheduleTasksIntoTimetable(selected);
        }}
        isGenerating={isGenerating || isJobActive}
      />

      {/* Floating Chat Button leading to Mission Control Chat */}
      <motion.div 
        className="fixed bottom-6 right-6 z-50"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Link 
          to="/chat" 
          className="group flex items-center gap-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold px-4 py-3 sm:px-5 sm:py-3.5 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] border border-indigo-400/30 transition-all duration-300"
        >
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400 opacity-75 animate-ping"></span>
            <MessageSquare className="w-5 h-5 text-white relative z-10" />
          </div>
          <span className="text-xs uppercase tracking-wider font-bold font-sans hidden sm:inline">Mission Control Chat</span>
        </Link>
      </motion.div>
    </div>
  );
}