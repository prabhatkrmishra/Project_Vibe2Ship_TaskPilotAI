import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { Task, DailyPlan } from '../types';
import { Button } from '../components/ui/button';
import { Loader2, Calendar as CalendarIcon, Sparkles, Clock, CheckCircle2, Printer, Download, FileText, Pencil, Plus, Trash2, GripVertical, X, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

const safeJson = async (res: Response) => {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('text/html')) {
    throw new Error('Server returned HTML. Please refresh or try again.');
  }
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(`Expected JSON response but received ${contentType || 'none'}`);
  }
  return res.json();
};

const DAY_PRESETS = [
  { 
    title: "☀️ Early Bird Elite", 
    desc: "Wake at 5:30 AM, intensive morning deep work, standard work hours, healthy sleep by 10:00 PM.", 
    prompt: "I am an early bird. I wake up at 05:30 AM, love exercising in the morning, do my best deep work before lunch, have a lunch break at 12:30 PM, a brief afternoon review, and wind down to sleep by 10:00 PM."
  },
  { 
    title: "🌙 Night Owl Builder", 
    desc: "Sleep late & wake at 9:00 AM, creative and admin afternoon, peak focus from 9 PM to 1 AM.", 
    prompt: "I am a night owl. I sleep late and wake up around 09:00 AM. I refresh and plan in the late morning, have lunch at 1:30 PM, focus in the afternoon, dinner at 8:30 PM, and have my most productive deep work blocks from 9:30 PM to 12:30 AM."
  },
  { 
    title: "🏡 Remote Worker", 
    desc: "Wake at 7:30 AM, standard 9-5 deep work blocks, clear separation of work and family/recreation.", 
    prompt: "I work remotely. I wake up at 07:30 AM, have a healthy morning routine with breakfast, work focused hours from 09:00 AM to 05:00 PM with lunch at 12:00 PM, exercise at 05:30 PM, dinner at 07:30 PM, and sleep at 11:00 PM."
  },
  { 
    title: "⚡ Peak Fitness", 
    desc: "Wake at 6:30 AM, heavy focus on physical training, nutrition, and disciplined focus.", 
    prompt: "I have a highly active athletic style. Wake up at 06:30 AM, morning cardio, deep focus work in late morning and afternoon, weight training at 05:00 PM, high protein dinner at 07:30 PM, reflection, and sleep at 10:30 PM."
  }
];

export function Timetable() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dayDescription, setDayDescription] = useState<string>('');
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Editing, Adding, Dragging States
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null = none, -1 = add new
  const [editTitle, setEditTitle] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const isoToTimeStr = (isoString: string) => {
    const match = isoString.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "12:00";
  };

  const handleStartEdit = (idx: number, session: any) => {
    setEditingIndex(idx);
    setEditTitle(session.taskTitle);
    setEditStartTime(isoToTimeStr(session.startTime));
    setEditEndTime(isoToTimeStr(session.endTime));
  };

  const handleStartAdd = (prepopulatedStartTime?: string, prepopulatedEndTime?: string) => {
    setEditingIndex(-1);
    setEditTitle('');
    setEditStartTime(prepopulatedStartTime || "08:00");
    setEditEndTime(prepopulatedEndTime || "09:00");
  };

  const saveSessions = async (updatedSessions: any[]) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/plans/${today}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessions: updatedSessions })
      });
      if (res.ok) {
        const updatedPlan = await res.json();
        setPlan(updatedPlan);
        toast.success("Timetable updated and synchronized!");
      } else {
        toast.error("Failed to sync updated timetable with server.");
      }
    } catch (err) {
      console.error("Error syncing timetable:", err);
      toast.error("Network error while syncing timetable.");
    }
  };

  const handleSaveSlot = async () => {
    if (!plan) return;
    if (!editTitle.trim()) {
      toast.error("Please enter a title for the session.");
      return;
    }

    let startISO = `${today}T${editStartTime}:00.000`;
    let endISO = `${today}T${editEndTime}:00.000`;
    if (editEndTime < editStartTime) {
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = getLocalYYYYMMDD(tomorrowDate);
      endISO = `${tomorrowStr}T${editEndTime}:00.000`;
    }

    let updatedSessions = [...plan.sessions];

    if (editingIndex === -1) {
      updatedSessions.push({
        taskId: "",
        taskTitle: editTitle.trim(),
        startTime: startISO,
        endTime: endISO
      });
    } else if (editingIndex !== null && editingIndex >= 0) {
      updatedSessions[editingIndex] = {
        ...updatedSessions[editingIndex],
        taskId: updatedSessions[editingIndex].taskId || "",
        taskTitle: editTitle.trim(),
        startTime: startISO,
        endTime: endISO
      };
    }

    // Sort chronologically by start time
    updatedSessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    setEditingIndex(null);
    await saveSessions(updatedSessions);
  };

  const handleDeleteSlot = async (idx: number) => {
    if (!plan) return;
    const updatedSessions = plan.sessions.filter((_, i) => i !== idx);
    await saveSessions(updatedSessions);
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (idx !== dragOverIdx) {
      setDragOverIdx(idx);
    }
  };

  const handleDrop = async (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx || !plan) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }

    const updatedSessions = [...plan.sessions];
    const [removed] = updatedSessions.splice(draggedIdx, 1);
    updatedSessions.splice(idx, 0, removed);

    // Swap times so they keep the fixed chronological sequence
    const originalTimes = plan.sessions.map(s => ({ startTime: s.startTime, endTime: s.endTime }));
    const finalSessions = updatedSessions.map((session, index) => ({
      ...session,
      startTime: originalTimes[index].startTime,
      endTime: originalTimes[index].endTime
    }));

    setDraggedIdx(null);
    setDragOverIdx(null);
    await saveSessions(finalSessions);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const getLocalYYYYMMDD = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getLocalYYYYMMDD();

  const fetchTimetableData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      const [resTasks, resPlan] = await Promise.all([
        fetch('/api/tasks', { headers }),
        fetch(`/api/plans/${today}`, { headers })
      ]);

      if (resPlan.ok) {
        const planData = await safeJson(resPlan);
        setPlan(planData);
      } else {
        setPlan(null);
      }

      if (resTasks.ok) {
        const allTasks = await safeJson(resTasks) as Task[];
        setTasks(allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress'));
        setCompletedTasks(allTasks.filter(t => t.status === 'completed'));
      }
    } catch (err) {
      console.error("Error loading timetable data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTimetableData();
    }
  }, [user]);

  const forceReplan = async (customDesc?: string) => {
    setIsGenerating(true);
    const descToUse = customDesc !== undefined ? customDesc : dayDescription;
    try {
      const token = await user?.getIdToken();
      const selectedModel = localStorage.getItem('default_gemini_model') || 'models/gemini-3.1-flash-lite';
      const res = await fetch('/api/autonomous-pipeline', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          eventName: 'Manual Replan Request',
          eventDetail: 'User requested a forced replan of the schedule with custom preferences.',
          tasks: tasks,
          model: selectedModel,
          dayDescription: descToUse || "Design a classic balanced high-discipline routine.",
          localDateStr: today,
          localTimeStr: new Date().toLocaleTimeString()
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "The AI is currently out of quota. Please switch the AI Brain model in Mission Control.");
      }

      toast.success("Gemini has customized your daily timetable!");
      await fetchTimetableData();
      setShowConfig(false);
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

  const getLocalDateString = () => {
    return new Date().toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleMarkCompleted = async (index: number) => {
    if (!plan) return;
    const session = plan.sessions[index];
    let updatedSessions = [...plan.sessions];
    updatedSessions[index] = { ...session, completed: true };
    await saveSessions(updatedSessions);
    
    const matchingTask = tasks.find(t => t.title === session.taskTitle);
    if (matchingTask) {
       try {
         const token = await user?.getIdToken();
         await fetch(`/api/tasks/${matchingTask.id}`, {
           method: 'PUT',
           headers: {
             'Authorization': `Bearer ${token}`,
             'Content-Type': 'application/json'
           },
           body: JSON.stringify({ status: 'completed' })
         });
         setCompletedTasks(prev => [...prev, { ...matchingTask, status: 'completed' }]);
         setTasks(prev => prev.filter(t => t.id !== matchingTask.id));
       } catch(e) {
         console.error(e);
       }
    }
  };

  const handleStartSession = async (index: number) => {
    if (!plan) return;
    const session = plan.sessions[index];

    // Only one session can be running at a time.
    const activeSessionIdx = plan.sessions.findIndex((s, i) => i !== index && s.started && !s.completed);
    if (activeSessionIdx !== -1) {
      toast.error(`A session is already in progress: "${plan.sessions[activeSessionIdx].taskTitle}". Finish or stop it before starting another.`);
      return;
    }

    let updatedSessions = [...plan.sessions];
    updatedSessions[index] = { ...session, started: true };
    await saveSessions(updatedSessions);
  };

  const exportToICS = () => {
    if (!plan || plan.sessions.length === 0) {
      toast.error("No scheduled sessions to export.");
      return;
    }
    const visibleSessions = plan.sessions;

    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AI Pilot Daily Timetable//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";

    visibleSessions.forEach((session, idx) => {
      // Ensure correctly formatted UTC date strings for ICS (YYYYMMDDTHHMMSSZ)
      const startStr = new Date(session.startTime).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const endStr = new Date(session.endTime).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const createdStr = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:session-${idx}-${Date.now()}@aipilot.ai\r\n`;
      icsContent += `DTSTAMP:${createdStr}\r\n`;
      icsContent += `DTSTART:${startStr}\r\n`;
      icsContent += `DTEND:${endStr}\r\n`;
      icsContent += `SUMMARY:${session.taskTitle.replace(/,/g, "\\,")}\r\n`;
      icsContent += "DESCRIPTION:Deep work session generated by AI Pilot Autonomous Planner.\r\n";
      icsContent += "STATUS:CONFIRMED\r\n";
      icsContent += "SEQUENCE:0\r\n";
      icsContent += "END:VEVENT\r\n";
    });

    icsContent += "END:VCALENDAR\r\n";

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable-${today}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Calendar file (.ics) downloaded! You can import this into Google Calendar or Apple Calendar.");
  };

  const exportToDoc = () => {
    if (!plan || plan.sessions.length === 0) {
      toast.error("No scheduled sessions to export.");
      return;
    }
    const visibleSessions = plan.sessions;

    const dateStr = getLocalDateString();
    let html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>Daily Timetable - ${dateStr}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #333333; margin: 40px; }
          h1 { color: #4f46e5; font-size: 24pt; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 5px; }
          .subtitle { color: #64748b; font-size: 11pt; margin-bottom: 30px; font-style: italic; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #f1f5f9; color: #334155; text-align: left; padding: 12px; font-weight: bold; border-bottom: 2px solid #cbd5e1; }
          td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 10pt; }
          .time { font-family: Consolas, monospace; font-weight: bold; color: #4f46e5; width: 150px; }
          .title { font-weight: 600; color: #0f172a; }
          .status { font-size: 9pt; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
          .status-completed { color: #16a34a; }
          .status-scheduled { color: #4f46e5; }
          .footer { margin-top: 50px; font-size: 9pt; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <h1>AI Pilot — Daily Timetable</h1>
        <div class="subtitle">Generated Schedule for ${dateStr}</div>
        <table>
          <thead>
            <tr>
              <th>Time Slot</th>
              <th>Task/Session Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    visibleSessions.forEach(session => {
      const isCompleted = session.completed || completedTasks.some(t => t.title === session.taskTitle);
      const statusText = isCompleted ? "Completed" : "Scheduled";
      const statusClass = isCompleted ? "status-completed" : "status-scheduled";
      
      html += `
            <tr>
              <td class="time">${formatTime(session.startTime)} - ${formatTime(session.endTime)}</td>
              <td class="title">${session.taskTitle}</td>
              <td class="status ${statusClass}">${statusText}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <div class="footer">
          Generated by AI Pilot Assistant on ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `;

    // Word Document requires application/msword with UTF-8 byte order mark (BOM) for special character safety
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable-${today}.doc`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Word Document (.doc) downloaded! Perfect for offline reference or import into Google Docs.");
  };

  const printTimetable = () => {
    if (!plan || plan.sessions.length === 0) {
      toast.error("No scheduled sessions to print.");
      return;
    }
    const visibleSessions = plan.sessions;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Pop-up blocker is preventing the printable view from opening. Please allow popups for this site.");
      return;
    }

    const dateStr = getLocalDateString();
    let itemsHtml = '';
    visibleSessions.forEach(session => {
      const isCompleted = session.completed || completedTasks.some(t => t.title === session.taskTitle);
      itemsHtml += `
        <div class="item ${isCompleted ? 'completed' : ''}">
          <div class="time-block">
            <div class="time">${formatTime(session.startTime)}</div>
            <div class="time-end">${formatTime(session.endTime)}</div>
          </div>
          <div class="info">
            <div class="title">${session.taskTitle}</div>
            <div class="status">${isCompleted ? '✓ Completed' : '○ Scheduled'}</div>
          </div>
        </div>
      `;
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Daily Timetable - ${dateStr}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1a202c;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            header {
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            h1 {
              font-size: 28px;
              font-weight: 300;
              margin: 0;
              color: #4c51bf;
            }
            .date {
              font-size: 14px;
              color: #718096;
              margin-top: 5px;
            }
            .list {
              display: flex;
              flex-direction: column;
              gap: 15px;
            }
            .item {
              display: flex;
              padding: 15px;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              align-items: center;
            }
            .item.completed {
              background-color: #f0fff4;
              border-color: #c6f6d5;
              opacity: 0.8;
            }
            .item.completed .title {
              text-decoration: line-through;
              color: #4a5568;
            }
            .time-block {
              width: 120px;
              font-family: monospace;
              font-weight: bold;
              font-size: 14px;
              border-right: 2px solid #edf2f7;
              padding-right: 15px;
              margin-right: 15px;
            }
            .time-end {
              font-size: 11px;
              color: #718096;
              font-weight: normal;
            }
            .info {
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-grow: 1;
              gap: 20px;
            }
            .title {
              font-size: 16px;
              font-weight: 500;
              flex-grow: 1;
              line-height: 1.4;
            }
            .status {
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
              color: #4c51bf;
              white-space: nowrap;
              flex-shrink: 0;
            }
            .completed .status {
              color: #38a169;
            }
            footer {
              margin-top: 60px;
              text-align: center;
              font-size: 12px;
              color: #a0aec0;
              border-top: 1px solid #e2e8f0;
              padding-top: 20px;
            }
            @media print {
              body { padding: 20px; }
              button { display: none; }
            }
            .no-print {
              background: #4c51bf;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 6px;
              font-weight: bold;
              cursor: pointer;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">Print This Timetable</button>
          <header>
            <h1>AI Pilot — Daily Timetable</h1>
            <div class="date">${dateStr}</div>
          </header>
          <div class="list">
            ${itemsHtml}
          </div>
          <footer>
            Generated by AI Pilot Assistant
          </footer>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 flex flex-col h-full overflow-y-auto w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            Temporal Engine Active
          </span>
          <h1 className="text-3xl font-light text-white leading-tight mt-2">
            Daily <span className="font-semibold italic text-indigo-300">Timetable</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-slate-500" />
            {getLocalDateString()}
          </p>
        </div>

        {!loading && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {plan && (
              <Button 
                onClick={() => handleStartAdd()} 
                size="sm" 
                className="bg-[#161b22] border border-[#30363d] hover:border-indigo-500 text-slate-300 hover:text-white rounded-xl font-bold text-xs uppercase tracking-widest px-4 py-2.5 h-auto cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Session
              </Button>
            )}
            <Button 
              onClick={() => setShowConfig(!showConfig)} 
              disabled={isGenerating} 
              size="sm" 
              className={`rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-lg px-4 py-2.5 h-auto cursor-pointer flex items-center gap-2 ${
                showConfig 
                  ? 'bg-slate-800 border border-[#30363d] text-slate-300 hover:text-white' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10'
              }`}
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {plan ? (showConfig ? "Close Customizer" : "Customize Routine") : (showConfig ? "Close Settings" : "Set Day Rhythm")}
            </Button>
          </div>
        )}
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 shadow-xl"
      >
        {loading ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-sm text-slate-400 font-mono">Loading Temporal Schematics...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(!plan || showConfig) && !isGenerating && (
              <div className="space-y-6 bg-indigo-500/5 p-5 md:p-6 border border-indigo-500/10 rounded-2xl">
                <div className="text-center md:text-left">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 justify-center md:justify-start">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    How is your day like?
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Describe your ideal daily rhythm or select one of our high-discipline templates below. Gemini will design a perfectly structured schedule based on your custom hours.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DAY_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => setDayDescription(preset.prompt)}
                      className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        dayDescription === preset.prompt 
                          ? 'bg-indigo-600/15 border-indigo-500 shadow-md shadow-indigo-500/15' 
                          : 'bg-[#161b22] border-[#21262d] hover:border-slate-700'
                      }`}
                    >
                      <h4 className="text-xs font-bold text-white mb-1">{preset.title}</h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{preset.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider block">
                    Custom Routine Preferences
                  </label>
                  <textarea
                    value={dayDescription}
                    onChange={(e) => setDayDescription(e.target.value)}
                    placeholder="e.g. I wake up at 7:00 AM, have a run at 7:30 AM, eat breakfast at 8:30 AM, work until 4 PM, spend family time until 8 PM, and sleep at 10:30 PM."
                    className="w-full h-24 bg-[#161b22] border border-[#30363d] rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  {plan && (
                    <Button
                      onClick={() => setShowConfig(false)}
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancel Customization
                    </Button>
                  )}
                  <Button
                    onClick={() => forceReplan()}
                    className="ml-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-6 py-3 shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {plan ? "Update Timetable" : "Generate Discipline Timetable"}
                  </Button>
                </div>
              </div>
            )}

            {isGenerating && (
              <div className="text-center py-20 flex flex-col items-center">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-500" />
                <h4 className="text-base font-semibold text-white">Synthesizing Daily Schedule...</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Gemini is analyzing your pending tasks, risk weights, and workload patterns to craft an optimal execution plan.
                </p>
              </div>
            )}

            {plan && !isGenerating && (
              <div className="space-y-4">
                {!showConfig && (
                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-[11px] text-slate-400 flex items-center gap-2">
                    <span className="text-indigo-400">💡</span>
                    <span>Want to customize your daily constraints (like waking up late, gym blocks, or night focus hours)? Click <strong>Customize Routine</strong> at the top right!</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#161b22] border border-[#21262d] rounded-2xl mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    <span className="text-xs font-semibold text-slate-300 font-mono">EXPORT UTILITIES ACTIVE</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={printTimetable}
                      variant="outline"
                      size="sm"
                      className="border-[#30363d] text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                    >
                      <Printer className="w-3.5 h-3.5 text-indigo-400" />
                      Print View
                    </Button>
                    <Button
                      onClick={exportToICS}
                      variant="outline"
                      size="sm"
                      className="border-[#30363d] text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      Calendar (.ics)
                    </Button>
                    <Button
                      onClick={exportToDoc}
                      variant="outline"
                      size="sm"
                      className="border-[#30363d] text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                    >
                      <FileText className="w-3.5 h-3.5 text-pink-400" />
                      Document (.doc)
                    </Button>
                  </div>
                </div>

                {(() => {
                  const visibleSessions = plan.sessions;

                  if (!visibleSessions || visibleSessions.length === 0) {
                    return (
                      <div className="text-center py-16 text-slate-400 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
                        <p className="text-sm mb-4">No scheduled sessions in your Daily Timetable.</p>
                        <Button 
                          onClick={() => forceReplan()} 
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-4 py-2"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-2" />
                          Generate General Timetable
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div className="relative border-l-2 border-slate-800 pl-6 ml-4 sm:ml-8 space-y-6">
                      {visibleSessions.map((session, i) => {
                        const now = new Date().getTime();
                        const start = new Date(session.startTime).getTime();
                        const end = new Date(session.endTime).getTime();
                        const isPast = now > end;
                        const isTimeWindowActive = now >= start && now <= end;
                        const isActive = isTimeWindowActive && !!session.started;
                        const progress = isActive ? ((now - start) / (end - start)) * 100 : 0;
                        // A session can be marked as finished once it has actually started, or once its
                        // time window has fully elapsed (e.g. it was missed). The old rule that only allowed
                        // completion for sessions longer than 3 hours blocked normal short sessions from
                        // ever being marked complete while still in progress.
                        const canMarkCompleted = isPast || !!session.started;
                        
                        const matchingTask = tasks.find(t => t.title === session.taskTitle);
                        const isCompleted = session.completed || completedTasks.some(t => t.title === session.taskTitle);
                        
                        const riskColor = isCompleted 
                          ? 'bg-emerald-500' 
                          : !matchingTask 
                            ? 'bg-indigo-500/40' 
                            : (matchingTask.riskScore || 0) > 60 
                              ? 'bg-red-500' 
                              : (matchingTask.riskScore || 0) > 30 
                                ? 'bg-orange-500' 
                                : 'bg-emerald-500';

                        const isDragged = draggedIdx === i;
                        const isDragOver = dragOverIdx === i;

                        return (
                          <div key={i} className="space-y-4">
                            <div 
                              className="relative"
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, i)}
                              onDragOver={(e) => handleDragOver(e, i)}
                              onDrop={(e) => handleDrop(e, i)}
                              onDragEnd={handleDragEnd}
                            >
                              {/* Timeline node */}
                              <div className={`absolute -left-[33px] top-6 w-4 h-4 rounded-full border-4 bg-[#0d1117] transition-all duration-300 ${
                                isCompleted 
                                  ? 'border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                                  : isActive 
                                    ? 'border-indigo-500 animate-pulse' 
                                    : 'border-slate-800'
                              }`} />

                              <div 
                                className={`flex flex-col sm:flex-row gap-3 p-4 rounded-2xl border items-start sm:items-center relative overflow-hidden transition-all group/card ${
                                  isDragged ? 'opacity-30' : ''
                                } ${
                                  isDragOver && !isDragged
                                    ? 'border-dashed border-indigo-500 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.2)] scale-[1.01]'
                                    : isCompleted 
                                      ? 'bg-emerald-500/5 border-emerald-500/20 opacity-75' 
                                      : isActive
                                        ? 'bg-indigo-500/5 border-indigo-500/30 ring-1 ring-indigo-500/10'
                                        : isPast 
                                          ? 'bg-[#161b22] border-[#21262d] opacity-50' 
                                          : 'bg-[#161b22] border-[#21262d] hover:border-slate-700'
                                }`}
                              >
                                {/* Risk bar or active progress bar */}
                                <div className={`absolute top-0 left-0 w-full h-1 ${riskColor} ${isCompleted ? 'opacity-80' : 'opacity-40'}`}></div>
                                {isActive && !isCompleted && (
                                  <div className="absolute top-0 left-0 h-1 bg-cyan-400" style={{ width: `${progress}%` }}></div>
                                )}

                                {/* Drag Grip Handle */}
                                <div className="text-slate-600 group-hover/card:text-slate-400 p-1 shrink-0 transition-colors cursor-grab active:cursor-grabbing hidden sm:block">
                                  <GripVertical className="w-4 h-4" />
                                </div>

                                {/* Time block */}
                                <div className="text-xs font-mono font-bold text-slate-400 text-left shrink-0 sm:border-r sm:border-[#21262d] sm:pr-4 uppercase">
                                  <span className={isActive ? 'text-indigo-400 font-extrabold' : ''}>{formatTime(session.startTime)}</span>
                                  <span className="mx-2 sm:hidden text-slate-600">—</span>
                                  <span className="hidden sm:block text-slate-500 text-[10px]">{formatTime(session.endTime)}</span>
                                  <span className="sm:hidden text-slate-500">{formatTime(session.endTime)}</span>
                                </div>

                                {/* Task information */}
                                <div className="flex-grow min-w-0">
                                  <h4 className={`font-medium text-sm truncate ${isCompleted ? 'text-slate-400 line-through font-normal' : 'text-[#f0f6fc]'}`}>
                                    {session.taskTitle}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-1">
                                    {isCompleted ? (
                                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold uppercase tracking-widest">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                        Completed
                                      </span>
                                    ) : isActive ? (
                                      <span className="text-[10px] text-indigo-400 flex items-center gap-1.5 font-bold uppercase tracking-widest">
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                        </span>
                                        Active Session
                                      </span>
                                    ) : !matchingTask ? (
                                      <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-widest">
                                        Discipline Routine
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                                        Scheduled Quests
                                      </span>
                                    )}

                                    {matchingTask && !isCompleted && (
                                      <>
                                        <span className="text-slate-700 text-xs">•</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                                          matchingTask.priority === 'high' ? 'text-red-400' : 'text-slate-400'
                                        }`}>
                                          {matchingTask.priority} priority
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(i, session);
                                  }}
                                  className="opacity-0 group-hover/card:opacity-100 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-[#1f242c] border border-transparent hover:border-[#30363d] transition-all ml-2 shrink-0 cursor-pointer hidden sm:block"
                                  title="Edit Session"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>

                                {/* Start Button */}
                                {!isCompleted && !session.started && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartSession(i);
                                    }}
                                    className="text-indigo-400 hover:text-indigo-300 p-2 rounded-xl hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-all ml-2 shrink-0 cursor-pointer"
                                    title="Start Session"
                                  >
                                    <PlayCircle className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Completion indicator / Mark as completed button */}
                                {!isCompleted ? (
                                  canMarkCompleted ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkCompleted(i);
                                      }}
                                      className="text-emerald-500 hover:text-emerald-400 p-2 rounded-xl hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all ml-2 shrink-0 cursor-pointer"
                                      title="Mark as Completed"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                  ) : null
                                ) : (
                                  <div className="text-emerald-400 shrink-0 self-center ml-2 p-2" title="Completed">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(i, session);
                                  }}
                                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-[#1f242c] border border-[#21262d] transition-all mt-3 w-full text-xs font-bold uppercase tracking-wider sm:hidden flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" /> Edit Session
                                </button>
                              </div>
                            </div>

                            {/* Insert Divider */}
                            {i < visibleSessions.length - 1 && (
                              <div className="relative group/divider h-6 -my-3 flex items-center justify-center">
                                <div className="absolute inset-x-0 h-[1px] bg-slate-800 group-hover/divider:bg-indigo-500/40 transition-all" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const prevEnd = isoToTimeStr(session.endTime);
                                    const nextStart = isoToTimeStr(visibleSessions[i+1].startTime);
                                    handleStartAdd(prevEnd, nextStart);
                                  }}
                                  className="opacity-0 group-hover/divider:opacity-100 bg-[#0d1117] border border-[#30363d] hover:border-indigo-500 text-slate-400 hover:text-white rounded-full px-3 py-1 text-[10px] font-bold flex items-center gap-1 shadow-lg transition-all z-10 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3 text-indigo-400" />
                                  Insert Session Here
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Edit / Add Session Dialog Modal */}
      {editingIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                {editingIndex === -1 ? "✨ Add New Session" : "✏️ Edit Daily Session"}
              </h3>
              <button 
                onClick={() => setEditingIndex(null)}
                className="text-slate-400 hover:text-white rounded-md p-1 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                  Session Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Morning Cardio, Deep Work, Reading"
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#21262d]">
              {editingIndex !== -1 ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteSlot(editingIndex);
                    setEditingIndex(null);
                  }}
                  className="text-xs font-bold text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingIndex(null)}
                  className="text-slate-400 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveSlot}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-4 py-2 transition-colors cursor-pointer"
                >
                  Save Session
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
