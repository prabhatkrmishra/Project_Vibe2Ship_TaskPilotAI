import { useState, useRef, useCallback, useEffect } from 'react';
import { Volume2, VolumeX, ChevronDown, X } from 'lucide-react';

interface SoundDef {
  id: string;
  label: string;
  category: 'nature' | 'urban' | 'noise' | 'binaural';
  url?: string;
  freqL?: number;
  freqR?: number;
}

const SOUNDS: SoundDef[] = [
  // Nature
  { id: 'rain',       label: 'Rain',           category: 'nature',  url: 'https://assets.mixkit.co/active_storage/sfx/2394/2394-preview.mp3' },
  { id: 'ocean',      label: 'Ocean Waves',    category: 'nature',  url: 'https://assets.mixkit.co/active_storage/sfx/667/667-preview.mp3' },
  { id: 'forest',     label: 'Forest Birds',   category: 'nature',  url: 'https://assets.mixkit.co/active_storage/sfx/1213/1213-preview.mp3' },
  { id: 'thunder',    label: 'Thunder',        category: 'nature',  url: 'https://assets.mixkit.co/active_storage/sfx/2410/2410-preview.mp3' },
  { id: 'wind',       label: 'Wind',           category: 'nature',  url: 'https://assets.mixkit.co/active_storage/sfx/1236/1236-preview.mp3' },
  // Urban
  { id: 'cafe',       label: 'Café',           category: 'urban',   url: 'https://assets.mixkit.co/active_storage/sfx/453/453-preview.mp3' },
  { id: 'library',    label: 'Library',        category: 'urban',   url: 'https://assets.mixkit.co/active_storage/sfx/447/447-preview.mp3' },
  { id: 'fire',       label: 'Fire Crackling', category: 'urban',   url: 'https://assets.mixkit.co/active_storage/sfx/1688/1688-preview.mp3' },
  // Noise
  { id: 'white',      label: 'White Noise',    category: 'noise' },
  { id: 'pink',       label: 'Pink Noise',     category: 'noise' },
  { id: 'brown',      label: 'Brown Noise',    category: 'noise' },
  // Binaural
  { id: 'alpha',      label: 'Alpha (10 Hz)',  category: 'binaural', freqL: 200, freqR: 210 },
  { id: 'beta',       label: 'Beta (16 Hz)',   category: 'binaural', freqL: 200, freqR: 216 },
  { id: 'gamma',      label: 'Gamma (40 Hz)',  category: 'binaural', freqL: 200, freqR: 240 },
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
  audioEl?: HTMLAudioElement;
  sourceNode?: MediaElementAudioSourceNode;
  oscL?: OscillatorNode;
  oscR?: OscillatorNode;
  gainNode?: GainNode;
  source?: AudioBufferSourceNode;
}

const MAX_SOUNDS = 3;

export default function AmbientMixer() {
  const [open, setOpen] = useState(false);
  const [activeSounds, setActiveSounds] = useState<ActiveSound[]>([]);
  const [maxReachedHint, setMaxReachedHint] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSoundsRef = useRef<ActiveSound[]>([]);
  const volumeMapRef = useRef<Record<string, number>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  activeSoundsRef.current = activeSounds;

  const createNoiseBuffer = useCallback((type: 'white' | 'pink' | 'brown', ctx: AudioContext): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
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
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        data[i] = ((b0 + (0.02 * white)) / 1.02) * 3.5;
        b0 = data[i] / 3.5;
      }
    }
    return buffer;
  }, []);

  const startSound = useCallback((def: SoundDef, volume: number): Partial<ActiveSound> => {
    const ctx = audioCtxRef.current || new AudioContext();
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume / 100, ctx.currentTime + 0.05);
    gain.connect(ctx.destination);

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
      return { oscL, oscR, gainNode: gain };
    }

    if (def.category === 'noise' && (def.id === 'white' || def.id === 'pink' || def.id === 'brown')) {
      const buffer = createNoiseBuffer(def.id, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      return { source, gainNode: gain };
    }

    if (def.url) {
      const audio = new Audio(def.url);
      audio.loop = true;
      const sourceNode = ctx.createMediaElementSource(audio);
      sourceNode.connect(gain);
      audio.play().catch(() => {});
      return { audioEl: audio, sourceNode, gainNode: gain };
    }

    return { gainNode: gain };
  }, [createNoiseBuffer]);

  const stopSound = useCallback((sound: ActiveSound) => {
    try { sound.oscL?.stop(); } catch {}
    try { sound.oscR?.stop(); } catch {}
    try { sound.source?.stop(); } catch {}
    try { sound.audioEl?.pause(); if (sound.audioEl) sound.audioEl.src = ''; } catch {}
    try { sound.gainNode?.disconnect(); } catch {}
    try { sound.sourceNode?.disconnect(); } catch {}
    try { sound.source?.disconnect(); } catch {}
  }, []);

  const stopAll = useCallback(() => {
    activeSoundsRef.current.forEach(s => stopSound(s));
    setActiveSounds([]);
  }, [stopSound]);

  const toggleSound = useCallback((def: SoundDef) => {
    const existing = activeSoundsRef.current.find(s => s.id === def.id);
    if (existing) {
      stopSound(existing);
      volumeMapRef.current[def.id] = existing.volume;
      setActiveSounds(prev => prev.filter(s => s.id !== def.id));
    } else if (activeSoundsRef.current.length < MAX_SOUNDS) {
      const vol = volumeMapRef.current[def.id] ?? 50;
      const components = startSound(def, vol);
      const newSound: ActiveSound = { id: def.id, volume: vol, ...components } as ActiveSound;
      setActiveSounds(prev => [...prev, newSound]);
    } else {
      setMaxReachedHint(true);
      setTimeout(() => setMaxReachedHint(false), 2000);
    }
  }, [stopSound, startSound]);

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
      const components = startSound(def, ps.volume);
      volumeMapRef.current[def.id] = ps.volume;
      newSounds.push({ id: ps.id, volume: ps.volume, ...components } as ActiveSound);
    }
    setActiveSounds(newSounds);
  }, [stopSound, startSound]);

  useEffect(() => {
    return () => {
      activeSoundsRef.current.forEach(s => stopSound(s));
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
  const categoryMeta: Record<string, { icon: string; label: string }> = {
    nature:   { icon: '🌿', label: 'Nature' },
    urban:    { icon: '🏙️', label: 'Urban' },
    noise:    { icon: '📊', label: 'Noise' },
    binaural: { icon: '🎵', label: 'Binaural' },
  };
  const categories = ['nature', 'urban', 'noise', 'binaural'] as const;

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-slate-300 transition-colors min-w-[200px]">
        {activeCount > 0
          ? <Volume2 className="h-4 w-4 text-violet-400 shrink-0" />
          : <VolumeX className="h-4 w-4 text-slate-500 shrink-0" />}
        <span className="flex-1 text-left truncate">Sound: {activeCount > 0 ? `${activeCount} active` : 'None'}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {maxReachedHint && !open && (
        <div className="absolute right-0 -bottom-8 text-[10px] text-amber-400/80 whitespace-nowrap">
          Maximum {MAX_SOUNDS} sounds — remove one first
        </div>
      )}

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-[#0d1117] border border-slate-700/60 rounded-xl shadow-2xl shadow-black/40 z-50 max-h-96 overflow-y-auto scrollbar-thin">
          {/* None + Stop All */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-800/60">
            <button onClick={() => { stopAll(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-300 transition-colors">
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500">✕</span>
              None
            </button>
          </div>

          {/* Presets */}
          <div className="px-3 py-2.5 border-b border-slate-800/60">
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-2 px-1">Presets</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(preset => (
                <button key={preset.label} onClick={() => applyPreset(preset)}
                  className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700/80 text-[11px] text-slate-400 hover:text-slate-300 rounded-lg transition-colors border border-transparent hover:border-slate-600/50">
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sound list by category */}
          {categories.map(cat => {
            const sounds = SOUNDS.filter(s => s.category === cat);
            const meta = categoryMeta[cat];
            return (
              <div key={cat}>
                <div className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                </div>
                {sounds.map(def => {
                  const activeSound = activeSounds.find(s => s.id === def.id);
                  const isActive = !!activeSound;
                  return (
                    <div key={def.id}>
                      <button onClick={() => toggleSound(def)}
                        className={`w-full flex items-center justify-between px-4 py-2 text-xs transition-colors ${
                          isActive ? 'bg-violet-500/10 text-violet-300' : 'text-slate-400 hover:bg-slate-800/40'
                        }`}>
                        <span className="flex items-center gap-2">
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
                          {def.label}
                        </span>
                        {isActive && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 tabular-nums">{activeSound!.volume}%</span>
                            <span className="text-slate-500 hover:text-slate-300 p-0.5" onClick={e => { e.stopPropagation(); toggleSound(def); }}>
                              <X className="h-3 w-3" />
                            </span>
                          </div>
                        )}
                      </button>
                      {isActive && (
                        <div className="px-4 pb-2 -mt-0.5">
                          <input type="range" min={0} max={100} value={activeSound!.volume}
                            onChange={e => updateVolume(def.id, parseInt(e.target.value, 10))}
                            className="w-full h-1 accent-violet-500 cursor-pointer" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {activeCount >= MAX_SOUNDS && (
            <div className="px-3 py-2.5 border-t border-slate-800/60">
              <p className="text-[10px] text-amber-400/70 text-center">
                Maximum {MAX_SOUNDS} simultaneous sounds
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
