import { type ReactNode } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';

// Shared visual language for EVERY popup banner in the app — the original dark-glass card
// style first built for the Timetable's "Session already in progress" warning: a soft
// gradient wash over a near-black panel, a glowing icon halo, and a colored border.
// Every toast (success, error, info, warning) reuses this same shell; only the accent
// colour and copy change.
export type ToastAccent = 'amber' | 'cyan' | 'emerald' | 'indigo' | 'red';

export const TOAST_THEME: Record<ToastAccent, {
  panel: string;
  halo: string;
  iconRing: string;
  iconText: string;
  primaryBtn: string;
}> = {
  amber: {
    panel: 'from-amber-500/[0.08] via-[#12161d] to-[#0a0d12] border-amber-500/25',
    halo: 'from-amber-400/40 to-amber-500/0',
    iconRing: 'border-amber-400/40 bg-amber-500/15',
    iconText: 'text-amber-300',
    primaryBtn: 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25',
  },
  cyan: {
    panel: 'from-cyan-500/[0.08] via-[#12161d] to-[#0a0d12] border-cyan-500/25',
    halo: 'from-cyan-400/40 to-cyan-500/0',
    iconRing: 'border-cyan-400/40 bg-cyan-500/15',
    iconText: 'text-cyan-300',
    primaryBtn: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25',
  },
  emerald: {
    panel: 'from-emerald-500/[0.08] via-[#12161d] to-[#0a0d12] border-emerald-500/25',
    halo: 'from-emerald-400/40 to-emerald-500/0',
    iconRing: 'border-emerald-400/40 bg-emerald-500/15',
    iconText: 'text-emerald-300',
    primaryBtn: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25',
  },
  indigo: {
    panel: 'from-indigo-500/[0.08] via-[#12161d] to-[#0a0d12] border-indigo-500/25',
    halo: 'from-indigo-400/40 to-indigo-500/0',
    iconRing: 'border-indigo-400/40 bg-indigo-500/15',
    iconText: 'text-indigo-300',
    primaryBtn: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25',
  },
  red: {
    panel: 'from-red-500/[0.08] via-[#12161d] to-[#0a0d12] border-red-500/25',
    halo: 'from-red-400/40 to-red-500/0',
    iconRing: 'border-red-400/40 bg-red-500/15',
    iconText: 'text-red-300',
    primaryBtn: 'bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25',
  },
};

export const SessionToastCard = ({
  accent,
  icon,
  title,
  message,
  meta,
  primaryLabel,
  onPrimary,
  onDismiss,
}: {
  accent: ToastAccent;
  icon: ReactNode;
  title: string;
  message: ReactNode;
  meta?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  onDismiss: () => void;
}) => {
  const theme = TOAST_THEME[accent];
  return (
    <div className={`relative flex items-start gap-3 w-96 min-h-[104px] bg-gradient-to-br ${theme.panel} border rounded-2xl p-4 shadow-[0_12px_36px_rgba(0,0,0,0.55)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {/* Ambient glow orb — the one bit of color life instead of a flat dark panel */}
      <div className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${theme.halo} blur-2xl opacity-70`} />

      <div className={`relative shrink-0 w-10 h-10 rounded-xl border ${theme.iconRing} flex items-center justify-center ${theme.iconText}`}>
        {icon}
      </div>
      {/* Fixed width (w-96 above) so every banner lines up the same; height grows with the
          message's wrapped line count, with a floor (min-h-[104px]) so one-line warnings still
          get a decent, non-cramped card. */}
      <div className="relative flex-1 min-w-0 flex flex-col">
        <p className="text-sm font-bold text-white leading-tight shrink-0">{title}</p>
        <div className="mt-1 pr-1">
          <p className="text-xs text-slate-400 leading-relaxed break-words whitespace-normal">{message}</p>
          {meta && (
            <div className="flex items-center gap-2 mt-2.5 text-[11px] text-slate-500 font-mono flex-wrap break-words">
              {meta}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-3 shrink-0">
          {primaryLabel && onPrimary && (
            <button
              onClick={onPrimary}
              className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${theme.primaryBtn}`}
            >
              {primaryLabel}
            </button>
          )}
          <button
            onClick={onDismiss}
            className={`text-[11px] font-bold uppercase tracking-widest py-1.5 rounded-lg text-slate-500 hover:text-white transition-colors cursor-pointer ${
              primaryLabel && onPrimary ? 'px-3' : '-ml-3 px-3'
            }`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

type ToastOpts = {
  description?: ReactNode;
  action?: { label: string; onClick: () => void };
  duration?: number;
};

const renderThemedToast = (
  accent: ToastAccent,
  icon: ReactNode,
  title: string,
  message: ReactNode,
  opts?: ToastOpts,
) => {
  toast.custom((t) => (
    <SessionToastCard
      accent={accent}
      icon={icon}
      title={title}
      message={message}
      meta={opts?.description}
      primaryLabel={opts?.action?.label}
      onPrimary={opts?.action ? () => { opts.action!.onClick(); toast.dismiss(t); } : undefined}
      onDismiss={() => toast.dismiss(t)}
    />
  ), opts?.duration ? { duration: opts.duration } : undefined);
};

// Generic helper for call sites that want a specific accent/icon/title combo (e.g. "Synced",
// "Title required") rather than the generic Success/Error/Warning/Notice titles below.
export const showInfoToast = (accent: ToastAccent, icon: ReactNode, title: string, message: ReactNode) =>
  renderThemedToast(accent, icon, title, message);

// Drop-in, visually-consistent replacements for sonner's toast.success/error/info/warning.
// Same call signature (message, { description, action }) — just routed through the shared
// dark-glass SessionToastCard shell instead of sonner's default flat banner.
export const showSuccess = (message: ReactNode, opts?: ToastOpts) =>
  renderThemedToast('emerald', <CheckCircle2 className="w-5 h-5" />, 'Success', message, opts);

export const showError = (message: ReactNode, opts?: ToastOpts) =>
  renderThemedToast('red', <XCircle className="w-5 h-5" />, 'Something went wrong', message, opts);

export const showWarning = (message: ReactNode, opts?: ToastOpts) =>
  renderThemedToast('amber', <AlertTriangle className="w-5 h-5" />, 'Heads up', message, opts);

export const showInfo = (message: ReactNode, opts?: ToastOpts) =>
  renderThemedToast('cyan', <Info className="w-5 h-5" />, 'Notice', message, opts);
