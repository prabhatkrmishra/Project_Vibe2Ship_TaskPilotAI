import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/ui/button';
import { LayoutDashboard, CheckSquare, MessageSquare, LogOut, Loader2, Menu, X, Target, Cloud, CheckCircle2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './pages/Dashboard';
import { Timetable } from './pages/Timetable';
import { Tasks } from './pages/Tasks';
import { Chat } from './pages/Chat';
import { Goals } from './pages/Goals';
import { Completions } from './pages/Completions';
import { Workspace } from './pages/Workspace';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { NotFound } from './pages/NotFound';
import { Toaster } from './components/ui/sonner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function SidebarContent({ user, location, logout, onClose }: { user: any, location: any, logout: () => void, onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="p-6 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-[#f0f6fc] flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <LayoutDashboard className="h-4 w-4 text-white" />
          </div>
          TaskPilot <span className="text-indigo-400">AI</span>
          <span className="text-[10px] text-slate-500 font-mono font-normal ml-1">v1.0</span>
        </h1>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden text-slate-400 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <nav className="flex-1 px-4 space-y-2">
        <Link to="/dashboard" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/dashboard' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <LayoutDashboard className="h-4 w-4 text-indigo-400" /> Command Center
        </Link>
        <Link to="/tasks" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/tasks' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <CheckSquare className="h-4 w-4 text-emerald-400" /> Mission Board
        </Link>
        <Link to="/goals" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/goals' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <Target className="h-4 w-4 text-cyan-400" /> Quest & Habit
        </Link>
        <Link to="/timetable" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/timetable' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <Calendar className="h-4 w-4 text-pink-400" /> Timetable
        </Link>
        <Link to="/completions" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/completions' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Completions
        </Link>
        <Link to="/workspace" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/workspace' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <Cloud className="h-4 w-4 text-amber-400" /> Workspace Actions
        </Link>
        <Link to="/chat" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/chat' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <MessageSquare className="h-4 w-4 text-violet-400" /> Mission Control
        </Link>
      </nav>
      <div className="p-4 border-t border-[#21262d]">
        <Link 
          to="/profile" 
          onClick={onClose}
          className={`flex items-center gap-4 w-full p-4 mb-4 rounded-2xl transition-all border duration-200 ${
            location.pathname === '/profile'
              ? 'bg-indigo-500/15 border-indigo-500/40 shadow-lg shadow-indigo-500/10 text-slate-200'
              : 'bg-[#161b22] border-[#21262d] hover:bg-[#21262d] hover:border-slate-600 text-slate-300'
          }`}
        >
          {user?.picture ? (
            <img 
              src={user?.picture} 
              alt="Profile" 
              className="w-12 h-12 rounded-xl ring-2 ring-indigo-500/30 object-cover shrink-0 shadow-md" 
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-200 font-bold ring-2 ring-indigo-500/30 shrink-0 text-base shadow-md">
              {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-[#f0f6fc] truncate xl:whitespace-normal xl:overflow-visible xl:break-words leading-tight">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-slate-400 truncate xl:whitespace-normal xl:overflow-visible xl:break-all mt-1.5 font-mono">
              {user?.email}
            </p>
          </div>
          <div className="text-[10px] shrink-0 font-extrabold uppercase tracking-wider text-indigo-400 bg-indigo-500/15 px-2.5 py-1 rounded-lg border border-indigo-500/30">
            View
          </div>
        </Link>
        <div className="flex justify-center gap-3 text-[11px] text-slate-500 mb-4">
          <Link to="/privacy" onClick={onClose} className="hover:text-indigo-400 transition-colors">Privacy Policy</Link>
          <span>•</span>
          <Link to="/terms" onClick={onClose} className="hover:text-indigo-400 transition-colors">Terms of Service</Link>
        </div>
        <Button variant="outline" className="w-full justify-start text-slate-400 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:text-white rounded-xl cursor-pointer" onClick={() => { logout(); if (onClose) onClose(); }}>
          <LogOut className="h-4 w-4 mr-2" /> Logout
        </Button>
      </div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  return (
    <div className="flex h-screen bg-[#030712] text-slate-200 font-sans overflow-hidden flex-col lg:flex-row">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between px-6 py-4 bg-[#0d1117] border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <LayoutDashboard className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-[#f0f6fc]">
            TaskPilot <span className="text-indigo-400">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            to="/profile" 
            className="flex items-center justify-center p-1 rounded-xl bg-[#161b22] border border-[#21262d] hover:border-slate-700 transition-all shrink-0"
          >
            {user?.picture ? (
              <img 
                src={user?.picture} 
                alt="Profile" 
                className="w-8 h-8 rounded-lg ring-2 ring-indigo-500/10 object-cover shrink-0" 
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 font-semibold ring-2 ring-indigo-500/10 shrink-0 text-xs">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
            )}
          </Link>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSidebarOpen(true)} 
            className="text-slate-400 hover:text-white cursor-pointer focus:outline-none"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar (hidden on mobile, visible on lg+) */}
      <aside className="w-64 xl:w-72 2xl:w-80 border-r border-[#21262d] bg-[#0d1117] flex-col shrink-0 hidden lg:flex h-full transition-all duration-300">
        <SidebarContent user={user} location={location} logout={logout} />
      </aside>

      {/* Mobile Drawer (animated with Framer Motion) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black z-40 lg:hidden"
            />
            {/* Sliding Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 w-64 bg-[#0d1117] z-50 lg:hidden h-full flex flex-col border-r border-[#21262d]"
            >
              <SidebarContent user={user} location={location} logout={logout} onClose={() => setIsSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 h-full flex flex-col min-h-0 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}

function Login() {
  const { loginWithGoogle, login, register, user, loading } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;

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
      const errorMsg = err.message || "An error occurred.";
      setError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <div className="login-bg flex min-h-screen items-center justify-center text-slate-200 py-10 px-4">
      <div className="w-full max-w-md p-8 bg-[#0d1117] border border-[#21262d] rounded-3xl shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)] animate-in zoom-in duration-500">
            <LayoutDashboard className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-[#f0f6fc] tracking-tight leading-snug">
            {isRegister ? "Create your account" : "Welcome back to TaskPilot"}
          </h1>
          <p className="text-slate-400 text-xs">
            {isRegister ? "Join the autonomous productivity space" : "Sign in to resume control of your dashboard"}
          </p>
        </div>

        {/* Feature Tags (compact, only on login mode to save vertical space) */}
        {!isRegister && (
          <div className="flex flex-wrap gap-1.5 justify-center py-1">
            <span className="px-2 py-0.5 rounded-full bg-[#161b22] border border-[#21262d] text-[10px] text-indigo-300 font-medium font-mono">⚡ AI Tasks</span>
            <span className="px-2 py-0.5 rounded-full bg-[#161b22] border border-[#21262d] text-[10px] text-cyan-300 font-medium font-mono">📅 Workspace Sync</span>
            <span className="px-2 py-0.5 rounded-full bg-[#161b22] border border-[#21262d] text-[10px] text-emerald-300 font-medium font-mono">🎯 Risk Scoring</span>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Full Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="John Doe"
                required
                className="w-full px-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
              />
            </div>
          )}

          <div className="space-y-1 text-left">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="pilot@workspace.com"
              required
              className="w-full px-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
            />
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="••••••••"
              required
              className="w-full px-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
            />
          </div>

          {isRegister && (
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Confirm Password</label>
              <input 
                type="password" 
                value={retypePassword}
                onChange={(e) => { setRetypePassword(e.target.value); setError(null); }}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
              />
            </div>
          )}

          <Button 
            type="submit" 
            disabled={submitting}
            className="w-full h-11 text-xs uppercase tracking-widest font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              isRegister ? "Create Account" : "Sign In with Email"
            )}
          </Button>

          {/* Light Red Error Message Container */}
          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-1 duration-200">
              {error}
            </div>
          )}
        </form>

        {/* Divider & Google Login option (only on login mode) */}
        {!isRegister && (
          <div className="space-y-4">
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[#21262d]"></div>
              <span className="flex-shrink mx-3 text-[10px] text-slate-500 font-mono uppercase tracking-widest">or</span>
              <div className="flex-grow border-t border-[#21262d]"></div>
            </div>

            <Button 
              type="button"
              onClick={loginWithGoogle} 
              className="w-full h-11 text-xs uppercase tracking-widest font-bold bg-white text-indigo-900 rounded-xl hover:bg-indigo-50 transition-colors shadow-xl card-lift flex items-center justify-center gap-2"
            >
              Continue with Google
            </Button>
          </div>
        )}

        {/* Dynamic Mode Switcher */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              // Clear state & errors
              setEmail('');
              setPassword('');
              setName('');
              setRetypePassword('');
              setError(null);
            }}
            className="text-[13px] md:text-sm text-indigo-400 hover:text-indigo-300 transition-colors hover:underline cursor-pointer font-medium focus:outline-none"
          >
            {isRegister 
              ? "Already have an account? Sign In" 
              : "Don't have an account? Register as new user"}
          </button>
        </div>

        <div className="flex justify-center gap-4 text-xs text-slate-500 pt-4 border-t border-[#21262d]">
          <Link to="/privacy" className="hover:text-indigo-400 transition-colors">Privacy Policy</Link>
          <span>•</span>
          <Link to="/terms" className="hover:text-indigo-400 transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Layout>
                  <Profile />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/tasks" element={
              <ProtectedRoute>
                <Layout>
                  <Tasks />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/goals" element={
              <ProtectedRoute>
                <Layout>
                  <Goals />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/completions" element={
              <ProtectedRoute>
                <Layout>
                  <Completions />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/workspace" element={
              <ProtectedRoute>
                <Layout>
                  <Workspace />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/chat" element={
              <ProtectedRoute>
                <Layout>
                  <Chat />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/timetable" element={
              <ProtectedRoute>
                <Layout>
                  <Timetable />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}