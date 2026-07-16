import {AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';
import type {Task} from '@/types.ts';

interface ReplanDialogProps {
    pendingReplan: { customDesc?: string; tasksOverride?: Task[] } | null;
    onConfirm: (customDesc?: string, tasksOverride?: Task[]) => void;
    onCancel: () => void;
}

export function ReplanDialog({pendingReplan, onConfirm, onCancel}: ReplanDialogProps) {
    if (!pendingReplan) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div
                className="bg-background border border-amber-500/25 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start gap-3">
                    <div
                        className="shrink-0 w-10 h-10 rounded-xl border border-warning/40 bg-warning/15 flex items-center justify-center text-warning">
                        <AlertTriangle className="w-5 h-5"/>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Replan from scratch?</h3>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                            This will regenerate your entire timetable and discard progress (completed/started
                            sessions) on today's plan.
                            If you only want to slot new tasks into your existing timetable without losing
                            progress, use Dashboard's
                            "Assign Tasks to Timetable" instead.
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-muted">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCancel}
                        className="text-muted-foreground hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => onConfirm(pendingReplan.customDesc, pendingReplan.tasksOverride)}
                        className="bg-warning/15 border border-warning/30 text-warning hover:bg-warning/25 rounded-xl text-xs font-bold cursor-pointer"
                    >
                        Continue with Full Replan
                    </Button>
                </div>
            </div>
        </div>
    );
}
