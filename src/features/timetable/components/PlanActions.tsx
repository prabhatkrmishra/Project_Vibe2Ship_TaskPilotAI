import {Loader2, CalendarCheck, Printer, Download, FileText} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';

interface PlanActionsProps {
    isSyncingCalendar: boolean;
    onSyncCalendar: () => void;
    onPrint: () => void;
    onExportICS: () => void;
    onExportDoc: () => void;
}

export function PlanActions({
                                isSyncingCalendar,
                                onSyncCalendar,
                                onPrint,
                                onExportICS,
                                onExportDoc
                            }: PlanActionsProps) {
    return (
        <div
            className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card border border-muted rounded-2xl mb-2">
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="text-xs font-semibold text-foreground font-mono">EXPORT UTILITIES ACTIVE</span>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button
                    onClick={onSyncCalendar}
                    disabled={isSyncingCalendar}
                    variant="outline"
                    size="sm"
                    className="border-border text-foreground hover:text-white hover:bg-muted rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                >
                    {isSyncingCalendar ?
                        <Loader2 className="w-3.5 h-3.5 text-success animate-spin"/> :
                        <CalendarCheck className="w-3.5 h-3.5 text-success"/>}
                    Google Calendar Sync
                </Button>
                <Button
                    onClick={onPrint}
                    variant="outline"
                    size="sm"
                    className="border-border text-foreground hover:text-white hover:bg-muted rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                >
                    <Printer className="w-3.5 h-3.5 text-primary/80"/>
                    Print View
                </Button>
                <Button
                    onClick={onExportICS}
                    variant="outline"
                    size="sm"
                    className="border-border text-foreground hover:text-white hover:bg-muted rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                >
                    <Download className="w-3.5 h-3.5 text-cyan-400"/>
                    Calendar (.ics)
                </Button>
                <Button
                    onClick={onExportDoc}
                    variant="outline"
                    size="sm"
                    className="border-border text-foreground hover:text-white hover:bg-muted rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-auto"
                >
                    <FileText className="w-3.5 h-3.5 text-pink-400"/>
                    Document (.doc)
                </Button>
            </div>
        </div>
    );
}
