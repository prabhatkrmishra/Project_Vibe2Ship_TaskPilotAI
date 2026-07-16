import {useState} from 'react';
import {Loader2, ChevronDown, ChevronUp, Check} from 'lucide-react';
import {Button} from './ui/button';
import {apiFetch} from '../lib/utils';

interface MicroStep {
    id: string;
    title: string;
    completed: boolean;
}

interface MicroStepperProps {
    taskId: string;
    existingSteps?: MicroStep[];
    onStepsGenerated?: (steps: MicroStep[]) => void;
}

export default function MicroStepper({taskId, existingSteps = [], onStepsGenerated}: MicroStepperProps) {
    const [steps, setSteps] = useState<MicroStep[]>(existingSteps);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(existingSteps.length > 0);

    const generateSteps = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('taskpilot_jwt');
            const res = await apiFetch('/api/tasks/micro-steps', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
                body: JSON.stringify({taskId})
            });
            if (res.ok) {
                const data = await res.json();
                setSteps(data.microSteps || []);
                setExpanded(true);
                onStepsGenerated?.(data.microSteps || []);
            }
        } catch (e: any) {
            if (e?.name === 'TierUpgradeRequiredError') return;
            console.error('Failed to generate micro-steps:', e);
        }
        setLoading(false);
    };

    const toggleStep = async (id: string) => {
        const step = steps.find(s => s.id === id);
        if (!step) return;
        const newCompleted = !step.completed;

        // Optimistic update
        setSteps(prev => prev.map(s => s.id === id ? {...s, completed: newCompleted} : s));

        try {
            const token = localStorage.getItem('taskpilot_jwt');
            const res = await apiFetch(`/api/tasks/${taskId}/micro-steps/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
                body: JSON.stringify({completed: newCompleted})
            });
            if (!res.ok) {
                // Revert on failure
                setSteps(prev => prev.map(s => s.id === id ? {...s, completed: !newCompleted} : s));
            }
        } catch {
            // Revert on network error
            setSteps(prev => prev.map(s => s.id === id ? {...s, completed: !newCompleted} : s));
        }
    };

    if (steps.length === 0 && !loading) {
        return (
            <Button
                variant="ghost"
                size="sm"
                onClick={generateSteps}
                className="text-xs text-[var(--horizon-blue)] hover:text-[var(--horizon-blue)] hover:bg-[var(--horizon-blue)]/10 mt-1"
            >
                I can't start this →
            </Button>
        );
    }

    return (
        <div className="mt-2">
            <button
                onClick={() => steps.length > 0 && setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs text-[var(--horizon-blue)] font-medium hover:text-[var(--horizon-blue)]/80 transition-colors"
            >
                {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin"/>
                ) : expanded ? (
                    <ChevronUp className="h-3 w-3"/>
                ) : (
                    <ChevronDown className="h-3 w-3"/>
                )}
                Micro-steps ({steps.filter(s => s.completed).length}/{steps.length})
            </button>

            {expanded && (
                <div className="mt-2 space-y-1.5 pl-1">
                    {steps.map((step, i) => (
                        <button
                            key={step.id}
                            onClick={() => toggleStep(step.id)}
                            className={`flex items-start gap-2 w-full text-left p-1.5 rounded-lg text-xs transition-all ${
                                step.completed
                                    ? 'text-slate-500 line-through'
                                    : i === steps.findIndex(s => !s.completed)
                                        ? 'text-white bg-[var(--horizon-blue)]/10 border border-[var(--horizon-blue)]/20'
                                        : 'text-slate-300'
                            }`}
                        >
                            <div
                                className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center ${
                                    step.completed
                                        ? 'bg-[var(--status-on-track)] border-[var(--status-on-track)]'
                                        : 'border-[var(--panel-line)]'
                                }`}>
                                {step.completed && <Check className="h-2.5 w-2.5 text-white"/>}
                            </div>
                            <span>{step.title}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
