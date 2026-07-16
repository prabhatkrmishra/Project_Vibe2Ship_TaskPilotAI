import {useState, useEffect, useRef} from 'react';
import {motion} from 'motion/react';
import {useAuth} from '../lib/AuthContext';
import {Task, Goal} from '../types';
import {Button} from '../components/ui/button';
import {
    Calendar as CalendarIcon,
    FileText,
    Presentation,
    Table,
    Cloud,
    CheckCircle,
    ArrowRight,
    Lock
} from 'lucide-react';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../components/ui/dialog';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '../components/ui/select';
import {Label} from '../components/ui/label';
import {toast} from 'sonner';
import PageHeader from '../components/PageHeader';
import {showSuccess, showError} from '../lib/toastTheme';
import {BackupErrorBanner} from '../components/BackupErrorBanner';
import {TamperedBackupError} from '../lib/google-workspace';
import {GoogleWorkspaceAuthCard, GoogleAuthStatus} from '../components/GoogleWorkspaceAuthCard';
import {tasksApi} from '../api/tasks';
import {goalsApi} from '../api/goals';
import {plansApi} from '../api/plans';
import {formatDate} from '@/lib/time.ts';

export function Workspace() {
    const {user, getAccessToken, requestWorkspaceAccess, disconnectWorkspaceAccess} = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(true);

    const [isSlidesDialogOpen, setIsSlidesDialogOpen] = useState(false);
    const [slidesType, setSlidesType] = useState('project-dashboard');
    const [backupError, setBackupError] = useState<string | null>(null);

    // ─── Google Workspace authorization status ────────────────────────────
    // Logging into TaskPilot (email/password, guest, or even Google login)
    // does NOT by itself guarantee a live, valid Google OAuth grant for the
    // Workspace scopes (Calendar/Drive/Docs/Sheets/Slides/Tasks) — the access
    // token can be absent, expired, or revoked independently of the DB
    // session. We verify the cached token against Google's own tokeninfo
    // endpoint so the card (and the gated actions below it) reflect reality,
    // not just "a token exists in localStorage".
    const [googleAuthStatus, setGoogleAuthStatus] = useState<GoogleAuthStatus>('checking');
    const [googleEmail, setGoogleEmail] = useState<string | null>(null);
    const [connectingGoogle, setConnectingGoogle] = useState(false);

    const verifyInFlightRef = useRef(false);
    const verifyAbortRef = useRef<AbortController | null>(null);

    const verifyGoogleAuth = async () => {
        if (verifyInFlightRef.current) return;
        verifyInFlightRef.current = true;

        const token = getAccessToken();
        if (!token) {
            setGoogleAuthStatus('disconnected');
            setGoogleEmail(null);
            verifyInFlightRef.current = false;
            return;
        }
        try {
            verifyAbortRef.current?.abort();
            const ac = new AbortController();
            verifyAbortRef.current = ac;
            const timer = setTimeout(() => ac.abort(), 5000);

            const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`, {signal: ac.signal});
            clearTimeout(timer);
            if (!res.ok) throw new Error('Token invalid or expired');
            const info = await res.json();
            setGoogleEmail(info.email || null);
            setGoogleAuthStatus('connected');
        } catch (e: any) {
            if (e?.name === 'AbortError') {
                setGoogleAuthStatus('disconnected');
                setGoogleEmail(null);
                return;
            }
            disconnectWorkspaceAccess();
            setGoogleAuthStatus('disconnected');
            setGoogleEmail(null);
        } finally {
            verifyInFlightRef.current = false;
        }
    };

    useEffect(() => {
        verifyGoogleAuth();

        const onStorage = (e: StorageEvent) => {
            if (e.key === 'workspace_access_token') verifyGoogleAuth();
        };
        window.addEventListener('storage', onStorage);

        return () => {
            verifyAbortRef.current?.abort();
            window.removeEventListener('storage', onStorage);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleConnectGoogle = async () => {
        setConnectingGoogle(true);
        try {
            const token = await requestWorkspaceAccess();
            if (token) {
                await verifyGoogleAuth();
            }
        } finally {
            setConnectingGoogle(false);
        }
    };

    const handleDisconnectGoogle = () => {
        disconnectWorkspaceAccess();
        setGoogleAuthStatus('disconnected');
        setGoogleEmail(null);
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            try {
                const [tasksData, goalsData] = await Promise.all([
                    tasksApi.list() as Promise<any[]>,
                    goalsApi.list() as Promise<Goal[]>
                ]);

                const allTasksData = tasksData as Task[];
                setTasks(allTasksData.filter(t => t.status === 'pending' || t.status === 'in_progress' || t.status === 'todo'));
                setCompletedTasks(allTasksData.filter(t => t.status === 'completed'));

                setGoals(goalsData);
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
            const {fetchCalendarEvents, createCalendarEvent} = await import('../lib/workspace');

            const now = new Date();
            const rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const rangeEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            const events = await fetchCalendarEvents(token, rangeStart, rangeEnd);

            let pushedCount = 0;
            for (const task of tasks) {
                if (task.status === 'pending' || task.status === 'in_progress' || task.status === 'todo') {
                    const exists = events.items?.find((e: any) => e.summary === task.title);
                    if (!exists) {
                        const taskDate = task.deadline ? new Date(task.deadline) : new Date();
                        const taskStart = taskDate.toISOString();
                        const taskEnd = new Date(taskDate.getTime() + 60 * 60 * 1000).toISOString();
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

            const selectedModel = localStorage.getItem('default_gemini_model') || 'gemini-3.1-flash-lite';
            await plansApi.runPipeline({
                eventName: 'Calendar Synced',
                eventDetail: `User synced their calendar. Found ${events.items?.length || 0} events today. Pushed ${pushedCount} tasks to calendar.`,
                tasks: tasks,
                calendarEvents: events.items || [],
                model: selectedModel
            });

            toast.dismiss();
            showSuccess("Calendar Synced", `Found ${events.items?.length || 0} events. ${pushedCount > 0 ? pushedCount + ' tasks pushed to calendar.' : 'All tasks already on calendar.'}`);
        } catch (e: any) {
            toast.dismiss();
            showError("Calendar Sync Failed", e.message || "Failed to sync calendar.");
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
            const {generateGoogleDocReport} = await import('../lib/workspace');
            const reportData = {
                title: `Daily Report - ${formatDate(new Date().toISOString())}`,
                tasks,
                completedTasks,
                goals
            };
            await generateGoogleDocReport(token, reportData);
            toast.dismiss();
            showSuccess("Report Generated", "Daily report saved to Google Drive!");
        } catch (e) {
            toast.dismiss();
            showError("Report Failed", "Failed to generate report.");
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
            const {createGoogleSheet} = await import('../lib/workspace');
            const data = [
                ["Task Title", "Priority", "Status", "Estimated Hours", "Risk Score"],
                ...tasks.map(t => [t.title, t.priority, t.status, t.estimatedHours, t.riskScore || 0]),
                ...completedTasks.map(t => [t.title, t.priority, t.status, t.estimatedHours, t.riskScore || 0])
            ];
            await createGoogleSheet(token, `TaskPilot AI Analytics - ${formatDate(new Date().toISOString())}`, data);
            toast.dismiss();
            showSuccess("Sheet Created", "Spreadsheet created in Google Drive!");
        } catch (e) {
            toast.dismiss();
            showError("Sheet Failed", "Failed to create spreadsheet.");
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
            const {generatePresentation} = await import('../lib/workspace');
            const reportData = {
                type: slidesType,
                tasks,
                completedTasks,
                goals
            };
            await generatePresentation(token, reportData);
            toast.dismiss();
            showSuccess("Slides Created", "Presentation saved to Google Drive!");
        } catch (e: any) {
            toast.dismiss();
            showError("Slides Failed", e.message || "Failed to create presentation.");
        }
    };


    const handleSyncTasks = async () => {
        let token = getAccessToken();
        if (!token) {
            token = await requestWorkspaceAccess();
        }
        if (!token) return;
        try {
            toast.loading("Syncing to Google Tasks...");
            const {exportToTasks} = await import('../lib/google-workspace');
            await exportToTasks([...tasks, ...completedTasks]);
            toast.dismiss();
            showSuccess("Tasks Synced", "All tasks exported to Google Tasks!");
        } catch (e: any) {
            toast.dismiss();
            showError("Tasks Sync Failed", e.message || "Failed to sync tasks.");
        }
    };


    const handleImportTasks = async () => {
        let token = getAccessToken();
        if (!token) {
            token = await requestWorkspaceAccess();
        }
        if (!token) return;
        try {
            toast.loading("Importing from Google Tasks...");
            const {importFromTasks} = await import('../lib/google-workspace');
            const importedTasks = await importFromTasks();

            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("taskpilot_jwt")}`
            };

            for (const t of importedTasks) {
                await tasksApi.create(t);
            }

            toast.dismiss();
            showSuccess("Import Complete", `Imported ${importedTasks.length} tasks from Google Tasks.`);
            // Refresh to show tasks
            window.location.reload();
        } catch (e: any) {
            toast.dismiss();
            showError("Import Failed", e.message || "Failed to import tasks.");
        }
    };

    const handleBackupDB = async () => {
        let token = getAccessToken();
        if (!token) {
            token = await requestWorkspaceAccess();
        }
        if (!token) return;
        setBackupError(null);
        try {
            toast.loading("Backing up your data to Drive...");
            const {exportFullBackupToDrive} = await import('../lib/google-workspace');
            const idToken = await user?.getIdToken();
            if (!idToken) throw new Error("Not signed in.");
            const result = await exportFullBackupToDrive(token, idToken);
            toast.dismiss();
            if (result.skipped) {
                showSuccess("Backup Saved", "Already up to date — no changes since your last backup.");
            } else {
                showSuccess("Backup Saved", "Full backup saved to Google Drive!");
            }
        } catch (e: any) {
            toast.dismiss();
            showError("Backup Failed", e.message || "Failed to backup data.");
        }
    };

    const handlePickFile = async () => {
        let token = getAccessToken();
        if (!token) {
            token = await requestWorkspaceAccess();
        }
        if (!token) return;

        if (!(window as any).gapi) {
            showError("API Not Ready", "Google API not loaded yet. Try again.");
            return;
        }

        setBackupError(null);
        toast.loading("Opening Picker...");
        (window as any).gapi.load('picker', {
            callback: () => {
                toast.dismiss();
                const pickerOrigin = window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
                    ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
                    : window.location.origin;

                const picker = new (window as any).google.picker.PickerBuilder()
                    .addView((window as any).google.picker.ViewId.DOCS)
                    .setOAuthToken(token)
                    .setCallback(async (data: any) => {
                        if (data.action === (window as any).google.picker.Action.PICKED) {
                            const file = data.docs[0];
                            try {
                                toast.loading("Verifying backup signature...");
                                const {
                                    downloadAndVerifyBackup,
                                    restoreBackupPayload
                                } = await import('../lib/google-workspace');
                                const idToken = await user?.getIdToken();
                                if (!idToken) throw new Error("Not signed in.");

                                const payload = await downloadAndVerifyBackup(token as string, idToken, file.id);

                                toast.dismiss();
                                toast.loading("Restoring backup...");
                                const {tasksAdded, goalsAdded} = await restoreBackupPayload(idToken, payload);

                                toast.dismiss();
                                showSuccess("Backup Restored", `Restored ${tasksAdded} task(s) and ${goalsAdded} goal(s) from ${file.name}.`);
                                setTimeout(() => window.location.reload(), 1500);
                            } catch (e: any) {
                                toast.dismiss();
                                if (e instanceof TamperedBackupError) {
                                    setBackupError(e.message);
                                } else {
                                    showError("Restore Failed", "Failed to restore backup: " + e.message);
                                }
                            }
                        }
                    })
                    .setOrigin(pickerOrigin)
                    .build();
                picker.setVisible(true);
            }
        });
    };

    return (
        <div className="flex-1 overflow-y-auto bg-[#030712] p-6 lg:p-10 text-slate-200 custom-scrollbar relative">
            {/* Dynamic Background Blur */}
            <div
                className="absolute top-0 inset-x-0 h-[300px] bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none z-0"></div>

            <div className="max-w-6xl mx-auto space-y-8 relative z-10">

                {/* Header Section */}
                <PageHeader
                    icon={Cloud}
                    badge="Cloud Operations"
                    color="amber"
                    title="Workspace"
                    titleAccent="Actions"
                    description="Connect your TaskPilot data seamlessly with Google Workspace. Push schedules, export analytics, and generate beautiful presentations from your active tasks and goals."
                />

                {/* Google Workspace Authorization */}
                <GoogleWorkspaceAuthCard
                    status={googleAuthStatus}
                    googleEmail={googleEmail}
                    onConnect={handleConnectGoogle}
                    onDisconnect={handleDisconnectGoogle}
                    connecting={connectingGoogle}
                />

                {backupError && (
                    <BackupErrorBanner message={backupError} onDismiss={() => setBackupError(null)}/>
                )}

                {googleAuthStatus !== 'connected' ? (
                    <div
                        className="bg-[#0d1117] border border-dashed border-[#21262d] rounded-3xl p-10 flex flex-col items-center text-center gap-3">
                        <div
                            className="w-12 h-12 bg-[#161b22] border border-[#21262d] rounded-2xl flex items-center justify-center">
                            <Lock className="h-5 w-5 text-slate-500"/>
                        </div>
                        <h3 className="text-lg font-bold text-[#f0f6fc]">Workspace actions are locked</h3>
                        <p className="text-sm text-slate-400 max-w-md">
                            {googleAuthStatus === 'checking'
                                ? 'Checking your Google authorization before showing sync, export, and backup actions.'
                                : 'Connect your Google account above to unlock Calendar sync, Google Tasks, report/analytics generation, and Drive backups.'}
                        </p>
                    </div>
                ) : (
                    <>

                        {/* Sync */}
                        <section className="space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 px-1">Sync</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.1}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <CalendarIcon className="h-6 w-6 text-indigo-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Sync Google
                                                Calendar</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Push your pending tasks and intelligent AI schedules directly into your
                                                Google Calendar. Never miss a deadline with automated time-blocking.
                                            </p>
                                        </div>
                                        <Button onClick={handleSyncCalendar}
                                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 group-hover:shadow-lg group-hover:shadow-indigo-600/20 transition-all font-semibold">
                                            Start Sync <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.15}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <CheckCircle className="h-6 w-6 text-indigo-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Export to Google
                                                Tasks</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Export all your active tasks into your default Google Tasks list to keep
                                                everything tracked in one place.
                                            </p>
                                        </div>
                                        <Button onClick={handleSyncTasks}
                                                className="w-full bg-[#161b22] border border-[#21262d] hover:border-indigo-500/30 hover:bg-indigo-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                                            Sync Tasks <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.2}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <CheckCircle className="h-6 w-6 text-orange-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Import from Google
                                                Tasks</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Import tasks from your Google Tasks list into TaskPilot for unified
                                                management.
                                            </p>
                                        </div>
                                        <Button onClick={handleImportTasks}
                                                className="w-full bg-[#161b22] border border-[#21262d] hover:border-orange-500/30 hover:bg-orange-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                                            Import Tasks <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                            </div>
                        </section>

                        {/* Generate */}
                        <section className="space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 px-1">Generate</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.1}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <FileText className="h-6 w-6 text-indigo-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Export Daily
                                                Report</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Generate a beautifully formatted Google Doc containing your daily
                                                progress, active tasks, and goal summaries. Perfect for EOD reporting.
                                            </p>
                                        </div>
                                        <Button onClick={handleExportDocs}
                                                className="w-full bg-[#161b22] border border-[#21262d] hover:border-indigo-500/30 hover:bg-indigo-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                                            Generate Report (Docs) <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.15}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <Table className="h-6 w-6 text-emerald-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Export Analytics</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Dump your task metrics, effort estimations, and AI risk scores into
                                                Google Sheets for deep data analysis and pivot tables.
                                            </p>
                                        </div>
                                        <Button onClick={handleExportSheets}
                                                className="w-full bg-[#161b22] border border-[#21262d] hover:border-emerald-500/30 hover:bg-emerald-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                                            Generate Spreadsheet <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.2}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <Presentation className="h-6 w-6 text-amber-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Create
                                                Presentation</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Let AI automatically draft a Google Slides presentation from your
                                                workspace data. Ideal for standups, sprint planning, or team reviews.
                                            </p>
                                        </div>
                                        <Button onClick={() => setIsSlidesDialogOpen(true)}
                                                className="w-full bg-[#161b22] border border-[#21262d] hover:border-amber-500/30 hover:bg-amber-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                                            Configure Slides <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                            </div>
                        </section>

                        {/* Backup & Restore */}
                        <section className="space-y-4 border-t border-[#21262d] pt-8">
                            <div className="px-1">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Backup &amp; Restore</h2>
                                <p className="text-xs text-slate-500 mt-1">Signed, compressed backups of your data
                                    (never your login credentials).</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.1}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-teal-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <FileText className="h-6 w-6 text-teal-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Backup Data to
                                                Drive</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Export all your data (tasks, goals, plans, chats, focus sessions &
                                                profile — never your password or tokens) into a signed, compressed
                                                backup on Google Drive.
                                            </p>
                                        </div>
                                        <Button onClick={handleBackupDB}
                                                className="w-full bg-[#161b22] border border-[#21262d] hover:border-teal-500/30 hover:bg-teal-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                                            Backup to Drive <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                                <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                                            transition={{duration: 0.4, delay: 0.15}} className="group">
                                    <div
                                        className="h-full bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 transition-all duration-300 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 flex flex-col justify-between">
                                        <div>
                                            <div
                                                className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6">
                                                <FileText className="h-6 w-6 text-purple-400"/>
                                            </div>
                                            <h3 className="text-xl font-bold text-[#f0f6fc] mb-2">Restore Data from
                                                Drive</h3>
                                            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                                Select a backup archive from Google Drive. Its signature is verified
                                                before anything is restored — tampered files are rejected.
                                            </p>
                                        </div>
                                        <Button onClick={handlePickFile}
                                                className="w-full bg-[#161b22] border border-[#21262d] hover:border-purple-500/30 hover:bg-purple-500/10 text-[#f0f6fc] rounded-xl h-11 transition-all font-semibold">
                                            Open Picker <ArrowRight className="ml-2 w-4 h-4"/>
                                        </Button>
                                    </div>
                                </motion.div>

                            </div>
                        </section>

                    </>
                )}

                <Dialog open={isSlidesDialogOpen} onOpenChange={setIsSlidesDialogOpen}>
                    <DialogContent
                        className="sm:max-w-[425px] bg-[#0d1117] text-[#c9d1d9] border-[#30363d] rounded-3xl shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-[#f0f6fc] text-xl">Configure Presentation</DialogTitle>
                            <DialogDescription className="text-[#8b949e]">
                                Select the format and template style for your Google Slides presentation.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-6">
                            <div className="space-y-3">
                                <Label htmlFor="slides-type" className="text-slate-300 font-medium">Presentation
                                    Type</Label>
                                <Select value={slidesType} onValueChange={setSlidesType}>
                                    <SelectTrigger id="slides-type"
                                                   className="bg-[#161b22] border-[#30363d] text-[#c9d1d9] rounded-xl h-11">
                                        <SelectValue placeholder="Select type"/>
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#161b22] border-[#30363d] text-[#c9d1d9] rounded-xl">
                                        <SelectItem value="project-dashboard"
                                                    className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Project
                                            Status Dashboard</SelectItem>
                                        <SelectItem value="standup"
                                                    className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Daily
                                            Standup Agenda</SelectItem>
                                        <SelectItem value="sprint-planning"
                                                    className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Sprint
                                            Planning</SelectItem>
                                        <SelectItem value="progress-report"
                                                    className="focus:bg-[#1f242c] focus:text-[#f0f6fc] cursor-pointer">Progress
                                            Report</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-2">
                            <Button variant="ghost" onClick={() => setIsSlidesDialogOpen(false)}
                                    className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22] rounded-xl">
                                Cancel
                            </Button>
                            <Button onClick={handleGenerateSlides}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6">
                                Generate Now
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
