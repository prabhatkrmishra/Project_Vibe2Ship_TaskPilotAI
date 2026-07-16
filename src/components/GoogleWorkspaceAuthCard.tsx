import {CheckCircle2, ShieldCheck, ShieldAlert, LogOut, Loader2} from 'lucide-react';
import {Button} from './ui/button';

export type GoogleAuthStatus = 'checking' | 'connected' | 'disconnected';

// Card shown at the top of the Workspace page so the user always knows
// whether their Google account is authorized for Workspace actions.
// A user can be logged into TaskPilot (email/password or guest) without
// ever having granted Google access — Calendar/Drive/Docs/Sheets/Slides/
// Tasks all require a *separate*, explicit Google OAuth grant, which is
// what this card reflects and controls.
export function GoogleWorkspaceAuthCard({
                                            status,
                                            googleEmail,
                                            onConnect,
                                            onDisconnect,
                                            connecting,
                                        }: {
    status: GoogleAuthStatus;
    googleEmail?: string | null;
    onConnect: () => void;
    onDisconnect: () => void;
    connecting: boolean;
}) {
    if (status === 'checking') {
        return (
            <div
                className="bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-3xl p-5 flex items-center gap-3 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500"/>
                <span className="text-sm">Checking Google Workspace authorization…</span>
            </div>
        );
    }

    if (status === 'connected') {
        return (
            <div
                className="bg-[var(--graphite-900)] border border-emerald-500/30 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div
                        className="w-11 h-11 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 flex items-center justify-center text-emerald-300 shrink-0">
                        <ShieldCheck className="h-5 w-5"/>
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white">Google Workspace Connected</h3>
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0"/>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {googleEmail ? (
                                <>Authorized as <span className="text-slate-300 font-medium">{googleEmail}</span> —
                                    Calendar, Drive, Docs, Sheets, Slides &amp; Tasks are unlocked below.</>
                            ) : (
                                'Authorized — Calendar, Drive, Docs, Sheets, Slides & Tasks are unlocked below.'
                            )}
                        </p>
                    </div>
                </div>
                <Button
                    onClick={onDisconnect}
                    variant="ghost"
                    className="shrink-0 text-slate-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl border border-[var(--panel-line)] hover:border-red-500/30 h-10 px-4 font-semibold"
                >
                    <LogOut className="mr-2 w-4 h-4"/> Disconnect
                </Button>
            </div>
        );
    }

    return (
        <div
            className="bg-[var(--graphite-900)] border border-amber-500/30 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div
                    className="w-11 h-11 rounded-2xl border border-amber-400/40 bg-amber-500/15 flex items-center justify-center text-amber-300 shrink-0">
                    <ShieldAlert className="h-5 w-5"/>
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white">Google Account Not Authorized</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Signing in to TaskPilot doesn't grant Workspace access. Connect a Google account to unlock
                        Calendar, Drive, Docs, Sheets, Slides &amp; Tasks actions below.
                    </p>
                </div>
            </div>
            <Button
                onClick={onConnect}
                disabled={connecting}
                className="shrink-0 bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 rounded-xl h-10 px-4 font-semibold disabled:opacity-60"
            >
                {connecting ? (
                    <><Loader2 className="mr-2 w-4 h-4 animate-spin"/> Connecting…</>
                ) : (
                    <>Connect Google Account</>
                )}
            </Button>
        </div>
    );
}
