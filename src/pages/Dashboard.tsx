import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, doc, addDoc, setDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Task, DailyPlan } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Loader2, Calendar as CalendarIcon, Sparkles, FileText, Presentation, Table } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';

export function Dashboard() {
  const { user, getAccessToken, requestWorkspaceAccess } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  
  const [isSlidesDialogOpen, setIsSlidesDialogOpen] = useState(false);
  const [slidesType, setSlidesType] = useState('project-dashboard');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!user) return;
    const db = getDb();
    
    // Fetch pending tasks
    const qPending = query(
      collection(db, 'tasks'), 
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'in_progress'])
    );
    
    // Fetch completed tasks
    const qCompleted = query(
      collection(db, 'tasks'), 
      where('userId', '==', user.uid),
      where('status', '==', 'completed')
    );

    // Fetch AI decisions
    const qDecisions = query(
      collection(db, 'users', user.uid, 'ai_decisions')
    );
    
    const unsubscribePending = onSnapshot(qPending, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(tasksData);
      setLoadingTasks(false);
    });

    const unsubscribeCompleted = onSnapshot(qCompleted, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setCompletedTasks(tasksData);
    });

    const unsubscribeDecisions = onSnapshot(qDecisions, (snapshot) => {
      const decisionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setDecisions(decisionsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 3));
    });

    const planRef = doc(db, 'users', user.uid, 'daily_plan', today);
    const unsubscribePlan = onSnapshot(planRef, (docSnap) => {
      if (docSnap.exists()) {
        setPlan({ id: 'today', userId: user.uid, date: today, sessions: docSnap.data().sessions || [] });
      } else {
        setPlan(null);
      }
    });

    return () => {
      unsubscribePending();
      unsubscribeCompleted();
      unsubscribeDecisions();
      unsubscribePlan();
    };
  }, [user]);

  const tasksAtRisk = tasks.filter(t => (t.riskScore || 0) > 60).length;
  const topTask = tasks.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))[0];
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

      const result = await res.json();
      const db = getDb();
      if (result.decision && user) {
        await addDoc(collection(db, 'users', user.uid, 'ai_decisions'), {
          ...result.decision,
          timestamp: new Date().toISOString()
        });
      }
      if (result.plan && user) {
        await setDoc(doc(db, 'users', user.uid, 'daily_plan', today), {
          ...result.plan,
          updatedAt: new Date().toISOString()
        });
      }

      toast.success("AI is recalculating your optimal schedule...");
    } catch (error) {
       console.error(error);
       toast.error("Failed to generate plan");
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
          <h1 className="text-3xl font-light text-white leading-tight">{greeting}, <br/><span className="font-semibold italic text-indigo-300">{user?.displayName?.split(' ')[0] || 'User'}</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-tighter">AI Core Active</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4 flex-grow">
        {/* Main Plan Area */}
        <div className="col-span-12 lg:col-span-8 bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 relative overflow-hidden group min-h-[400px]">
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
        </div>

        {/* Side panel */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
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
                <p className="text-sm font-medium text-[#f0f6fc] truncate" title={topTask?.title}>{topTask?.title || 'None'}</p>
              </div>
            </div>
          </div>
          
          {/* AI Decision Feed */}
          <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5">
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
                  <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500"></div>
                  <p className="text-[10px] text-slate-500 font-data mb-1">{d.timestamp ? new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</p>
                  <p className="text-xs text-slate-300">{d.text}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Workspace Actions */}
          <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-5">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              Workspace Actions
            </h3>
            <div className="space-y-2">
              <Button onClick={async () => {
                let token = getAccessToken();
                if (!token) {
                  token = await requestWorkspaceAccess();
                }
                if (!token) return;
                try {
                  toast.loading("Syncing Calendar...");
                  const { fetchCalendarEvents } = await import('../lib/workspace');
                  
                  // Fetch today's events
                  const now = new Date();
                  const startOfDay = new Date(now.setHours(0,0,0,0)).toISOString();
                  const endOfDay = new Date(now.setHours(23,59,59,999)).toISOString();
                  const events = await fetchCalendarEvents(token, startOfDay, endOfDay);
                  
                  const idToken = await user?.getIdToken();
                  const selectedModel = localStorage.getItem('selected_gemini_model') || 'models/gemini-3.5-flash';
                  const res = await fetch('/api/autonomous-pipeline', {
                    method: 'POST',
                    headers: { 
                      'Authorization': `Bearer ${idToken}`,
                      'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({ 
                      eventName: 'Calendar Synced',
                      eventDetail: `User synced their calendar. Found ${events.items?.length || 0} events today.`,
                      tasks: tasks,
                      calendarEvents: events.items || [],
                      model: selectedModel
                    })
                  });

                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || "The AI is currently out of quota. Please switch the AI Brain model in Mission Control.");
                  }

                  const result = await res.json();
                  const db = getDb();
                  if (result.decision && user) {
                    await addDoc(collection(db, 'users', user.uid, 'ai_decisions'), {
                      ...result.decision,
                      timestamp: new Date().toISOString()
                    });
                  }
                  if (result.plan && user) {
                    await setDoc(doc(db, 'users', user.uid, 'daily_plan', today), {
                      ...result.plan,
                      updatedAt: new Date().toISOString()
                    });
                  }

                  toast.dismiss();
                  toast.success("Calendar synced and schedule re-optimized!");
                } catch (e: any) {
                  toast.dismiss();
                  toast.error(e.message || "Failed to sync calendar.");
                }
              }} className="w-full bg-[#161b22] hover:bg-indigo-900/40 text-[#f0f6fc] text-xs justify-start h-10 border border-[#21262d] shadow-sm mb-4 transition-colors">
                <CalendarIcon className="w-4 h-4 mr-2 text-indigo-400" />
                Sync Google Calendar
              </Button>
              <div className="h-[1px] bg-[#21262d] w-full mb-4"></div>
              <Button onClick={async () => {
                let token = getAccessToken();
                if (!token) {
                  token = await requestWorkspaceAccess();
                }
                if (!token) return;
                if (!window.confirm("Generate a daily progress report and save it to your Google Drive?")) return;
                try {
                  toast.loading("Generating report...");
                  const { createGoogleDoc } = await import('../lib/workspace');
                  const reportContent = `Daily Progress Report\nTasks Completed: ${completedTasks.length}\nProductivity Score: ${productivityScore}\nRemaining Tasks: ${tasks.length}`;
                  await createGoogleDoc(token, `Daily Report - ${new Date().toLocaleDateString()}`, reportContent);
                  toast.dismiss();
                  toast.success("Saved to Google Drive!");
                } catch (e) {
                  toast.dismiss();
                  toast.error("Failed to generate report.");
                }
              }} className="w-full bg-transparent hover:bg-[#161b22] text-[#8b949e] hover:text-[#f0f6fc] text-xs justify-start h-8 px-2 transition-colors">
                <FileText className="w-3 h-3 mr-2" />
                Export Daily Report (Docs)
              </Button>
              <Button onClick={() => setIsSlidesDialogOpen(true)} className="w-full bg-transparent hover:bg-[#161b22] text-[#8b949e] hover:text-[#f0f6fc] text-xs justify-start h-8 px-2 transition-colors">
                <Presentation className="w-3 h-3 mr-2" />
                Generate Presentation (Slides)
              </Button>
              <Button onClick={async () => {
                let token = getAccessToken();
                if (!token) {
                  token = await requestWorkspaceAccess();
                }
                if (!token) return;
                if (!window.confirm("Export your task history to Google Sheets?")) return;
                try {
                  toast.loading("Exporting to Sheets...");
                  const { createGoogleSheet } = await import('../lib/workspace');
                  const data = [
                    ["Task Title", "Priority", "Status", "Estimated Hours", "Risk Score"],
                    ...tasks.map(t => [t.title, t.priority, t.status, t.estimatedHours, t.riskScore || 0]),
                    ...completedTasks.map(t => [t.title, t.priority, t.status, t.estimatedHours, t.riskScore || 0])
                  ];
                  await createGoogleSheet(token, `TaskPilot AI Analytics - ${new Date().toLocaleDateString()}`, data);
                  toast.dismiss();
                  toast.success("Spreadsheet created in Google Drive!");
                } catch (e) {
                  toast.dismiss();
                  toast.error("Failed to create spreadsheet.");
                }
              }} className="w-full bg-transparent hover:bg-[#161b22] text-[#8b949e] hover:text-[#f0f6fc] text-xs justify-start h-8 px-2 transition-colors">
                <Table className="w-3 h-3 mr-2" />
                Export Analytics (Sheets)
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={isSlidesDialogOpen} onOpenChange={setIsSlidesDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[#0d1117] text-[#c9d1d9] border-[#30363d]">
          <DialogHeader>
            <DialogTitle className="text-[#f0f6fc]">Generate Presentation</DialogTitle>
            <DialogDescription className="text-[#8b949e]">
              Select the type of presentation you want to generate.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="slides-type" className="text-[#c9d1d9]">Presentation Type</Label>
              <Select value={slidesType} onValueChange={setSlidesType}>
                <SelectTrigger id="slides-type" className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]">
                  <SelectItem value="project-dashboard" className="focus:bg-[#1f242c] focus:text-[#f0f6fc]">Project Status Dashboard</SelectItem>
                  <SelectItem value="standup" className="focus:bg-[#1f242c] focus:text-[#f0f6fc]">Daily Standup Agenda</SelectItem>
                  <SelectItem value="sprint-planning" className="focus:bg-[#1f242c] focus:text-[#f0f6fc]">Sprint Planning</SelectItem>
                  <SelectItem value="progress-report" className="focus:bg-[#1f242c] focus:text-[#f0f6fc]">Progress Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setIsSlidesDialogOpen(false)} className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]">
              Cancel
            </Button>
            <Button onClick={async () => {
                let token = getAccessToken();
                if (!token) {
                  token = await requestWorkspaceAccess();
                }
                if (!token) return;
                setIsSlidesDialogOpen(false);
                try {
                  toast.loading("Generating slides...");
                  const { generatePresentation } = await import('../lib/workspace');
                  const reportData = {
                    type: slidesType,
                    tasks,
                    completedTasks
                  };
                  await generatePresentation(token, reportData);
                  toast.dismiss();
                  toast.success("Slides created in Google Drive!");
                } catch (e: any) {
                  toast.dismiss();
                  toast.error(e.message || "Failed to create presentation.");
                }
            }} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Generate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
