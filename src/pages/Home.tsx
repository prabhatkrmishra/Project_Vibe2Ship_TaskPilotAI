import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { 
  LayoutDashboard, 
  ArrowRight, 
  Sparkles, 
  Calendar, 
  FolderGit, 
  ShieldCheck, 
  Lock, 
  CheckSquare, 
  Bot, 
  Cpu, 
  Terminal, 
  Globe2 
} from 'lucide-react';

export function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
      
      {/* Background visual art */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none" />
      <div className="absolute top-[400px] right-[-10%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[800px] left-[-10%] w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Grid line layer */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* Sleek Premium Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#030712]/75 border-b border-slate-900 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#f0f6fc]">
              TaskPilot <span className="text-indigo-400 font-semibold italic">AI</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#workspace" className="hover:text-white transition-colors">Google Integration</a>
            <a href="#compliance" className="hover:text-white transition-colors">Compliance</a>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <Link 
                to="/dashboard" 
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:scale-[1.02]"
              >
                Launch App <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline-flex text-slate-400 hover:text-white text-sm font-medium px-4 py-2 transition-colors">
                  Sign In
                </Link>
                <Link 
                  to="/login" 
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-medium text-sm transition-all hover:scale-[1.02]"
                >
                  Get Started <Sparkles className="h-4 w-4 text-indigo-600" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 font-medium tracking-wide mx-auto select-none">
            <Bot className="h-3.5 w-3.5 animate-bounce" />
            <span>Autonomous Workspace Autopilot</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-[#f0f6fc] tracking-tight leading-none">
            Your Productivity. <br />
            On <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">AI Autopilot</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            TaskPilot AI acts as a smart autonomous planner, compiling project timelines, scheduling slots, and managing your files using secure Google Workspace API integrations.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link 
              to={user ? "/dashboard" : "/login"} 
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:scale-[1.03]"
            >
              {user ? "Enter Dashboard" : "Get Started Now"} <ArrowRight className="h-5 w-5" />
            </Link>
            <a 
              href="#features" 
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white font-medium text-base transition-all"
            >
              Explore Capabilities
            </a>
          </div>
        </div>

        {/* Dashboard Visual Mockup Container */}
        <div className="max-w-5xl mx-auto mt-16 p-3 rounded-3xl bg-slate-900/40 border border-[#21262d] shadow-2xl relative">
          <div className="absolute inset-0 bg-gradient-to-t from-[#030712] via-transparent to-transparent pointer-events-none rounded-3xl z-10" />
          <div className="bg-[#0d1117] rounded-2xl border border-[#21262d] overflow-hidden p-6 aspect-[16/9] flex flex-col gap-6 relative">
            
            {/* Mock Header */}
            <div className="flex items-center justify-between border-b border-[#21262d] pb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="h-6 w-48 bg-slate-800/50 rounded-lg flex items-center justify-center text-[10px] font-mono text-slate-500">
                app.taskpilotai.com/dashboard
              </div>
              <div className="w-6 h-6 rounded-full bg-slate-800" />
            </div>

            {/* Mock Grid */}
            <div className="grid grid-cols-12 gap-4 flex-1">
              {/* Sidebar */}
              <div className="col-span-3 border-r border-[#21262d] pr-4 space-y-3">
                <div className="h-8 bg-slate-800/40 rounded-xl" />
                <div className="h-8 bg-indigo-500/10 border-l-2 border-indigo-500 rounded-xl" />
                <div className="h-8 bg-slate-800/20 rounded-xl" />
                <div className="h-8 bg-slate-800/20 rounded-xl" />
              </div>
              
              {/* Content Panel */}
              <div className="col-span-9 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="h-5 w-32 bg-slate-800 rounded-lg" />
                    <div className="h-3 w-48 bg-slate-800/50 rounded-md" />
                  </div>
                  <div className="h-8 w-24 bg-[#161b22] border border-[#21262d] rounded-xl" />
                </div>
                
                {/* Visual Task Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-xl space-y-3">
                    <div className="flex justify-between">
                      <div className="h-4 w-24 bg-slate-800 rounded" />
                      <div className="h-4 w-12 bg-red-500/10 border border-red-500/30 rounded" />
                    </div>
                    <div className="h-3 w-full bg-slate-800/50 rounded" />
                    <div className="h-3 w-3/4 bg-slate-800/50 rounded" />
                  </div>
                  <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-xl space-y-3">
                    <div className="flex justify-between">
                      <div className="h-4 w-20 bg-slate-800 rounded" />
                      <div className="h-4 w-12 bg-emerald-500/10 border border-emerald-500/30 rounded" />
                    </div>
                    <div className="h-3 w-full bg-slate-800/50 rounded" />
                    <div className="h-3 w-1/2 bg-slate-800/50 rounded" />
                  </div>
                </div>

                <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-xl h-24 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="inline-flex h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                    <p className="text-xs font-mono text-indigo-300">TaskPilot AI is online & synced with Google Workspace</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="py-24 border-t border-slate-900 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-4">
            <h2 className="font-mono text-sm tracking-widest text-indigo-400 font-semibold uppercase">Engine Matrix</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-[#f0f6fc] tracking-tight">Advanced Autopilot Capabilities</p>
            <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
              A comprehensive suite of autonomous intelligence modules built to keep you on schedule and completely secure.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Feature 1 */}
            <div className="bg-[#0d1117] border border-[#21262d] p-6 rounded-2xl hover:border-indigo-500/50 transition-all group">
              <div className="p-3 bg-indigo-500/10 rounded-xl w-fit text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <CheckSquare className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#f0f6fc] mt-4 mb-2">Smart Tasks</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Add quests, assign direct priorities, and evaluate security risk matrices for every project.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-[#0d1117] border border-[#21262d] p-6 rounded-2xl hover:border-cyan-500/50 transition-all group">
              <div className="p-3 bg-cyan-500/10 rounded-xl w-fit text-cyan-400 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                <Calendar className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#f0f6fc] mt-4 mb-2">Workspace Autopilot</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Connect your Google Calendar, Docs, and Drive to draft briefs, resolve conflicts, and create agendas automatically.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-[#0d1117] border border-[#21262d] p-6 rounded-2xl hover:border-violet-500/50 transition-all group">
              <div className="p-3 bg-violet-500/10 rounded-xl w-fit text-violet-400 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#f0f6fc] mt-4 mb-2">AI Copilot</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                An integrated chat helper capable of creating, analyzing, and structuring your tasks in real time.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-[#0d1117] border border-[#21262d] p-6 rounded-2xl hover:border-emerald-500/50 transition-all group">
              <div className="p-3 bg-emerald-500/10 rounded-xl w-fit text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Cpu className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#f0f6fc] mt-4 mb-2">Cloud-Isolated DB</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Your credentials and lists are isolated inside Google Cloud Firestore, protected by granular security rules.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Google Integration Details Section */}
      <section id="workspace" className="py-20 bg-[#0d1117]/50 border-t border-b border-slate-900 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 font-medium">
              <Globe2 className="h-3.5 w-3.5" />
              <span>Full Google API Verification</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#f0f6fc] tracking-tight">
              Seamlessly sync with your Google Workspace
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              TaskPilot AI operates in strict collaboration with your official workspace apps. Access credentials are encrypted securely on our cloud servers and can be revoked instantly.
            </p>
            
            <div className="space-y-3">
              <div className="flex gap-3 text-sm">
                <Terminal className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                <span className="text-slate-300">Secure OAuth2 single sign-on system</span>
              </div>
              <div className="flex gap-3 text-sm">
                <FolderGit className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                <span className="text-slate-300">Direct integration with Drive files, Sheets, & Slides</span>
              </div>
            </div>
          </div>

          <div className="p-8 bg-[#0d1117] border border-[#21262d] rounded-3xl space-y-6 shadow-xl relative">
            <h3 className="text-lg font-bold text-[#f0f6fc]">Authorized Google Scopes</h3>
            <div className="space-y-3 font-mono text-xs text-slate-400">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <span>Google Calendar API</span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded">auth/calendar</span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <span>Google Drive API</span>
                <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded">auth/drive</span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <span>Google Documents API</span>
                <span className="text-[10px] bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded">auth/documents</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              TaskPilot AI complies strictly with the Google API Services User Data Policy, ensuring no unauthorized telemetry or model training occurs using personal data.
            </p>
          </div>
        </div>
      </section>

      {/* Indian Regulatory Compliance Section */}
      <section id="compliance" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-[#0d1117] to-[#161b22] border border-[#21262d] rounded-3xl p-8 sm:p-12 shadow-xl relative overflow-hidden">
          
          {/* Subtle Glow Flag colors mapping */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-[#21262d] pb-8 mb-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-1.5 bg-[#FF9933] rounded-full" />
                <span className="w-2.5 h-1.5 bg-[#FFFFFF] rounded-full" />
                <span className="w-2.5 h-1.5 bg-[#138808] rounded-full" />
                <span className="text-xs font-mono font-semibold tracking-wider text-indigo-400 uppercase">National Standard</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#f0f6fc]">
                Indian Cyber Compliance & Safety
              </h2>
            </div>
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl w-fit text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Certified Safe</span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-8 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <Lock className="h-4 w-4 text-indigo-400" />
                <span>DPDP Act, 2023 Compliant</span>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                TaskPilot AI respects your digital personal data rights as mandated under India’s Digital Personal Data Protection Act, 2023. You have full controls to view, correct, or request the deletion of your account metadata.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <span>IT Act, 2000 Framework</span>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                All software processing, Google cloud storage triggers, and data encryption modules comply with the Information Technology Act, 2000 and the allied IT Rules, ensuring high-grade data protection.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-[#0d1117] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <LayoutDashboard className="h-4 w-4 text-white" />
            </div>
            <span className="text-[#f0f6fc] font-bold">TaskPilot AI</span>
          </div>

          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-indigo-400 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-indigo-400 transition-colors">Terms of Service</Link>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">Grievance contact: <strong className="text-indigo-400 font-normal">taskpilot.ai.support@gmail.com</strong></span>
          </div>

          <p>© 2026 TaskPilot AI (India). All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}