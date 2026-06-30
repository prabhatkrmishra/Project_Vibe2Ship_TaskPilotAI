import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/ui/button';
import { LayoutDashboard, CheckSquare, MessageSquare, LogOut, Loader2, Menu, X, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Chat } from './pages/Chat';
import { Goals } from './pages/Goals';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { Home } from './pages/Home';
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
        <Link to="/chat" onClick={onClose} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/chat' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
          <MessageSquare className="h-4 w-4 text-violet-400" /> Mission Control
        </Link>
      </nav>
      <div className="p-4 border-t border-[#21262d]">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-3">
            {user?.picture || user?.photoURL ? (
              <img src={user?.picture || user?.photoURL} alt="Profile" className="w-8 h-8 rounded-full ring-2 ring-cyan-500/30 object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-medium ring-2 ring-cyan-500/30">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
            )}
            <div className="flex-1 overflow-hidden text-sm truncate text-slate-400">
              {user?.name || user?.email}
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
        </div>
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
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsSidebarOpen(true)} 
          className="text-slate-400 hover:text-white cursor-pointer focus:outline-none"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Desktop Sidebar (hidden on mobile, visible on lg+) */}
      <aside className="w-64 border-r border-[#21262d] bg-[#0d1117] flex-col shrink-0 hidden lg:flex h-full">
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
  const { loginWithGoogle, user, loading } = useAuth();
  
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  
  return (
    <div className="login-bg flex h-screen items-center justify-center text-slate-200">
      <div className="w-full max-w-md p-8 bg-[#0d1117] border border-[#21262d] rounded-3xl shadow-2xl text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(99,102,241,0.4)] animate-in zoom-in duration-500">
          <LayoutDashboard className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-light text-[#f0f6fc] leading-tight">TaskPilot <br/><span className="font-semibold italic text-indigo-400">AI</span></h1>
        <p className="text-[#8b949e]">Your autonomous productivity companion.</p>
        
        <div className="flex flex-wrap gap-2 justify-center py-4">
          <span className="px-3 py-1 rounded-full bg-[#161b22] border border-[#21262d] text-xs text-indigo-300 font-medium tracking-wide">⚡ AI Task Analysis</span>
          <span className="px-3 py-1 rounded-full bg-[#161b22] border border-[#21262d] text-xs text-cyan-300 font-medium tracking-wide">📅 Auto-Scheduling</span>
          <span className="px-3 py-1 rounded-full bg-[#161b22] border border-[#21262d] text-xs text-emerald-300 font-medium tracking-wide">🎯 Risk Scoring</span>
        </div>

        <Button onClick={loginWithGoogle} className="w-full h-12 text-sm uppercase tracking-widest font-bold bg-white text-indigo-900 rounded-2xl hover:bg-indigo-50 transition-colors shadow-xl card-lift">
          Continue with Google
        </Button>

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
            <Route path="/chat" element={
              <ProtectedRoute>
                <Layout>
                  <Chat />
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