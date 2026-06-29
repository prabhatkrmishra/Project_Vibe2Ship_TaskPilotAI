import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/ui/button';
import { LayoutDashboard, CheckSquare, MessageSquare, LogOut, Loader2 } from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Chat } from './pages/Chat';
import { Toaster } from './components/ui/sonner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();
  const location = useLocation();
  
  return (
    <div className="flex h-screen bg-[#030712] text-slate-200 font-sans overflow-hidden">
      <aside className="w-64 border-r border-[#21262d] bg-[#0d1117] flex flex-col z-20">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-[#f0f6fc] flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="h-4 w-4 text-white" />
            </div>
            TaskPilot <span className="text-indigo-400">AI</span>
            <span className="text-[10px] text-slate-500 font-mono font-normal ml-1">v1.0</span>
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <Link to="/" className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
            <LayoutDashboard className="h-4 w-4 text-indigo-400" /> Command Center
          </Link>
          <Link to="/tasks" className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/tasks' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
            <CheckSquare className="h-4 w-4 text-emerald-400" /> Mission Board
          </Link>
          <Link to="/chat" className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-900 transition-colors text-slate-300 ${location.pathname === '/chat' ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[10px]' : 'border-l-2 border-transparent pl-[10px]'}`}>
            <MessageSquare className="h-4 w-4 text-violet-400" /> Mission Control
          </Link>
        </nav>
        <div className="p-4 border-t border-[#21262d]">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-3">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full ring-2 ring-cyan-500/30 object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-medium ring-2 ring-cyan-500/30">
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </div>
              )}
              <div className="flex-1 overflow-hidden text-sm truncate text-slate-400">
                {user?.displayName || user?.email}
              </div>
            </div>
            <div className="w-2 h-2 rounded-full bg-cyan-400 relative ai-pulse"></div>
          </div>
          <Button variant="outline" className="w-full justify-start text-slate-400 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:text-white rounded-xl" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function Login() {
  const { loginWithGoogle, user, loading } = useAuth();
  
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (user) return <Navigate to="/" replace />;
  
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
            <Route path="/" element={
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
            <Route path="/chat" element={
              <ProtectedRoute>
                <Layout>
                  <Chat />
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
