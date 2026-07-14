import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Headphones, 
  Timer, 
  ChevronRight, 
  History, 
  ChevronDown, 
  FlaskConical,
  Zap,
  Brain,
  Waves,
  Settings,
  Check,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import FocusTimer, { METHOD_CONFIGS } from '../components/FocusTimer';
import AmbientMixer from '../components/AmbientMixer';
import FocusSessionSummary from '../components/FocusSessionSummary';
import FocusStats from '../components/FocusStats';
import type { FocusMethod, FocusSession } from '../types';
import PageHeader from '../components/PageHeader';

const METHODS: { id: FocusMethod; name: string; science: string; desc: string; ratio: string }[] = [
  { id: 'pomodoro',  name: 'Pomodoro',  science: 'Francesco Cirillo (1980s) — short bursts aligned with the brain\'s natural attention cadence (~25 min).', desc: '25 min focus, 5 min break. 4 cycles then long break.', ratio: '25 / 5' },
  { id: '52-17',     name: '52 / 17',   science: 'DeskTime productivity study — top 10% of performers worked ~52 min then rested ~17 min.', desc: '52 min work, 17 min break. Data-driven deep work.', ratio: '52 / 17' },
  { id: 'ultradian', name: 'Ultradian',  science: 'Nathaniel Kleitman & Peretz Lavie — the body cycles through ~90 min rest-activity (Basic Rest-Activity Cycle).', desc: '90 min deep work, 20 min break. Match your body rhythm.', ratio: '90 / 20' },
  { id: 'flowtime',  name: 'Flowtime',  science: 'Based on Mihaly Csikszentmihalyi\'s flow state research — self-directed focus without rigid timers.', desc: 'Work until your focus fades. Breaks are flexible.', ratio: 'Stopwatch' },
  { id: 'custom',    name: 'Custom',    science: 'Tailor intervals to your own cognitive load, task demands, and personal rhythm.', desc: 'Set your own work and break durations.', ratio: 'Custom' },
];

const getMethodIcon = (id: FocusMethod, className = "h-4 w-4") => {
  switch (id) {
    case 'pomodoro': return <Timer className={`${className} text-rose-400`} />;
    case '52-17': return <Zap className={`${className} text-amber-400`} />;
    case 'ultradian': return <Brain className={`${className} text-violet-400`} />;
    case 'flowtime': return <Waves className={`${className} text-sky-400`} />;
    case 'custom': return <Settings className={`${className} text-slate-400`} />;
    default: return <Timer className={className} />;
  }
};

const METHOD_ICONS: Record<FocusMethod, string> = {
  pomodoro: '🍅', flowtime: '🌊', '52-17': '⚡', ultradian: '🧠', custom: '⚙️',
};

interface SessionResult {
  duration: number;
  breaks: number;
  startedAt: string;
}

export default function Focus() {
  const [selectedMethod, setSelectedMethod] = useState<FocusMethod | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [history, setHistory] = useState<FocusSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [customWork, setCustomWork] = useState(25);
  const [customBreak, setCustomBreak] = useState(5);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [methodOpen, setMethodOpen] = useState(false);
  const methodPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!methodOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (methodPanelRef.current && !methodPanelRef.current.contains(e.target as Node)) setMethodOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMethodOpen(false); };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [methodOpen]);

  const fetchHistory = useCallback(() => {
    const token = localStorage.getItem('token');
    fetch('/api/focus-sessions?limit=20', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setHistory(d.sessions || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleTimerStart = () => setSessionActive(true);

  const handleTimerComplete = (result: { duration: number; breaks: number; startedAt: string }) => {
    setSessionActive(false);
    if (result.duration > 0) setSessionResult(result);
  };

  const handleTimerStop = (result: { duration: number; breaks: number; startedAt: string }) => {
    setSessionActive(false);
    if (result.duration > 30) setSessionResult(result);
  };

  const handleSave = () => {
    setSessionResult(null);
    fetchHistory();
    setStatsRefreshKey(k => k + 1);
  };

  const handleDiscard = () => setSessionResult(null);

  const currentMethod = selectedMethod ? METHODS.find(m => m.id === selectedMethod) : null;

  return (
    <div className="h-full overflow-y-auto bg-[#0a0d12]">
      {/* Session Summary Modal */}
      {sessionResult && selectedMethod && (
        <FocusSessionSummary
          method={selectedMethod}
          duration={sessionResult.duration}
          breaks={sessionResult.breaks}
          startedAt={sessionResult.startedAt}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <PageHeader
          icon={Headphones}
          badge="Focus Zone"
          color="violet"
          title="Enter"
          titleAccent="Deep Work"
          description="Choose a method, block distractions, and do deep work."
        />

        {/* Dropdown row: Method (left) + Sound (right) */}
        <div className="flex items-center justify-between mb-6">
          {/* Method dropdown */}
          <div className="relative" ref={methodPanelRef}>
            <button
              onClick={() => setMethodOpen(!methodOpen)}
              aria-expanded={methodOpen}
              aria-haspopup="true"
              className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700/80 rounded-xl text-sm text-slate-300 transition-all duration-200 min-w-[210px] max-w-xs shadow-lg shadow-black/20 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 shrink-0">
                {selectedMethod ? getMethodIcon(selectedMethod, "h-4 w-4") : <Timer className="h-4 w-4 text-slate-400" />}
              </div>
              <div className="flex-1 text-left truncate flex flex-col justify-center min-w-0">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none mb-0.5">Focus Protocol</span>
                <span className="text-xs font-semibold text-slate-200 truncate leading-tight">
                  {currentMethod ? currentMethod.name : 'Choose Protocol'}
                </span>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform duration-200 ${methodOpen ? 'rotate-180 text-violet-400' : ''}`} />
            </button>

            <AnimatePresence>
              {methodOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute left-0 mt-2 w-80 bg-slate-950/95 border border-slate-800/80 rounded-2xl shadow-2xl shadow-black/80 backdrop-blur-xl z-50 max-h-[460px] overflow-y-auto scrollbar-thin flex flex-col divide-y divide-slate-800/40"
                >
                  {/* Dropdown Header */}
                  <div className="px-4 py-3 flex items-center gap-1.5 bg-slate-900/30">
                    <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                    <span className="font-semibold text-xs text-slate-200 tracking-wide">Focus Protocols</span>
                  </div>

                  <div className="p-2 space-y-1 bg-slate-900/5">
                    {METHODS.map(m => {
                      const isActive = selectedMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedMethod(m.id);
                            setSessionActive(false);
                            setMethodOpen(false);
                          }}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-all duration-200 border ${
                            isActive 
                              ? 'bg-slate-900/60 border-slate-800/85 shadow-inner rounded-xl' 
                              : 'border-transparent hover:bg-slate-900/30 rounded-xl'
                          } group`}
                        >
                          <div className={`p-2 rounded-xl transition-colors duration-200 shrink-0 mt-0.5 ${
                            isActive ? 'bg-violet-500/10' : 'bg-slate-900/50 group-hover:bg-slate-800/50'
                          }`}>
                            {getMethodIcon(m.id, "h-4 w-4")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs font-semibold ${isActive ? 'text-violet-300' : 'text-slate-200 group-hover:text-slate-100'}`}>
                                {m.name}
                              </span>
                              <span className="text-[9px] font-mono font-medium bg-slate-800/80 border border-slate-700/30 text-slate-400 px-1.5 py-0.5 rounded-md shrink-0">
                                {m.ratio}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1 leading-snug group-hover:text-slate-400">
                              {m.desc}
                            </p>
                          </div>
                          {isActive && (
                            <div className="shrink-0 self-center pl-1">
                              <Check className="h-3.5 w-3.5 text-violet-400" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Ambient sound dropdown */}
          <AmbientMixer />
        </div>

        {/* Content area */}
        {selectedMethod ? (
          <>
            {/* Method detail card */}
            <div className="mb-6 p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl shadow-lg shadow-black/10">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-violet-500/10 text-violet-400 rounded-xl shrink-0">
                  {getMethodIcon(selectedMethod, "h-8 w-8")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-slate-200">{currentMethod?.name}</h3>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700/30 px-2 py-0.5 rounded-md">{currentMethod?.ratio}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{currentMethod?.desc}</p>
                  <div className="flex items-start gap-1.5 mt-3 bg-violet-500/5 border border-violet-500/10 rounded-lg px-3 py-2">
                    <FlaskConical className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-violet-300/70 leading-relaxed">{currentMethod?.science}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom method inputs */}
            {selectedMethod === 'custom' && !sessionActive && (
              <div className="flex items-center gap-4 justify-center mb-6">
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  <Timer className="h-4 w-4" />
                  Work:
                  <input type="number" min={1} max={240} value={customWork}
                    onChange={e => setCustomWork(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200 text-center" />
                  min
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  Break:
                  <input type="number" min={0} max={60} value={customBreak}
                    onChange={e => setCustomBreak(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200 text-center" />
                  min
                </label>
              </div>
            )}

            {/* Timer card */}
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 mb-8 shadow-xl shadow-black/15">
              <div className="flex justify-center">
                <FocusTimer
                  method={selectedMethod}
                  customWorkMinutes={customWork}
                  customBreakMinutes={customBreak}
                  onStart={handleTimerStart}
                  onComplete={handleTimerComplete}
                  onStop={handleTimerStop}
                />
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="py-24 text-center">
            <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900/80 border border-slate-800/80 shadow-lg shadow-black/30">
              <Timer className="h-8 w-8 text-violet-400 animate-pulse" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Select a Focus Protocol</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
              Choose a deep work method from the dropdown protocol menu above to start your high-productivity block.
            </p>
          </div>
        )}

        {/* Stats — always visible */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-slate-400 mb-3">Your Focus Stats</h2>
          <FocusStats refreshKey={statsRefreshKey} />
        </div>

        {/* History — always visible */}
        <div className="pb-8">
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
            <History className="h-4 w-4" />
            Recent Sessions
            <ChevronRight className={`h-3 w-3 transition-transform ${showHistory ? 'rotate-90' : ''}`} />
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.length === 0 ? (
                <div className="text-xs text-slate-600 text-center py-4">No sessions yet. Start your first focus!</div>
              ) : (
                history.map((s, idx) => (
                  <div key={s._id || s.id || idx} className="flex items-center gap-3 bg-slate-800/30 rounded-lg px-4 py-2.5">
                    <div className="text-xs text-slate-500 w-20">{new Date(s.startedAt).toLocaleDateString()}</div>
                    <div className="text-xs font-medium text-slate-300 w-20">{METHOD_CONFIGS[s.method]?.label || s.method}</div>
                    <div className="text-xs text-indigo-400 w-16">{Math.round(s.actualDuration / 60)}m</div>
                    {s.qualityRating && (
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(i => (
                          <span key={i} className={`text-[10px] ${i <= s.qualityRating! ? 'text-amber-400' : 'text-slate-700'}`}>★</span>
                        ))}
                      </div>
                    )}
                    {s.taskTitle && <div className="text-[10px] text-slate-500 truncate ml-auto max-w-[150px]">{s.taskTitle}</div>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
