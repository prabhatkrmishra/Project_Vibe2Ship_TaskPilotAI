import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Volume2, 
  VolumeX, 
  ChevronDown, 
  X, 
  AlertTriangle,
  Trash2,
  Sparkles,
  Loader2,
  CloudRain,
  Waves,
  Trees,
  CloudLightning,
  Wind,
  Coffee,
  BookOpen,
  ShoppingBag,
  Sliders,
  Headphones,
  Leaf,
  Building2,
  Radio,
  Brain,
  Check,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import soundSources from '../data/soundSources.json';

interface SoundDef {
  id: string;
  label: string;
  category: 'nature' | 'urban' | 'noise' | 'binaural';
  url?: string;
  freqL?: number;
  freqR?: number;
}

const getSoundIcon = (id: string) => {
  const cls = "h-4 w-4 shrink-0 transition-all duration-200";
  switch (id) {
    case 'rain': return <CloudRain className={`${cls} text-sky-400`} />;
    case 'ocean': return <Waves className={`${cls} text-cyan-400`} />;
    case 'forest': return <Trees className={`${cls} text-emerald-400`} />;
    case 'thunder': return <CloudLightning className={`${cls} text-amber-500`} />;
    case 'wind': return <Wind className={`${cls} text-teal-400`} />;
    case 'cafe': return <Coffee className={`${cls} text-orange-400`} />;
    case 'library': return <BookOpen className={`${cls} text-indigo-400`} />;
    case 'cinematic_wind': return <Wind className={`${cls} text-purple-400 rotate-45`} />;
    case 'mall': return <ShoppingBag className={`${cls} text-pink-400`} />;
    case 'white':
    case 'pink':
    case 'brown':
      return <Sliders className={`${cls} text-slate-400`} />;
    default:
      return <Headphones className={`${cls} text-violet-400`} />;
  }
};

const getCategoryIcon = (category: string) => {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (category) {
    case 'nature': return <Leaf className={`${cls} text-emerald-400`} />;
    case 'urban': return <Building2 className={`${cls} text-amber-400`} />;
    case 'noise': return <Radio className={`${cls} text-sky-400`} />;
    case 'binaural': return <Brain className={`${cls} text-violet-400`} />;
    default: return <Volume2 className={cls} />;
  }
};

// URLs live in src/data/soundSources.json (single source of truth, shared with
// scripts/check-sound-links.mjs so the CI check can never drift out of sync with what
// actually ships). Look the id up rather than re-typing the URL here.
const urlFor = (id: string): string | undefined =>
  soundSources.sounds.find(s => s.id === id)?.url;

const SOUNDS: SoundDef[] = [
  // Nature
  { id: 'rain',       label: 'Rain',           category: 'nature',  url: urlFor('rain') },
  { id: 'ocean',      label: 'Ocean Waves',    category: 'nature',  url: urlFor('ocean') },
  { id: 'forest',     label: 'Forest Birds',   category: 'nature',  url: urlFor('forest') },
  { id: 'thunder',    label: 'Thunder',        category: 'nature',  url: urlFor('thunder') },
  { id: 'wind',       label: 'Wind',           category: 'nature',  url: urlFor('wind') },
  // Urban
  { id: 'cafe',           label: 'Café',           category: 'urban',   url: urlFor('cafe') },
  { id: 'library',        label: 'Library',        category: 'urban',   url: urlFor('library') },
  { id: 'cinematic_wind', label: 'Cinematic Wind', category: 'urban',   url: urlFor('cinematic_wind') },
  { id: 'mall',           label: 'Mall',           category: 'urban',   url: urlFor('mall') },
  // Noise
  { id: 'white',      label: 'White Noise',    category: 'noise' },
  { id: 'pink',       label: 'Pink Noise',     category: 'noise' },
  { id: 'brown',      label: 'Brown Noise',    category: 'noise' },
  // Binaural (carrier is always 200 Hz so the beat frequency = |freqR - freqL|)
  { id: 'delta', label: 'Delta (2 Hz)',  category: 'binaural', freqL: 200, freqR: 202 },
  { id: 'theta', label: 'Theta (6 Hz)',  category: 'binaural', freqL: 200, freqR: 206 },
  { id: 'alpha', label: 'Alpha (10 Hz)', category: 'binaural', freqL: 200, freqR: 210 },
  { id: 'beta',  label: 'Beta (20 Hz)',  category: 'binaural', freqL: 200, freqR: 220 },
  { id: 'gamma', label: 'Gamma (40 Hz)', category: 'binaural', freqL: 200, freqR: 240 },
];

interface Preset {
  label: string;
  sounds: { id: string; volume: number }[];
}

const PRESETS: Preset[] = [
  { label: 'Deep Focus',     sounds: [{ id: 'pink', volume: 60 }, { id: 'rain', volume: 40 }] },
  { label: 'Morning Energy', sounds: [{ id: 'cafe', volume: 30 }, { id: 'forest', volume: 50 }] },
  { label: 'Night Study',    sounds: [{ id: 'brown', volume: 50 }, { id: 'thunder', volume: 30 }] },
  { label: 'Meditation',     sounds: [{ id: 'ocean', volume: 40 }, { id: 'alpha', volume: 50 }] },
  { label: 'Pure Binaural',  sounds: [{ id: 'alpha', volume: 70 }] },
];

interface ActiveSound {
  id: string;
  volume: number;
  gainNode: GainNode;
  /** Everything this sound created (oscillators, buffer sources, media elements, listeners), so stopSound tears it all down. */
  stopFns: (() => void)[];
}

const MAX_SOUNDS = 3;
const LOAD_TIMEOUT_MS = 6000;

export default function AmbientMixer() {
  const [open, setOpen] = useState(false);
  const [activeSounds, setActiveSounds] = useState<ActiveSound[]>([]);
  const [erroredIds, setErroredIds] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState<{ msg: string; tone: 'warn' | 'error' } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeSoundsRef = useRef<ActiveSound[]>([]);
  const volumeMapRef = useRef<Record<string, number>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastToggleTimeRef = useRef<number>(0);

  activeSoundsRef.current = activeSounds;

  const showHint = useCallback((msg: string, tone: 'warn' | 'error' = 'warn', ms = 3200) => {
    setHint({ msg, tone });
    window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = setTimeout(() => setHint(null), ms);
  }, []);

  // Master chain: every sound feeds masterGain -> compressor -> destination, instead of
  // going straight to destination. The compressor gives quieter sources (noise beds,
  // binaural tones) room to be turned up without the overall mix clipping once 2-3 sounds
  // are layered — this, plus the trim boost below, is the fix for "volume is too low".
  const ensureContext = useCallback(() => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.25;
      const master = ctx.createGain();
      master.gain.value = 1.4; // trim boost so a 50% slider is clearly audible
      master.connect(compressor);
      compressor.connect(ctx.destination);
      masterGainRef.current = master;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return { ctx, master: masterGainRef.current! };
  }, []);

  const createNoiseBuffer = useCallback((type: 'white' | 'pink' | 'brown', ctx: AudioContext): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let brownLast = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'white') {
        data[i] = white * 0.5;
      } else if (type === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const val = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        // Was scaled by 0.11 — roughly 4x quieter than white noise's 0.5 for no acoustic
        // reason. Re-normalized so pink/white/brown are perceptually comparable at the
        // same slider position.
        data[i] = val * 0.18;
      } else {
        // Proper leaky-integrator brown noise (the original formula divided by a shrinking
        // denominator and could drift/clip). This version is normalized and stable.
        brownLast = (brownLast + 0.02 * white) / 1.02;
        data[i] = brownLast * 3.2;
      }
    }
    return buffer;
  }, []);

  /** Stops & tears down a sound, and clears any pending load-timeout/listeners it registered. */
  const stopSound = useCallback((sound: ActiveSound) => {
    sound.stopFns.forEach(fn => { try { fn(); } catch { /* noop */ } });
  }, []);

  const handleSoundFailure = useCallback((def: SoundDef) => {
    const existing = activeSoundsRef.current.find(s => s.id === def.id);
    if (existing) stopSound(existing);
    setActiveSounds(prev => prev.filter(s => s.id !== def.id));
    setErroredIds(prev => new Set(prev).add(def.id));
    showHint(`"${def.label}" failed to load — try another sound`, 'error', 4000);
  }, [stopSound, showHint]);

  const startSound = useCallback((def: SoundDef, volume: number): { gainNode: GainNode; stopFns: (() => void)[] } => {
    const { ctx, master } = ensureContext();
    const stopFns: (() => void)[] = [];

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume / 100, ctx.currentTime + 0.05);
    gain.connect(master);
    stopFns.push(() => { try { gain.disconnect(); } catch { /* noop */ } });

    if (def.category === 'binaural' && def.freqL && def.freqR) {
      const oscL = ctx.createOscillator();
      const oscR = ctx.createOscillator();
      const panL = ctx.createStereoPanner();
      const panR = ctx.createStereoPanner();
      oscL.frequency.value = def.freqL;
      oscR.frequency.value = def.freqR;
      oscL.type = 'sine';
      oscR.type = 'sine';
      panL.pan.value = -1;
      panR.pan.value = 1;
      oscL.connect(panL);
      oscR.connect(panR);
      panL.connect(gain);
      panR.connect(gain);
      oscL.start();
      oscR.start();
      stopFns.push(() => { try { oscL.stop(); oscR.stop(); } catch { /* noop */ } try { oscL.disconnect(); oscR.disconnect(); panL.disconnect(); panR.disconnect(); } catch { /* noop */ } });
      return { gainNode: gain, stopFns };
    }

    if (def.category === 'noise' && (def.id === 'white' || def.id === 'pink' || def.id === 'brown')) {
      const buffer = createNoiseBuffer(def.id, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      stopFns.push(() => { try { source.stop(); } catch { /* noop */ } try { source.disconnect(); } catch { /* noop */ } });
      return { gainNode: gain, stopFns };
    }

    if (def.url) {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.loop = true;
      audio.preload = 'auto';
      const sourceNode = ctx.createMediaElementSource(audio);
      sourceNode.connect(gain);

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanupGuards = () => {
        window.clearTimeout(timeoutId);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('playing', onReady);
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanupGuards();
      };
      // Previously: audio.play().catch(() => {}) — any failure (404, decode error, CORS
      // block, autoplay rejection) was swallowed and the sound just stayed silent with no
      // signal to the user or the app. Now every failure path routes through
      // handleSoundFailure, which stops the sound, flags it in the UI, and shows a message.
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanupGuards();
        handleSoundFailure(def);
      };
      audio.addEventListener('error', onError);
      audio.addEventListener('canplay', onReady, { once: true });
      audio.addEventListener('playing', onReady, { once: true });

      // Belt-and-suspenders: some failure modes (stalled connections, silently-rejected
      // cross-origin loads) never fire an 'error' event at all — they just never become
      // playable. If nothing has happened within LOAD_TIMEOUT_MS, treat it as failed too.
      timeoutId = setTimeout(() => {
        if (!settled && audio.readyState < 2) {
          settled = true;
          cleanupGuards();
          handleSoundFailure(def);
        }
      }, LOAD_TIMEOUT_MS);

      audio.src = def.url;
      audio.play().catch(() => {
        if (!settled) {
          settled = true;
          cleanupGuards();
          handleSoundFailure(def);
        }
      });

      stopFns.push(() => {
        cleanupGuards();
        try { audio.pause(); audio.src = ''; } catch { /* noop */ }
        try { sourceNode.disconnect(); } catch { /* noop */ }
      });
      return { gainNode: gain, stopFns };
    }

    return { gainNode: gain, stopFns };
  }, [ensureContext, createNoiseBuffer, handleSoundFailure]);

  const stopAll = useCallback(() => {
    activeSoundsRef.current.forEach(s => stopSound(s));
    setActiveSounds([]);
  }, [stopSound]);

  const toggleSound = useCallback((def: SoundDef) => {
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 350) {
      return;
    }
    lastToggleTimeRef.current = now;

    const existing = activeSoundsRef.current.find(s => s.id === def.id);
    if (existing) {
      stopSound(existing);
      volumeMapRef.current[def.id] = existing.volume;
      setActiveSounds(prev => prev.filter(s => s.id !== def.id));
    } else if (activeSoundsRef.current.length < MAX_SOUNDS) {
      setErroredIds(prev => {
        if (!prev.has(def.id)) return prev;
        const next = new Set(prev);
        next.delete(def.id);
        return next;
      });
      const vol = volumeMapRef.current[def.id] ?? 50;
      const { gainNode, stopFns } = startSound(def, vol);
      const newSound: ActiveSound = { id: def.id, volume: vol, gainNode, stopFns };
      setActiveSounds(prev => [...prev, newSound]);
    } else {
      showHint(`Maximum ${MAX_SOUNDS} sounds — remove one first`, 'warn');
    }
  }, [stopSound, startSound, showHint]);

  const updateVolume = useCallback((soundId: string, vol: number) => {
    volumeMapRef.current[soundId] = vol;
    setActiveSounds(prev => prev.map(s => s.id === soundId ? { ...s, volume: vol } : s));
    const sound = activeSoundsRef.current.find(s => s.id === soundId);
    if (sound?.gainNode) {
      const ctx = sound.gainNode.context;
      sound.gainNode.gain.setValueAtTime(sound.gainNode.gain.value, ctx.currentTime);
      sound.gainNode.gain.linearRampToValueAtTime(vol / 100, ctx.currentTime + 0.05);
    }
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    activeSoundsRef.current.forEach(s => stopSound(s));
    setActiveSounds([]);
    const newSounds: ActiveSound[] = [];
    for (const ps of preset.sounds) {
      const def = SOUNDS.find(s => s.id === ps.id);
      if (!def) continue;
      const { gainNode, stopFns } = startSound(def, ps.volume);
      volumeMapRef.current[def.id] = ps.volume;
      newSounds.push({ id: ps.id, volume: ps.volume, gainNode, stopFns });
    }
    setActiveSounds(newSounds);
  }, [stopSound, startSound]);

  useEffect(() => {
    return () => {
      activeSoundsRef.current.forEach(s => stopSound(s));
      window.clearTimeout(hintTimeoutRef.current);
      audioCtxRef.current?.close();
    };
  }, [stopSound]);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const activeCount = activeSounds.length;
  const categories = ['nature', 'urban', 'noise', 'binaural'] as const;

  const isPresetActive = (preset: Preset) => {
    if (preset.sounds.length !== activeSounds.length) return false;
    return preset.sounds.every(ps => activeSounds.some(as => as.id === ps.id));
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Self-contained styling for smooth premium soundwave animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes TPWaveform {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        .tp-wave-bar {
          animation: TPWaveform 1s ease-in-out infinite;
          transform-origin: bottom;
        }
        .tp-wave-bar:nth-child(2) { animation-delay: 0.15s; }
        .tp-wave-bar:nth-child(3) { animation-delay: 0.3s; }
      `}} />

      {/* Main Trigger Button */}
      <button onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700/80 rounded-xl text-sm text-slate-300 transition-all duration-200 min-w-[210px] max-w-xs shadow-lg shadow-black/20 focus:outline-none focus:ring-2 focus:ring-violet-500/50">
        {activeCount > 0
          ? <Volume2 className="h-4 w-4 text-violet-400 shrink-0 animate-pulse" />
          : <VolumeX className="h-4 w-4 text-slate-500 shrink-0" />}
        
        <div className="flex-1 text-left truncate flex items-center gap-1.5 overflow-hidden">
          {activeCount === 0 ? (
            <span className="text-slate-400 font-medium">Ambient Sounds</span>
          ) : (
            <div className="flex items-center gap-1 overflow-hidden">
              {activeSounds.map(s => {
                const def = SOUNDS.find(sound => sound.id === s.id);
                return (
                  <span key={s.id} className="inline-flex items-center px-1.5 py-0.5 bg-violet-500/10 text-violet-300 border border-violet-500/20 text-[10px] font-medium rounded-md whitespace-nowrap">
                    {def?.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-violet-400' : ''}`} />
      </button>

      {hint && !open && (
        <div className={`absolute right-0 -bottom-8 text-[10px] whitespace-nowrap px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800/80 ${hint.tone === 'error' ? 'text-red-400/90' : 'text-amber-400/80'}`}>
          {hint.msg}
        </div>
      )}

      {/* Dropdown Menu Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-80 bg-slate-950/95 border border-slate-800/80 rounded-2xl shadow-2xl shadow-black/80 backdrop-blur-xl z-50 max-h-[460px] overflow-y-auto scrollbar-thin flex flex-col divide-y divide-slate-800/40"
          >
            {hint && (
              <div className={`px-4 py-2.5 text-[11px] font-medium ${hint.tone === 'error' ? 'text-red-400/90 bg-red-500/5' : 'text-amber-400/80 bg-amber-500/5'} flex items-center gap-1.5`}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{hint.msg}</span>
              </div>
            )}

            {/* Dropdown Header */}
            <div className="px-4 py-3 flex items-center justify-between bg-slate-900/30">
              <div className="flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-violet-400" />
                <span className="font-semibold text-xs text-slate-200 tracking-wide">Sound Mixer</span>
                {activeCount > 0 && (
                  <span className="text-[10px] bg-violet-500/10 text-violet-400 px-1.5 py-0.2 rounded-full font-bold">
                    {activeCount}/{MAX_SOUNDS}
                  </span>
                )}
              </div>
              
              {activeCount > 0 ? (
                <button 
                  onClick={stopAll}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400 transition-colors font-medium px-2 py-1 rounded-md hover:bg-red-500/5 border border-transparent hover:border-red-500/10"
                >
                  <Trash2 className="h-3 w-3" /> Mute All
                </button>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium italic">No active layers</span>
              )}
            </div>

            {/* Presets Grid */}
            <div className="p-4 bg-slate-900/10">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" />
                <span>Presets</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(preset => {
                  const active = isPresetActive(preset);
                  return (
                    <button 
                      key={preset.label} 
                      onClick={() => applyPreset(preset)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all duration-200 border ${
                        active
                          ? 'bg-violet-500/15 border-violet-500/40 text-violet-300 shadow-sm shadow-violet-500/10'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sound list by category */}
            <div className="flex flex-col divide-y divide-slate-800/30">
              {categories.map(cat => {
                const sounds = SOUNDS.filter(s => s.category === cat);
                return (
                  <div key={cat} className="p-3 bg-slate-900/5">
                    <div className="px-1 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
                      {getCategoryIcon(cat)}
                      <span>{cat}</span>
                    </div>
                    
                    <div className="space-y-1 mt-1">
                      {sounds.map(def => {
                        const activeSound = activeSounds.find(s => s.id === def.id);
                        const isActive = !!activeSound;
                        const hasError = erroredIds.has(def.id) && !isActive;
                        
                        return (
                          <div 
                            key={def.id} 
                            className={`rounded-xl transition-all duration-200 border ${
                              isActive 
                                ? 'bg-slate-900/60 border-slate-800/80 shadow-inner' 
                                : 'border-transparent hover:bg-slate-900/30'
                            }`}
                          >
                            {/* Sound Header Row */}
                            <button 
                              onClick={() => toggleSound(def)}
                              className="w-full flex items-center justify-between px-2.5 py-2 text-xs transition-colors group"
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <div className={`p-1.5 rounded-lg transition-colors duration-200 ${
                                  isActive ? 'bg-violet-500/10' : 'bg-slate-900/50 group-hover:bg-slate-800/50'
                                }`}>
                                  {getSoundIcon(def.id)}
                                </div>
                                <span className={`truncate font-medium transition-colors ${
                                  isActive 
                                    ? 'text-violet-300' 
                                    : hasError 
                                      ? 'text-red-400' 
                                      : 'text-slate-300 group-hover:text-slate-100'
                                }`}>
                                  {def.label}
                                </span>
                              </span>

                              <div className="flex items-center gap-2">
                                {isActive ? (
                                  <>
                                    {/* Waveform Animation */}
                                    <span className="flex items-end gap-0.5 h-3.5 w-3.5 mr-1 overflow-hidden pb-0.5">
                                      <span className="w-0.5 bg-violet-400 tp-wave-bar origin-bottom" style={{ height: '70%' }} />
                                      <span className="w-0.5 bg-violet-400 tp-wave-bar origin-bottom" style={{ height: '100%' }} />
                                      <span className="w-0.5 bg-violet-400 tp-wave-bar origin-bottom" style={{ height: '50%' }} />
                                    </span>
                                    
                                    <span className="text-[10px] text-violet-400/80 font-mono font-medium">{activeSound!.volume}%</span>
                                    <span className="text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors hover:bg-slate-800/50" 
                                      onClick={e => { e.stopPropagation(); toggleSound(def); }}
                                    >
                                      <X className="h-3 w-3" />
                                    </span>
                                  </>
                                ) : hasError ? (
                                  <div className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/15">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    <span>retry</span>
                                  </div>
                                ) : (
                                  <Plus className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition-colors opacity-0 group-hover:opacity-100" />
                                )}
                              </div>
                            </button>

                            {/* Volume Slider Section */}
                            {isActive && (
                              <div className="px-3 pb-3 pt-1 flex items-center gap-2.5">
                                <VolumeX className="h-3 w-3 text-slate-500" />
                                <input 
                                  type="range" 
                                  min={0} 
                                  max={100} 
                                  value={activeSound!.volume}
                                  onChange={e => updateVolume(def.id, parseInt(e.target.value, 10))}
                                  className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500 hover:accent-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-500" 
                                />
                                <Volume2 className="h-3 w-3 text-violet-400" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {activeCount >= MAX_SOUNDS && (
              <div className="px-4 py-3 bg-slate-900/20 border-t border-slate-800/40">
                <p className="text-[10px] text-amber-400/80 text-center flex items-center justify-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                  <span>Maximum {MAX_SOUNDS} simultaneous sounds</span>
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
