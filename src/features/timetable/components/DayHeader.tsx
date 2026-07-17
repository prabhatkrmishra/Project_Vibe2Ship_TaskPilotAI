import {motion} from 'motion/react';
import {
    Loader2,
    Calendar as CalendarIcon,
    Sparkles,
    CheckCircle2,
    RefreshCw,
    MoreVertical,
    Plus,
    AlertTriangle
} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';
import PageHeader from '../../../components/PageHeader';

interface DayHeaderProps {
    getLocalDateString: () => string;
    loading: boolean;
    isGenerating: boolean;
    planExists: boolean;
    showConfig: boolean;
    onToggleConfig: () => void;
    onAddSession: () => void;
    onOpenReschedule: () => void;
    actionsMenuOpen: boolean;
    onToggleActionsMenu: () => void;
    isRescheduling: boolean;
    isJobActive: boolean;
    rescheduleBanner: 'idle' | 'in-progress' | 'success' | 'error';
    actionsMenuRef: React.RefObject<HTMLDivElement>;
}

export function DayHeader({
                              getLocalDateString,
                              loading,
                              isGenerating,
                              planExists,
                              showConfig,
                              onToggleConfig,
                              onAddSession,
                              onOpenReschedule,
                              actionsMenuOpen,
                              onToggleActionsMenu,
                              isRescheduling,
                              isJobActive,
                              rescheduleBanner,
                              actionsMenuRef
                          }: DayHeaderProps) {
    return (
        <>
            <PageHeader
                icon={CalendarIcon}
                badge="Daily Timetable"
                color="pink"
                title="Today's"
                titleAccent="Schedule"
                description={`Your AI-optimized session schedule for ${getLocalDateString()}.`}
                actions={!loading ? (
                    <div className="relative self-start sm:self-center" ref={actionsMenuRef}>
                        <Button
                            onClick={onToggleActionsMenu}
                            disabled={isGenerating}
                            size="sm"
                            className={`rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-lg px-4 py-2.5 h-auto cursor-pointer flex items-center gap-2 ${
                                actionsMenuOpen
                                    ? 'bg-muted border border-border text-foreground hover:text-white'
                                    : 'bg-primary hover:bg-primary/80 text-white shadow-primary/10'
                            }`}
                        >
                            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                                <MoreVertical className="w-3.5 h-3.5"/>}
                            Actions
                        </Button>

                        {actionsMenuOpen && (
                            <div
                                className="absolute right-0 top-full mt-2 w-64 bg-[#0b0f1a] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/40 z-20 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.06),transparent_45%),radial-gradient(circle_at_85%_100%,rgba(232,121,249,0.06),transparent_45%)]">
                                {planExists && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onToggleActionsMenu();
                                            onAddSession();
                                        }}
                                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-foreground hover:text-white hover:bg-cyan-400/[0.07] border border-transparent hover:border-cyan-400/30 transition-all cursor-pointer text-xs font-bold uppercase tracking-widest"
                                    >
                                        <span className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0 bg-cyan-400/15 border border-cyan-400/30 shadow-[0_0_10px_rgba(34,211,238,0.25)]">
                                            <Plus className="w-3.5 h-3.5 text-cyan-300"/>
                                        </span>
                                        Add Session
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        onToggleActionsMenu();
                                        onToggleConfig();
                                    }}
                                    disabled={isGenerating}
                                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-foreground hover:text-white hover:bg-violet-400/[0.07] border border-transparent hover:border-violet-400/30 transition-all cursor-pointer text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0 bg-fuchsia-400/15 border border-fuchsia-400/30 shadow-[0_0_10px_rgba(232,121,249,0.25)]">
                                        <Sparkles className="w-3.5 h-3.5 text-fuchsia-300"/>
                                    </span>
                                    {planExists ? (showConfig ? "Close Customizer" : "Customize Routine") : (showConfig ? "Close Settings" : "Set Day Rhythm")}
                                </button>
                                {planExists && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onToggleActionsMenu();
                                            onOpenReschedule();
                                        }}
                                        disabled={isRescheduling || isGenerating || isJobActive}
                                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-foreground hover:text-white hover:bg-amber-400/[0.07] border border-transparent hover:border-amber-400/30 transition-all cursor-pointer text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0 bg-amber-400/15 border border-amber-400/30 shadow-[0_0_10px_rgba(252,211,77,0.25)]">
                                            {(isRescheduling || isJobActive) ?
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300"/> :
                                                <RefreshCw className="w-3.5 h-3.5 text-amber-300"/>}
                                        </span>
                                        Reschedule Routine
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : null}
            />

            {rescheduleBanner !== 'idle' && (
                <motion.div
                    initial={{opacity: 0, y: -10, height: 0}}
                    animate={{opacity: 1, y: 0, height: 'auto'}}
                    exit={{opacity: 0, y: -10, height: 0}}
                    className={`mb-4 flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-semibold transition-all duration-300 ${
                        rescheduleBanner === 'in-progress'
                            ? 'bg-cyan-400/[0.07] border-cyan-400/30 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                            : rescheduleBanner === 'success'
                                ? 'bg-emerald-400/[0.07] border-emerald-400/30 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.12)]'
                                : 'bg-rose-500/[0.07] border-rose-500/30 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.12)]'
                    }`}
                >
                    {rescheduleBanner === 'in-progress' ? (
                        <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]"/>
                    ) : rescheduleBanner === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]"/>
                    ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-300 drop-shadow-[0_0_6px_rgba(244,63,94,0.7)]"/>
                    )}
                    <span>
            {rescheduleBanner === 'in-progress'
                ? 'Rescheduling routine — AI is slotting your tasks...'
                : rescheduleBanner === 'success'
                    ? 'Routine rescheduled successfully!'
                    : 'Reschedule failed — please try again.'}
          </span>
                </motion.div>
            )}
        </>
    );
}