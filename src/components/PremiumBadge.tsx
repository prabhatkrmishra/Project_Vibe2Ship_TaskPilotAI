import {Crown} from 'lucide-react';

interface PremiumBadgeProps {
    isPremium?: boolean;
    className?: string;
}

export function PremiumBadge({isPremium = false, className = ''}: PremiumBadgeProps) {
    if (!isPremium) return null;

    return (
        <div className={`premium-badge flex items-center gap-1.5 ${className}`}>
            <Crown className="h-3 w-3"/>
            <span>Premium</span>
        </div>
    );
}

interface UpgradePromptProps {
    feature?: string;
    onUpgrade?: () => void;
}

export function UpgradePrompt({feature = 'this feature', onUpgrade}: UpgradePromptProps) {
    return (
        <div
            className="flex flex-col items-center gap-3 p-4 bg-gradient-to-r from-violet-500/20 to-indigo-500/20 border border-violet-500/30 rounded-2xl">
            <div className="flex items-center gap-2 text-violet-400">
                <Crown className="h-5 w-5"/>
                <span className="font-bold text-violet-300">Premium Feature</span>
            </div>
            <p className="text-xs text-slate-300 text-center">
                Unlock {feature} with a Premium subscription.
            </p>
            {onUpgrade && (
                <button
                    onClick={onUpgrade}
                    className="px-4 py-1.5 text-xs font-bold rounded-full gold-gradient text-slate-900 hover:scale-105 transition-transform"
                >
                    Upgrade Now
                </button>
            )}
        </div>
    );
}
