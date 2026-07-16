import {Loader2, Sparkles, Mic} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';
import {DAY_PRESETS} from '../constants';

interface EmptyStateProps {
    showConfig: boolean;
    dayDescription: string;
    onDayDescriptionChange: (value: string) => void;
    isRecording: boolean;
    onToggleRecording: () => void;
    planExists: boolean;
    isGenerating: boolean;
    onRegenerate: () => void;
    onCancelConfig?: () => void;
}

export function EmptyState({
                               showConfig,
                               dayDescription,
                               onDayDescriptionChange,
                               isRecording,
                               onToggleRecording,
                               planExists,
                               isGenerating,
                               onRegenerate,
                               onCancelConfig
                           }: EmptyStateProps) {
    if (isGenerating) {
        return (
            <div className="text-center py-20 flex flex-col items-center">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary"/>
                <h4 className="text-base font-semibold text-white">Synthesizing Daily Schedule...</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Gemini is analyzing your pending tasks, risk weights, and workload patterns to craft
                    an optimal execution plan.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 bg-primary/5 p-5 md:p-6 border border-primary/10 rounded-2xl">
            <div className="text-center md:text-left">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 justify-center md:justify-start">
                    <Sparkles className="w-5 h-5 text-primary"/>
                    How is your day like?
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Describe your ideal daily rhythm or select one of our high-discipline templates
                    below. Gemini will design a perfectly structured schedule based on your custom
                    hours.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DAY_PRESETS.map((preset) => (
                    <button
                        key={preset.title}
                        type="button"
                        onClick={() => onDayDescriptionChange(preset.prompt)}
                        className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                            dayDescription === preset.prompt
                                ? 'bg-primary/15 border-primary shadow-md shadow-primary/15'
                                : 'bg-card border-muted hover:border-muted'
                        }`}
                    >
                        <h4 className="text-xs font-bold text-white mb-1">{preset.title}</h4>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{preset.desc}</p>
                    </button>
                ))}
            </div>

            <div className="space-y-2">
                <label
                    className="text-xs font-bold font-mono text-foreground uppercase tracking-wider block">
                    Custom Routine Preferences
                </label>
                <div className="relative">
                    <textarea
                        value={dayDescription}
                        onChange={(e) => onDayDescriptionChange(e.target.value)}
                        placeholder="e.g. I wake up at 7:00 AM, have a run at 7:30 AM, eat breakfast at 8:30 AM, work until 4 PM, spend family time until 8 PM, and sleep at 10:30 PM."
                        className="w-full h-24 bg-card border border-border rounded-xl p-3 pr-12 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                    />
                    <button
                        type="button"
                        onClick={onToggleRecording}
                        title={isRecording ? "Stop recording" : "Speak your routine"}
                        className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            isRecording
                                ? 'bg-destructive/20 text-destructive border border-destructive/50 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse'
                                : 'bg-muted text-muted-foreground border border-border hover:text-primary hover:border-primary/50'
                        }`}
                    >
                        <Mic className="w-4 h-4"/>
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                {planExists && onCancelConfig && (
                    <Button
                        onClick={onCancelConfig}
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                        Cancel Customization
                    </Button>
                )}
                <Button
                    onClick={onRegenerate}
                    className="ml-auto bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest px-6 py-3 shadow-lg cursor-pointer flex items-center gap-2"
                >
                    <Sparkles className="w-4 h-4"/>
                    {planExists ? "Update Timetable" : "Generate Discipline Timetable"}
                </Button>
            </div>
        </div>
    );
}
