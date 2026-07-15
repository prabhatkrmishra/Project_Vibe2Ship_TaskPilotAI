import {ShieldAlert, X} from 'lucide-react';
import {TOAST_THEME} from '../lib/toastTheme';

// Persistent (non-auto-dismissing) inline banner for backup-integrity failures.
// Reuses the app's shared dark-glass toast theme (red accent) so it feels like
// part of the same visual language, but stays mounted in the page — unlike a
// toast — until the user explicitly dismisses it or starts a new backup action.
export function BackupErrorBanner({
                                      message,
                                      onDismiss,
                                  }: {
    message?: string;
    onDismiss: () => void;
}) {
    const theme = TOAST_THEME.red;
    return (
        <div
            role="alert"
            className={`relative flex items-start gap-3 w-full bg-gradient-to-br ${theme.panel} border rounded-2xl p-4 shadow-[0_12px_36px_rgba(0,0,0,0.45)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`}
        >
            <div
                className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${theme.halo} blur-2xl opacity-70`}/>

            <div
                className={`relative shrink-0 w-10 h-10 rounded-xl border ${theme.iconRing} flex items-center justify-center ${theme.iconText}`}>
                <ShieldAlert className="w-5 h-5"/>
            </div>

            <div className="relative flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight">Tampered backup — cannot restore</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed break-words">
                    {message || 'This backup file failed signature verification. It may have been modified, corrupted, or created outside TaskPilot AI. Restoring it has been blocked to protect your data.'}
                </p>
            </div>

            <button
                onClick={onDismiss}
                aria-label="Dismiss"
                className="relative shrink-0 text-slate-500 hover:text-white transition-colors cursor-pointer p-1 -m-1"
            >
                <X className="w-4 h-4"/>
            </button>
        </div>
    );
}
