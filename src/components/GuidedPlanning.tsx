import {useState, useEffect} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {MessageSquare, ArrowRight, ArrowLeft, Sparkles, Loader2} from 'lucide-react';
import {Button} from './ui/button';

interface GuidedPlanningProps {
    open: boolean;
    onClose: () => void;
    onPlanGenerated?: () => void;
}

const QUESTIONS = [
    {
        id: 'energy',
        question: "How's your energy today?",
        placeholder: "E.g., Feeling great, low energy, need caffeine...",
        icon: '⚡'
    },
    {
        id: 'yesterday',
        question: "Anything from yesterday to carry forward?",
        placeholder: "E.g., Finish the report, follow up with Rahul...",
        icon: '📋'
    },
    {
        id: 'today',
        question: "What's actually happening today?",
        placeholder: "E.g., Team standup at 10, deep work in the afternoon...",
        icon: '📅'
    },
    {
        id: 'priority',
        question: "What's the ONE thing that matters most?",
        placeholder: "E.g., Ship the landing page by EOD...",
        icon: '🎯'
    }
];

export default function GuidedPlanning({open, onClose, onPlanGenerated}: GuidedPlanningProps) {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Reset state when modal opens
    useEffect(() => {
        if (open) {
            setStep(0);
            setAnswers({});
            setLoading(false);
            setError('');
        }
    }, [open]);

    const currentQuestion = QUESTIONS[step];
    const isLast = step === QUESTIONS.length - 1;

    const handleNext = () => {
        if (!answers[currentQuestion.id]?.trim()) return;
        if (isLast) {
            generatePlan();
        } else {
            setStep(s => s + 1);
        }
    };

    const handleBack = () => {
        if (step > 0) setStep(s => s - 1);
    };

    const generatePlan = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('taskpilot_jwt');
            const contextSummary = QUESTIONS.map(q => `${q.question}: ${answers[q.id] || 'Not specified'}`).join('\n');

            const res = await fetch('/api/generate-plan', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
                body: JSON.stringify({
                    guidedContext: contextSummary,
                    planningMode: 'guided'
                })
            });

            if (res.ok) {
                onPlanGenerated?.();
                onClose();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to generate plan');
            }
        } catch (e) {
            setError('Connection error. Please try again.');
        }
        setLoading(false);
    };

    const progress = ((step + 1) / QUESTIONS.length) * 100;

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{opacity: 0}}
                        animate={{opacity: 0.5}}
                        exit={{opacity: 0}}
                        onClick={onClose}
                        className="fixed inset-0 bg-black z-50"
                    />
                    <motion.div
                        initial={{opacity: 0, scale: 0.95, y: 10}}
                        animate={{opacity: 1, scale: 1, y: 0}}
                        exit={{opacity: 0, scale: 0.95, y: 10}}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        onClick={onClose}
                    >
                        <div
                            className="w-full max-w-lg bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-2xl shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Progress bar */}
                            <div className="h-1 bg-[var(--graphite-950)]">
                                <motion.div
                                    className="h-full bg-[var(--violet)]"
                                    animate={{width: `${progress}%`}}
                                    transition={{duration: 0.3}}
                                />
                            </div>

                            <div className="p-6">
                                {/* Header */}
                                <div className="flex items-center gap-2 mb-6">
                                    <div
                                        className="w-8 h-8 bg-[var(--violet)]/20 rounded-lg flex items-center justify-center">
                                        <Sparkles className="h-4 w-4 text-[var(--violet)]"/>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white font-heading">Guided
                                            Planning</h3>
                                        <p className="text-[10px] text-slate-500 font-mono">
                                            Step {step + 1} of {QUESTIONS.length}
                                        </p>
                                    </div>
                                </div>

                                {/* Question */}
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={step}
                                        initial={{opacity: 0, x: 20}}
                                        animate={{opacity: 1, x: 0}}
                                        exit={{opacity: 0, x: -20}}
                                        transition={{duration: 0.2}}
                                    >
                                        <div className="flex items-start gap-3 mb-4">
                                            <span className="text-2xl mt-1">{currentQuestion.icon}</span>
                                            <h2 className="text-xl font-light text-white font-heading leading-snug">
                                                {currentQuestion.question}
                                            </h2>
                                        </div>

                                        <textarea
                                            value={answers[currentQuestion.id] || ''}
                                            onChange={e => setAnswers(prev => ({
                                                ...prev,
                                                [currentQuestion.id]: e.target.value
                                            }))}
                                            placeholder={currentQuestion.placeholder}
                                            autoFocus
                                            rows={3}
                                            className="w-full bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[var(--violet)] resize-none transition-colors"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleNext();
                                            }}
                                        />
                                    </motion.div>
                                </AnimatePresence>

                                {error && (
                                    <div
                                        className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg text-center">
                                        {error}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center justify-between mt-6">
                                    <div>
                                        {step > 0 && (
                                            <Button variant="ghost" size="sm" onClick={handleBack}
                                                    className="text-slate-400 hover:text-white text-xs">
                                                <ArrowLeft className="h-3 w-3 mr-1"/>
                                                Back
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={onClose}
                                                className="text-slate-500 hover:text-white text-xs">
                                            Skip
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleNext}
                                            disabled={!answers[currentQuestion.id]?.trim() || loading}
                                            className="bg-[var(--violet)] text-white text-xs font-bold hover:opacity-90 px-4"
                                        >
                                            {loading ? (
                                                <Loader2 className="h-3 w-3 animate-spin"/>
                                            ) : isLast ? (
                                                <>Generate Plan <Sparkles className="h-3 w-3 ml-1"/></>
                                            ) : (
                                                <>Next <ArrowRight className="h-3 w-3 ml-1"/></>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
