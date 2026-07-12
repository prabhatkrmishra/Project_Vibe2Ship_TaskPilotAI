import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { Task, Goal } from '../types';
import { Button } from '../components/ui/button';
import { Calendar as CalendarIcon, FileText, Presentation, Table, Cloud, CheckCircle, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export function Workspace() {
  const { user, getAccessToken, requestWorkspaceAccess } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const [isSlidesDialogOpen, setIsSlidesDialogOpen] = useState(false);
  const [slidesType, setSlidesType] = useState('project-dashboard');

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        const [resTasks, resGoals] = await Promise.all([
          fetch('/api/tasks', { headers }),
          fetch('/api/goals', { headers })
        ]);

        if (resTasks.ok) {
          const allTasksData = await resTasks.json() as Task[];
          setTasks(allTasksData.filter(t => t.status === 'pending' || t.status === 'in_progress'));
          setCompletedTasks(allTasksData.filter(t => t.status === 'completed'));
        }

        if (resGoals.ok) {
          const goalsData = await resGoals.json() as Goal[];
          setGoals(goalsData);
        }
      } catch (err) {
        console.error("Error loading workspace data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const handleSyncCalendar = async () => {
    let token = getAccessToken();
    if (!token) {
      token = await requestWorkspaceAccess();
    }
    if (!token) return;
    try {
      toast.loading("Syncing Calendar...");
      const { fetchCalendarEvents, createCalendarEvent } = await import('../lib/workspace');
      
      const now = new Date();
      const rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const rangeEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const events = await fetchCalendarEvents(token, rangeStart, rangeEnd);
      
      let pushedCount = 0;
      for (const task of tasks) {
        if (task.status === 'pending' || task.status === 'in_progress') {
          const exists = events.items?.find((e: any) => e.summary === task.title);
          if (!exists) {
            const taskDate = task.deadline ? new Date(task.deadline) : new Date();
            const taskStart = taskDate.toISOString();
            const taskEnd = new Date(taskDate.getTime() + 60*60*1000).toISOString();
            try {
              await createCalendarEvent(token, {
                  summary: task.title,
                  start: taskStart,
                  end: taskEnd
              });
              pushedCount++;
            } catch (err) {
              console.warn("Could not sync task to calendar", task.title);
            }
          }
        }
      }
      
      const idToken = await user?.getIdToken();
      const selectedModel = localStorage.getItem('default_gemini_model') || 'models/gemini-3.1-flash-lite';
      const res = await fetch('/api/autonomous-pipeline', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          eventName: 'Calendar Synced',
          eventDetail: `User synced their calendar. Found ${events.items?.length || 0} events today. Pushed ${pushedCount} tasks to calendar.`,
          tasks: tasks,
          calendarEvents: events.items || [],
          model: selectedModel
        })
      });

      toast.dismiss();
      toast.success(`Calendar synced! ${pushedCount > 0 ? '(' + pushedCount + ' tasks pushed)' : ''}`);
    } catch (e: any) {
      toast.dismiss();
      toast.error(e.message || "Failed to sync calendar.");
    }
  };

  const handleExportDocs = async () => {
    let token = getAccessToken();
    if (!token) {
      token = await requestWorkspaceAccess();
    }
    if (!token) return;
    
    try {
      toast.loading("Generating report...");
      const { generateGoogleDocReport } = await import('../lib/workspace');
      const reportData = {
        title: `Daily Report - ${new Date().toLocaleDateString()}`,
        tasks,
        completedTasks,
        goals
      };
      await generateGoogleDocReport(token, reportData);
      toast.dismiss();
      toast.success("Saved to Google Drive!");
    } catch (e) {
      toast.dismiss();
      toast.error("Failed to generate report.");
    }
  };

  const handleExportSheets = async () => {
    let token = getAccessToken();
    if (!token) {
      token = await requestWorkspaceAccess();
    }
    if (!token) return;
    
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
  };

  const handleGenerateSlides = async () => {
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
        completedTasks,
        goals
      };
      await generatePresentation(token, reportData);
      toast.dismiss();
      toast.success("Slides created in Google Drive!");
    } catch (e: any) {
      toast.dismiss();
      toast.error(e.message || "Failed to create presentation.");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#030712] p-6 lg:p-10 text-slate-200 custom-scrollbar relative">
      {/* Dynamic Background Blur */}
      <div className="absolute top-0 inset-x-0 h-[300px] bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none z-0"></div>

      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h2 className="text-sm font-bold text-emerald-400 tracking-widest uppercase mb-1 font-mono flex items-center gap-2">
              <Cloud className="h-4 w-4" /> Cloud Operations
            </h2>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-[#f0f6fc]">
              Workspace Actions
            </h1>
            <p className="text-slate-400 mt-3 text-sm max-w-xl">
              Connect your TaskPilot data seamlessly with Google Workspace. Push schedules, export analytics, and generate beautiful presentations from your active tasks and goals.
            </p>
          </motion.div>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          
          {/* Calendar Sync */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="group">
            <div className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <CalendarIcon className="h-6 w-6 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Sync Google Calendar</h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                  Push your pending tasks and intelligent AI schedules directly into your Google Calendar. Never miss a deadline with automated time-blocking.
                </p>
              </div>
              <Button onClick={handleSyncCalendar} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 group-hover:shadow-lg group-hover:shadow-indigo-600/20 transition-all font-semibold">
                Start Sync <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </motion.div>

          {/* Export Docs */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} className="group">
            <div className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <FileText className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Export Daily Report</h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                  Generate a beautifully formatted Google Doc containing your daily progress, active tasks, and goal summaries. Perfect for EOD reporting.
                </p>
              </div>
              <Button onClick={handleExportDocs} className="w-full bg-[#161b22] border border-[#21262d] hover:border-blue-500/30 hover:bg-blue-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                Generate Report (Docs) <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </motion.div>

          {/* Export Sheets */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="group">
            <div className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <Table className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Export Analytics</h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                  Dump your task metrics, effort estimations, and AI risk scores into Google Sheets for deep data analysis and pivot tables.
                </p>
              </div>
              <Button onClick={handleExportSheets} className="w-full bg-[#161b22] border border-[#21262d] hover:border-emerald-500/30 hover:bg-emerald-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                Generate Spreadsheet <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </motion.div>

          {/* Generate Slides */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }} className="group">
            <div className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <Presentation className="h-6 w-6 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Create Presentation</h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                  Let AI automatically draft a Google Slides presentation from your workspace data. Ideal for standups, sprint planning, or team reviews.
                </p>
              </div>
              <Button onClick={() => setIsSlidesDialogOpen(true)} className="w-full bg-[#161b22] border border-[#21262d] hover:border-amber-500/30 hover:bg-amber-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                Configure Slides <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </motion.div>

        </div>
        
        {/* Statistics or Status section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.5 }}>
          <div className="mt-8 bg-[#161b22]/50 border border-[#21262d] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#f0f6fc]">Workspace Link Active</p>
                <p className="text-xs text-slate-400">Ready to export {tasks.length} active tasks</p>
              </div>
            </div>
            <div className="text-xs text-slate-500 bg-slate-900 px-4 py-2 rounded-lg font-mono border border-slate-800">
              Authenticated Session
            </div>
          </div>
        </motion.div>

      </div>

      <Dialog open={isSlidesDialogOpen} onOpenChange={setIsSlidesDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[#0d1117] text-[#c9d1d9] border-[#30363d] rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#f0f6fc] text-xl">Configure Presentation</DialogTitle>
            <DialogDescription className="text-[#8b949e]">
              Select the format and template style for your Google Slides presentation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="space-y-3">
              <Label htmlFor="slides-type" className="text-slate-300 font-medium">Presentation Type</Label>
              <Select value={slidesType} onValueChange={setSlidesType}>
                <SelectTrigger id="slides-type" className="bg-[#161b22] border-[#30363d] text-[#c9d1d9] rounded-xl h-11">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[#161b22] border-[#30363d] text-[#c9d1d9] rounded-xl">
                  <SelectItem value="project-dashboard" className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Project Status Dashboard</SelectItem>
                  <SelectItem value="standup" className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Daily Standup Agenda</SelectItem>
                  <SelectItem value="sprint-planning" className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Sprint Planning</SelectItem>
                  <SelectItem value="progress-report" className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Progress Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setIsSlidesDialogOpen(false)} className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22] rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleGenerateSlides} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6">
              Generate Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
