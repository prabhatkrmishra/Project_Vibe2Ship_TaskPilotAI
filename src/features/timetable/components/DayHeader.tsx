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
                                className="absolute right-0 top-full mt-2 w-64 bg-background border border-border rounded-2xl shadow-2xl z-20 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                                {planExists && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onToggleActionsMenu();
                                            onAddSession();
                                        }}
                                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-foreground hover:text-white hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer text-xs font-bold uppercase tracking-widest"
                                    >
                                        <Plus className="w-3.5 h-3.5 shrink-0"/>
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
                                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-foreground hover:text-white hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary"/>
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
                                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-foreground hover:text-white hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {(isRescheduling || isJobActive) ?
                                            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin"/> :
                                            <RefreshCw className="w-3.5 h-3.5 shrink-0 text-accent"/>}
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
                            ? 'bg-accent/10 border-accent/30 text-accent'
                            : rescheduleBanner === 'success'
                                ? 'bg-success/10 border-success/30 text-success'
                                : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}
                >
                    {rescheduleBanner === 'in-progress' ? (
                        <RefreshCw className="w-4 h-4 shrink-0 animate-spin"/>
                    ) : rescheduleBanner === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0"/>
                    ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0"/>
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
