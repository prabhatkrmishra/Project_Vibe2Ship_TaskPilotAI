import {useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {X, Zap, ArrowRight} from 'lucide-react';
import {Button} from './ui/button';

interface UpgradeModalProps {
    open: boolean;
    onClose: () => void;
    requiredTier?: 'pro' | 'pro_plus';
    message?: string;
}

export default function UpgradeModal({open, onClose, requiredTier = 'pro_plus', message}: UpgradeModalProps) {
    const isProPlus = requiredTier === 'pro_plus';

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
                            className="w-full max-w-md bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-2xl p-6 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                        isProPlus ? 'bg-[var(--violet)]' : 'bg-[var(--horizon-blue)]'
                                    }`}>
                                        <Zap className="h-4 w-4 text-white"/>
                                    </div>
                                    <h3 className="text-lg font-semibold font-heading text-white">
                                        {isProPlus ? 'Pro+ Feature' : 'Pro Feature'}
                                    </h3>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose}
                                        className="text-slate-400 hover:text-white">
                                    <X className="h-4 w-4"/>
                                </Button>
                            </div>

                            <p className="text-slate-400 text-sm mb-6">
                                {message || `This feature requires ${isProPlus ? 'Pro+' : 'Pro'}. Upgrade to unlock the full power of TaskPilot AI.`}
                            </p>

                            <div className="space-y-3">
                                {isProPlus && (
                                    <div
                                        className="p-3 rounded-xl bg-[var(--graphite-950)] border border-[var(--panel-line)]">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-white">Pro+</span>
                                            <span
                                                className="text-sm font-mono font-bold text-[var(--violet)]">₹499/mo</span>
                                        </div>
                                        <p className="text-xs text-slate-500">AI Executive Assistant, autonomous
                                            scheduling, energy matching</p>
                                    </div>
                                )}
                                <div
                                    className="p-3 rounded-xl bg-[var(--graphite-950)] border border-[var(--panel-line)]">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-white">Pro</span>
                                        <span
                                            className="text-sm font-mono font-bold text-[var(--horizon-blue)]">₹199/mo</span>
                                    </div>
                                    <p className="text-xs text-slate-500">Unlimited AI, visual timeline, micro-stepper,
                                        streak freezes</p>
                                </div>
                            </div>

                            <Button
                                className={`w-full mt-4 h-11 text-xs uppercase tracking-widest font-bold rounded-xl transition-colors ${
                                    isProPlus
                                        ? 'bg-[var(--violet)] text-white hover:opacity-90'
                                        : 'bg-[var(--horizon-blue)] text-white hover:opacity-90'
                                }`}
                                onClick={() => window.location.href = '/profile'}
                            >
                                Upgrade Now
                                <ArrowRight className="h-3.5 w-3.5 ml-2"/>
                            </Button>

                            <button
                                onClick={onClose}
                                className="block w-full text-center text-xs text-slate-500 hover:text-slate-300 mt-3 transition-colors"
                            >
                                Maybe later
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
