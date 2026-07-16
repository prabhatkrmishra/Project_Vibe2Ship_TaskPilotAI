import {useState, useEffect} from 'react';
import {BrowserRouter, Routes, Route, Navigate, Link, useLocation} from 'react-router-dom';
import {AuthProvider, useAuth} from './lib/AuthContext';
import {AIJobProvider} from './lib/AIJobContext';
import {HabitReminderProvider} from './lib/HabitReminderContext';
import {HabitReminderBanner} from './components/HabitReminderBanner';
import {ErrorBoundary} from './components/ErrorBoundary';
import {Button} from './components/ui/button';
import FlightLine from './components/FlightLine';
import UpgradeModal from './components/UpgradeModal';
import {
    LayoutDashboard,
    CheckSquare,
    MessageSquare,
    LogOut,
    Loader2,
    Menu,
    X,
    Target,
    Cloud,
    CheckCircle2,
    Calendar,
    Headphones,
    Settings,
    Home,
    ListTodo,
    LayoutList,
    MoreHorizontal
} from 'lucide-react';
import {motion, AnimatePresence} from 'motion/react';
import {Dashboard} from './pages/Dashboard';
import {Timetable} from './pages/Timetable';
import {Tasks} from './pages/Tasks';
import {Chat} from './pages/Chat';
import {Goals} from './pages/Goals';
import {Completions} from './pages/Completions';
import {Workspace} from './pages/Workspace';
import {PrivacyPolicy} from './pages/PrivacyPolicy';
import {TermsOfService} from './pages/TermsOfService';
import {Home as HomePage} from './pages/Home';
import {Profile} from './pages/Profile';
import Focus from './pages/Focus';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import {NotFound} from './pages/NotFound';
import {PaymentSuccess} from './pages/PaymentSuccess';
import {Admin} from './pages/Admin';
import {Toaster} from './components/ui/sonner';
import {Analytics} from '@vercel/analytics/react';
import {SpeedInsights} from '@vercel/speed-insights/react';

function ProtectedRoute({children}: { children: React.ReactNode }) {
    const {user, loading} = useAuth();
    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2
        className="h-8 w-8 animate-spin"/></div>;
    if (!user) return <Navigate to="/login" replace/>;
    return <>{children}</>;
}

// Navigation items with plain-language labels
const NAV_ITEMS = [
    {to: '/dashboard', icon: LayoutDashboard, label: 'Today'},
    {to: '/tasks', icon: CheckSquare, label: 'Tasks'},
    {to: '/timetable', icon: Calendar, label: 'Plan'},
    {to: '/focus', icon: Headphones, label: 'Focus'},
];

const SECONDARY_NAV = [
    {to: '/goals', icon: Target, label: 'Goals'},
    {to: '/completions', icon: CheckCircle2, label: 'History'},
    {to: '/workspace', icon: Cloud, label: 'Workspace'},
    {to: '/chat', icon: MessageSquare, label: 'Chat'},
];

function SidebarContent({user, location, logout, onClose}: {
    user: any,
    location: any,
    logout: () => void,
    onClose?: () => void
}) {
    return (
        <div className="flex flex-col h-full bg-[var(--graphite-950)]">
            <div className="p-6 flex items-center justify-between">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 font-heading">
                    <div className="w-8 h-8 bg-[var(--violet)] rounded-lg flex items-center justify-center">
                        <LayoutDashboard className="h-4 w-4 text-white"/>
                    </div>
                    TaskPilot <span className="text-[var(--violet)]">AI</span>
                    <span className="text-[10px] text-slate-500 font-mono font-normal ml-1">v2.0</span>
                </h1>
                {onClose && (
                    <Button variant="ghost" size="icon" onClick={onClose}
                            className="lg:hidden text-slate-400 hover:text-white cursor-pointer">
                        <X className="h-4 w-4"/>
                    </Button>
                )}
            </div>
            <nav className="flex-1 px-4 space-y-1">
                {NAV_ITEMS.map(item => (
                    <Link key={item.to} to={item.to} onClick={onClose}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-slate-300 ${
                              location.pathname === item.to
                                  ? 'bg-[var(--violet)]/10 border-l-2 border-[var(--violet)] pl-[10px] text-white'
                                  : 'border-l-2 border-transparent pl-[10px]'
                          }`}>
                        <item.icon className={`h-4 w-4 ${
                            location.pathname === item.to ? 'text-[var(--violet)]' : 'text-slate-500'
                        }`}/>
                        {item.label}
                    </Link>
                ))}

                <div className="pt-2 pb-1 px-3">
                    <span
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-600 font-mono">More</span>
                </div>

                {SECONDARY_NAV.map(item => (
                    <Link key={item.to} to={item.to} onClick={onClose}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-slate-300 ${
                              location.pathname === item.to
                                  ? 'bg-[var(--violet)]/10 border-l-2 border-[var(--violet)] pl-[10px] text-white'
                                  : 'border-l-2 border-transparent pl-[10px]'
                          }`}>
                        <item.icon className={`h-4 w-4 ${
                            location.pathname === item.to ? 'text-[var(--violet)]' : 'text-slate-500'
                        }`}/>
                        {item.label}
                    </Link>
                ))}

                {user?.role === 'admin' && (
                    <Link to="/admin" onClick={onClose}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-slate-300 ${
                              location.pathname === '/admin'
                                  ? 'bg-[var(--violet)]/10 border-l-2 border-[var(--violet)] pl-[10px] text-white'
                                  : 'border-l-2 border-transparent pl-[10px]'
                          }`}>
                        <Settings className={`h-4 w-4 ${
                            location.pathname === '/admin' ? 'text-[var(--violet)]' : 'text-slate-500'
                        }`}/>
                        Admin
                    </Link>
                )}
            </nav>
            <div className="p-4 border-t border-[var(--panel-line)]">
                <Link
                    to="/profile"
                    onClick={onClose}
                    className={`flex items-center gap-4 w-full p-4 mb-4 rounded-2xl transition-all border duration-200 ${
                        location.pathname === '/profile'
                            ? 'bg-[var(--violet)]/10 border-[var(--violet)]/40 shadow-lg shadow-[var(--violet)]/10 text-white'
                            : 'bg-[var(--graphite-900)] border-[var(--panel-line)] hover:bg-[var(--panel-line)]/20 text-slate-300'
                    }`}
                >
                    {user?.picture ? (
                        <img
                            src={user?.picture}
                            alt="Profile"
                            className="w-12 h-12 rounded-xl ring-2 ring-[var(--violet)]/30 object-cover shrink-0 shadow-md"
                        />
                    ) : (
                        <div
                            className="w-12 h-12 rounded-xl bg-[var(--graphite-950)] flex items-center justify-center text-white font-bold ring-2 ring-[var(--violet)]/30 shrink-0 text-base shadow-md">
                            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                        </div>
                    )}
                    <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold text-white truncate leading-tight">
                            {user?.name || 'User'}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-1 font-mono">
                            {user?.email}
                        </p>
                        <div className="mt-2">
                            {(user?.tier === 'pro' || user?.tier === 'pro_plus') ? (
                                <span
                                    className="text-[10px] font-bold text-[var(--violet)] bg-[var(--violet)]/15 px-2 py-0.5 rounded-lg border border-[var(--violet)]/30">
                                    {user?.tier === 'pro_plus' ? 'Pro+' : 'Pro'}
                                </span>
                            ) : (
                                <span
                                    className="text-[10px] font-bold text-slate-400 bg-slate-500/15 px-2 py-0.5 rounded-lg border border-slate-500/30">
                                    Free
                                </span>
                            )}
                        </div>
                    </div>
                </Link>
                <div className="flex justify-center gap-3 text-[11px] text-slate-500 mb-4">
                    <Link to="/privacy" onClick={onClose} className="hover:text-[var(--violet)] transition-colors">Privacy
                        Policy</Link>
                    <span>•</span>
                    <Link to="/terms" onClick={onClose} className="hover:text-[var(--violet)] transition-colors">Terms
                        of
                        Service</Link>
                </div>
                <Button variant="outline"
                        className="w-full justify-start text-slate-400 border-[var(--panel-line)] bg-[var(--graphite-900)] hover:bg-[var(--graphite-950)] hover:text-white rounded-xl cursor-pointer"
                        onClick={() => {
                            logout();
                            if (onClose) onClose();
                        }}>
                    <LogOut className="h-4 w-4 mr-2"/> Logout
                </Button>
            </div>
        </div>
    );
}

// Mobile bottom tab bar
function BottomTabBar({location}: { location: any }) {
    const tabs = [
        {to: '/dashboard', icon: Home, label: 'Today'},
        {to: '/tasks', icon: ListTodo, label: 'Tasks'},
        {to: '/timetable', icon: Calendar, label: 'Plan'},
        {to: '/focus', icon: Headphones, label: 'Focus'},
        {to: '/more', icon: MoreHorizontal, label: 'More'},
    ];

    return (
        <nav aria-label="Mobile navigation"
             className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--graphite-950)] border-t border-[var(--panel-line)] px-2 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-around py-1.5">
                {tabs.map(tab => {
                    const isActive = tab.to === '/more'
                        ? !['/dashboard', '/tasks', '/timetable', '/focus'].includes(location.pathname)
                        : location.pathname === tab.to;
                    return (
                        <Link
                            key={tab.to}
                            to={tab.to === '/more' ? '/goals' : tab.to}
                            className="flex flex-col items-center gap-0.5 px-3 py-1 min-w-[48px]"
                        >
                            <tab.icon className={`h-5 w-5 ${
                                isActive ? 'text-[var(--violet)]' : 'text-slate-500'
                            }`}/>
                            <span className={`text-[10px] ${
                                isActive ? 'text-[var(--violet)] font-medium' : 'text-slate-500'
                            }`}>
                                {tab.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

function Layout({children}: { children: React.ReactNode }) {
    const {logout, user} = useAuth();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [flightLineSessions, setFlightLineSessions] = useState<any[]>([]);
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
    const [upgradeModalTier, setUpgradeModalTier] = useState<'pro' | 'pro_plus'>('pro_plus');

    // Listen for upgrade-required events dispatched by apiFetch
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.requiredTier) setUpgradeModalTier(ce.detail.requiredTier);
            setUpgradeModalOpen(true);
        };
        window.addEventListener('upgrade-required', handler);
        return () => window.removeEventListener('upgrade-required', handler);
    }, []);

    // Fetch today's plan for the persistent FlightLine
    useEffect(() => {
        if (!user) return;
        const fetchPlan = async () => {
            try {
                const d = new Date();
                const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const token = await (user as any).getIdToken?.() || '';
                const res = await fetch(`/api/plans/${today}`, {headers: {Authorization: `Bearer ${token}`}});
                if (res.ok) {
                    const data = await res.json();
                    setFlightLineSessions(data?.sessions || []);
                }
            } catch {
                // silently ignore — FlightLine simply won't render if no data
            }
        };
        fetchPlan();
    }, [user, location.pathname]);

    return (
        <div
            className="flex h-screen bg-[var(--graphite-950)] text-slate-200 font-sans overflow-hidden flex-col lg:flex-row">
            {/* Mobile Header */}
            <div
                className="lg:hidden flex items-center justify-between px-6 py-4 bg-[var(--graphite-950)] border-b border-[var(--panel-line)] shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[var(--violet)] rounded-lg flex items-center justify-center">
                        <LayoutDashboard className="h-4 w-4 text-white"/>
                    </div>
                    <span className="text-lg font-bold tracking-tight text-white font-heading">
                        TaskPilot <span className="text-[var(--violet)]">AI</span>
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        to="/profile"
                        className="flex items-center justify-center p-1 rounded-xl bg-[var(--graphite-900)] border border-[var(--panel-line)] hover:border-slate-700 transition-all shrink-0"
                    >
                        {user?.picture ? (
                            <img src={user?.picture} alt="Profile"
                                 className="w-8 h-8 rounded-lg ring-2 ring-[var(--violet)]/10 object-cover shrink-0"/>
                        ) : (
                            <div
                                className="w-8 h-8 rounded-lg bg-[var(--graphite-900)] flex items-center justify-center text-white font-semibold ring-2 ring-[var(--violet)]/10 shrink-0 text-xs">
                                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                            </div>
                        )}
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}
                            className="text-slate-400 hover:text-white cursor-pointer focus:outline-none">
                        <Menu className="h-5 w-5"/>
                    </Button>
                </div>
            </div>

            {/* Desktop Sidebar */}
            <aside
                role="navigation"
                aria-label="Main navigation"
                className="w-64 xl:w-72 2xl:w-80 border-r border-[var(--panel-line)] bg-[var(--graphite-950)] flex-col shrink-0 hidden lg:flex h-full transition-all duration-300">
                <SidebarContent user={user} location={location} logout={logout}/>
            </aside>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <>
                        <motion.div
                            initial={{opacity: 0}}
                            animate={{opacity: 0.5}}
                            exit={{opacity: 0}}
                            onClick={() => setIsSidebarOpen(false)}
                            className="fixed inset-0 bg-black z-40 lg:hidden"
                        />
                        <motion.aside
                            role="navigation"
                            aria-label="Mobile navigation"
                            initial={{x: '-100%'}}
                            animate={{x: 0}}
                            exit={{x: '-100%'}}
                            transition={{type: 'tween', duration: 0.25, ease: 'easeOut'}}
                            className="fixed inset-y-0 left-0 w-64 bg-[var(--graphite-950)] z-50 lg:hidden h-full flex flex-col border-r border-[var(--panel-line)]"
                        >
                            <SidebarContent user={user} location={location} logout={logout}
                                            onClose={() => setIsSidebarOpen(false)}/>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <main role="main" className="flex-1 h-full flex flex-col min-h-0 overflow-hidden relative">
                <div className="shrink-0 px-4 pt-3 hidden lg:block">
                    <FlightLine sessions={flightLineSessions}/>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Tab Bar */}
            <BottomTabBar location={location}/>
            <UpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)}
                          requiredTier={upgradeModalTier}/>
        </div>
    );
}

function Login() {
    const {loginWithGoogle, login, register, user, loading, verify2FA} = useAuth();
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [retypePassword, setRetypePassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [twoFARequired, setTwoFARequired] = useState(false);
    const [twoFATempToken, setTwoFATempToken] = useState('');
    const [twoFACode, setTwoFACode] = useState('');

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2
        className="h-8 w-8 animate-spin"/></div>;
    if (user) return <Navigate to="/dashboard" replace/>;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email || !password || (isRegister && (!name || !retypePassword))) {
            setError("Please fill in all required fields.");
            return;
        }

        if (isRegister && password !== retypePassword) {
            setError("Passwords do not match.");
            return;
        }

        try {
            setSubmitting(true);
            if (isRegister) {
                await register(email, password, name);
            } else {
                await login(email, password);
            }
        } catch (err: any) {
            if (err.message === '2FA_REQUIRED' && err.tempToken) {
                setTwoFARequired(true);
                setTwoFATempToken(err.tempToken);
                setError(null);
            } else {
                const errorMsg = err.message || "An error occurred.";
                setError(errorMsg);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleVerify2FA = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!twoFACode || twoFACode.length !== 6) {
            setError("Please enter a 6-digit code.");
            return;
        }
        try {
            setSubmitting(true);
            await verify2FA(twoFATempToken, twoFACode);
        } catch (err: any) {
            setError(err.message || "Invalid code.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-bg flex min-h-screen items-center justify-center text-slate-200 py-10 px-4">
            <div
                className="w-full max-w-md p-8 bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-3xl shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                    <div
                        className="mx-auto w-14 h-14 bg-[var(--violet)] rounded-2xl flex items-center justify-center shadow-[0_0_30px_oklch(0.78_0.14_70/0.3)] animate-in zoom-in duration-500">
                        <LayoutDashboard className="h-7 w-7 text-white"/>
                    </div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight leading-snug font-heading">
                        {isRegister ? "Create your account" : "Welcome back to TaskPilot AI"}
                    </h1>
                    <p className="text-slate-400 text-xs">
                        {isRegister ? "Join the autonomous productivity space" : "Sign in to resume control of your dashboard"}
                    </p>
                </div>

                {!isRegister && (
                    <div className="flex flex-wrap gap-1.5 justify-center py-1">
                        <span
                            className="px-2 py-0.5 rounded-full bg-[var(--graphite-950)] border border-[var(--panel-line)] text-[10px] text-[var(--violet)] font-medium font-mono">⚡ AI Tasks</span>
                        <span
                            className="px-2 py-0.5 rounded-full bg-[var(--graphite-950)] border border-[var(--panel-line)] text-[10px] text-[var(--horizon-blue)] font-medium font-mono">📅 Workspace Sync</span>
                        <span
                            className="px-2 py-0.5 rounded-full bg-[var(--graphite-950)] border border-[var(--panel-line)] text-[10px] text-[var(--status-on-track)] font-medium font-mono">🎯 Risk Scoring</span>
                    </div>
                )}

                {twoFARequired ? (
                    <form onSubmit={handleVerify2FA} className="space-y-4">
                        <div className="text-center space-y-2 pb-2">
                            <div
                                className="mx-auto w-10 h-10 bg-[var(--status-attention)]/20 rounded-xl flex items-center justify-center">
                                <svg className="h-5 w-5 text-[var(--status-attention)]" fill="none" viewBox="0 0 24 24"
                                     strokeWidth={2}
                                     stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                          d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>
                                </svg>
                            </div>
                            <p className="text-sm text-slate-300">Two-factor authentication required</p>
                            <p className="text-xs text-slate-500">Enter the 6-digit code from your authenticator app</p>
                        </div>

                        <div className="space-y-1 text-left">
                            <label
                                className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Verification
                                Code</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                autoFocus
                                value={twoFACode}
                                onChange={(e) => {
                                    setTwoFACode(e.target.value.replace(/\D/g, ''));
                                    setError(null);
                                }}
                                placeholder="000000"
                                className="w-full px-4 py-3 bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[var(--violet)] text-center text-lg font-mono tracking-[0.5em] transition-all"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={submitting || twoFACode.length !== 6}
                            className="w-full h-11 text-xs uppercase tracking-widest font-bold bg-[var(--violet)] text-white rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-[var(--violet)]/20"
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto"/> : "Verify & Sign In"}
                        </Button>

                        {error && (
                            <div
                                className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                                {error}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                setTwoFARequired(false);
                                setTwoFACode('');
                                setTwoFATempToken('');
                                setError(null);
                            }}
                            className="block w-full text-center text-[13px] text-[var(--violet)] hover:opacity-80 transition-colors hover:underline font-medium"
                        >
                            Back to login
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isRegister && (
                            <div className="space-y-1 text-left">
                                <label
                                    className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Full
                                    Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="John Doe"
                                    required
                                    className="w-full px-4 py-2 bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[var(--violet)] text-sm transition-all"
                                />
                            </div>
                        )}

                        <div className="space-y-1 text-left">
                            <label
                                className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Email
                                Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setError(null);
                                }}
                                placeholder="pilot@workspace.com"
                                required
                                className="w-full px-4 py-2 bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[var(--violet)] text-sm transition-all"
                            />
                        </div>

                        <div className="space-y-1 text-left">
                            <label
                                className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError(null);
                                }}
                                placeholder="••••••••"
                                required
                                className="w-full px-4 py-2 bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[var(--violet)] text-sm transition-all"
                            />
                        </div>

                        {!isRegister && (
                            <div className="text-right">
                                <Link to="/forgot-password"
                                      className="text-[11px] text-[var(--violet)] hover:opacity-80 transition-colors hover:underline">
                                    Forgot your password?
                                </Link>
                            </div>
                        )}

                        {isRegister && (
                            <div className="space-y-1 text-left">
                                <label
                                    className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Confirm
                                    Password</label>
                                <input
                                    type="password"
                                    value={retypePassword}
                                    onChange={(e) => {
                                        setRetypePassword(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-4 py-2 bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[var(--violet)] text-sm transition-all"
                                />
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={submitting}
                            className="w-full h-11 text-xs uppercase tracking-widest font-bold bg-[var(--violet)] text-white rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-[var(--violet)]/20"
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin mx-auto"/>
                            ) : (
                                isRegister ? "Create Account" : "Sign In with Email"
                            )}
                        </Button>

                        {error && (
                            <div
                                className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                                {error}
                            </div>
                        )}
                    </form>
                )}

                {!isRegister && !twoFARequired && (
                    <div className="space-y-4">
                        <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-[var(--panel-line)]"></div>
                            <span
                                className="flex-shrink mx-3 text-[10px] text-slate-500 font-mono uppercase tracking-widest">or</span>
                            <div className="flex-grow border-t border-[var(--panel-line)]"></div>
                        </div>

                        <Button
                            type="button"
                            onClick={loginWithGoogle}
                            className="w-full h-11 text-xs uppercase tracking-widest font-bold bg-white text-slate-900 rounded-xl hover:bg-slate-100 transition-colors shadow-xl card-lift flex items-center justify-center gap-2"
                        >
                            Continue with Google
                        </Button>
                    </div>
                )}

                {!twoFARequired && (
                    <div className="text-center pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsRegister(!isRegister);
                                setEmail('');
                                setPassword('');
                                setName('');
                                setRetypePassword('');
                                setError(null);
                            }}
                            className="text-[13px] md:text-sm text-[var(--violet)] hover:opacity-80 transition-colors hover:underline cursor-pointer font-medium focus:outline-none"
                        >
                            {isRegister
                                ? "Already have an account? Sign In"
                                : "Don't have an account? Register as new user"}
                        </button>
                    </div>
                )}

                <div
                    className="flex justify-center gap-4 text-xs text-slate-500 pt-4 border-t border-[var(--panel-line)]">
                    <Link to="/privacy" className="hover:text-[var(--violet)] transition-colors">Privacy Policy</Link>
                    <span>•</span>
                    <Link to="/terms" className="hover:text-[var(--violet)] transition-colors">Terms of Service</Link>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <AIJobProvider>
                    <BrowserRouter>
                        <HabitReminderProvider>
                            <HabitReminderBanner/>
                            <Routes>
                                <Route path="/login" element={<Login/>}/>
                                <Route path="/forgot-password" element={<ForgotPassword/>}/>
                                <Route path="/reset-password" element={<ResetPassword/>}/>
                                <Route path="/privacy" element={<PrivacyPolicy/>}/>
                                <Route path="/terms" element={<TermsOfService/>}/>
                                <Route path="/" element={<HomePage/>}/>
                                <Route path="/dashboard" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Dashboard/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/profile" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Profile/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/tasks" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Tasks/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/goals" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Goals/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/completions" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Completions/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/focus" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Focus/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/workspace" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Workspace/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/chat" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Chat/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/timetable" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Timetable/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/admin" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Admin/>
                                        </Layout>
                                    </ProtectedRoute>
                                }/>
                                <Route path="/payment-success" element={
                                    <ProtectedRoute>
                                        <PaymentSuccess/>
                                    </ProtectedRoute>
                                }/>
                                <Route path="*" element={<NotFound/>}/>
                            </Routes>
                        </HabitReminderProvider>
                        <Toaster/>
                        <Analytics/>
                        <SpeedInsights/>
                    </BrowserRouter>
                </AIJobProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}
