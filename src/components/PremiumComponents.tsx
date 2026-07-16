import {useState} from 'react';
import {Crown, Zap, BarChart3, Check, Clock, AlertTriangle, Loader2} from 'lucide-react';
import {Button} from './ui/button';
import {useAuth} from '../lib/AuthContext';
import {showSuccess, showError} from '../lib/toastTheme';

function formatExpiry(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'});
}

function daysRemaining(dateStr: string | null | undefined): number {
    if (!dateStr) return 0;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function PremiumSubscriptionCard() {
    const {user, refreshPremiumStatus} = useAuth();
    const isPremium = user?.isPremium;
    const expiry = user?.premiumExpiry;
    const plan = user?.subscriptionPlan;
    const remaining = daysRemaining(expiry);
    const [cancelling, setCancelling] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);

    const handleCancel = async () => {
        if (!confirmCancel) {
            setConfirmCancel(true);
            return;
        }
        setCancelling(true);
        try {
            const token = await user?.getIdToken();
            const res = await fetch('/api/subscriptions/cancel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (data.success) {
                showSuccess('Subscription Cancelled', data.message || 'Your subscription has been cancelled successfully.');
                await refreshPremiumStatus();
                setConfirmCancel(false);
            } else {
                showError('Cancellation Failed', data.error || 'Failed to cancel subscription');
            }
        } catch {
            showError('Cancellation Failed', 'Failed to cancel subscription');
        } finally {
            setCancelling(false);
        }
    };

    return (
        <div
            className="bg-gradient-to-r from-violet-900/30 to-indigo-900/20 border border-violet-500/30 rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-violet-500/20 text-violet-400 rounded-2xl">
                    <Crown className="w-6 h-6"/>
                </div>
                <div>
                    <h3 className="text-xl font-bold text-[#f0f6fc]">Premium Subscription</h3>
                    <p className="text-sm text-slate-400">Unlock unlimited AI-powered productivity features</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <Zap className="w-5 h-5 text-amber-400"/>
                        <span className="text-sm font-bold text-white">Current Status</span>
                    </div>
                    <div className="text-center">
                        {isPremium ? (
                            <>
                                <div className="text-2xl font-bold text-violet-400 mb-1">Premium Active</div>
                                <div className="text-xs text-slate-400 capitalize">{plan} Plan</div>
                            </>
                        ) : (
                            <>
                                <div className="text-2xl font-bold text-slate-200 mb-1">Free Tier</div>
                                <div className="text-xs text-slate-500">Basic features only</div>
                            </>
                        )}
                    </div>
                </div>

                {isPremium && expiry ? (
                    <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Clock className="w-4 h-4 text-violet-400"/>
                            <span className="text-sm font-bold text-white">Subscription Details</span>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Plan</span>
                                <span className="text-white font-medium capitalize">{plan} Premium</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Expires</span>
                                <span className="text-white font-medium">{formatExpiry(expiry)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Days Left</span>
                                <span className={`font-bold ${remaining <= 7 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {remaining} days
                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div
                        className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-2">
                            <Check className="w-4 h-4 text-emerald-400"/>
                            <span className="text-sm font-bold text-emerald-300">Premium Includes:</span>
                        </div>
                        <ul className="text-xs text-slate-300 space-y-1">
                            <li>• Unlimited AI scheduling sessions</li>
                            <li>• Advanced analytics & reports</li>
                            <li>• All 5 focus protocols</li>
                        </ul>
                    </div>
                )}
            </div>

            {isPremium ? (
                <div className="space-y-3">
                    {remaining <= 7 && (
                        <div
                            className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                            <AlertTriangle className="w-4 h-4 shrink-0"/>
                            <span>Your subscription expires soon. Renew to keep premium features.</span>
                        </div>
                    )}
                    {confirmCancel ? (
                        <div className="flex items-center gap-3">
                            <Button
                                onClick={handleCancel}
                                disabled={cancelling}
                                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold h-10"
                            >
                                {cancelling ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Confirm Cancel'}
                            </Button>
                            <Button
                                onClick={() => setConfirmCancel(false)}
                                variant="outline"
                                className="flex-1 border-slate-700 text-slate-300 h-10"
                            >
                                Keep Subscription
                            </Button>
                        </div>
                    ) : (
                        <Button
                            onClick={handleCancel}
                            variant="outline"
                            className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-medium h-10"
                        >
                            Cancel Subscription
                        </Button>
                    )}
                </div>
            ) : (
                <div className="text-center text-xs text-slate-500">
                    Upgrade to unlock all premium features
                </div>
            )}

            {/* Payment History */}
            {user?.subscriptionPlan && (
                <div className="mt-4 pt-4 border-t border-[#21262d]">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Subscription
                        Details</h4>
                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Plan</span>
                            <span className="text-white font-medium capitalize">{user.subscriptionPlan} Premium</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Status</span>
                            <span className={`font-medium ${isPremium ? 'text-emerald-400' : 'text-slate-500'}`}>
                 {isPremium ? 'Active' : 'Inactive'}
               </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Expiry</span>
                            <span className="text-white font-medium">{formatExpiry(expiry)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function PremiumPaymentInfo() {
    const {user} = useAuth();
    const isPremium = user?.isPremium;

    return (
        <div className="bg-[#161b22] border border-[#21262d] rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
                <BarChart3 className="w-5 h-5 text-cyan-400"/>
                <h3 className="text-lg font-bold text-[#f0f6fc]">Plan Comparison</h3>
            </div>

            <div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[#21262d]">
                            <th className="text-left py-3 text-xs text-slate-400 font-medium">Feature</th>
                            <th className="text-center py-3 text-xs text-slate-400 font-medium">Free</th>
                            <th className="text-center py-3 text-xs text-violet-400 font-medium">Premium</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs">
                        <tr className="border-b border-[#21262d]/50">
                            <td className="py-3 text-slate-300">AI Scheduling Sessions</td>
                            <td className="py-3 text-center text-slate-500">3/day</td>
                            <td className="py-3 text-center text-violet-400 font-bold">Unlimited</td>
                        </tr>
                        <tr className="border-b border-[#21262d]/50">
                            <td className="py-3 text-slate-300">AI Chat Messages</td>
                            <td className="py-3 text-center text-slate-500">20/day</td>
                            <td className="py-3 text-center text-violet-400 font-bold">Unlimited</td>
                        </tr>
                        <tr className="border-b border-[#21262d]/50">
                            <td className="py-3 text-slate-300">Task Analysis & Subtasks</td>
                            <td className="py-3 text-center text-slate-500">5/day</td>
                            <td className="py-3 text-center text-violet-400 font-bold">Unlimited</td>
                        </tr>
                        <tr className="border-b border-[#21262d]/50">
                            <td className="py-3 text-slate-300">Autonomous Daily Planner</td>
                            <td className="py-3 text-center text-slate-500">1/day</td>
                            <td className="py-3 text-center text-violet-400 font-bold">Unlimited</td>
                        </tr>
                        <tr className="border-b border-[#21262d]/50">
                            <td className="py-3 text-slate-300">Focus Protocols</td>
                            <td className="py-3 text-center text-slate-500">2 modes</td>
                            <td className="py-3 text-center text-violet-400 font-bold">Included</td>
                        </tr>
                        <tr>
                            <td className="py-3 text-slate-300">Priority Support</td>
                            <td className="py-3 text-center text-slate-500">-</td>
                            <td className="py-3 text-center text-violet-400 font-bold">Included</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {!isPremium && (
                <div className="mt-4 text-xs text-slate-500">
                    <p>• All payments are secure and processed via Razorpay/UPI</p>
                    <p>• Premium access begins immediately after payment confirmation</p>
                    <p>• You can cancel or manage your subscription anytime</p>
                </div>
            )}
        </div>
    );
}

interface PremiumFeaturesCardProps {
    onUpgradeClick: () => void;
}

export function PremiumFeaturesCard({onUpgradeClick}: PremiumFeaturesCardProps) {
    const {user} = useAuth();
    const isPremium = user?.isPremium;

    if (isPremium) return null;

    return (
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <Crown className="w-5 h-5 text-violet-400"/>
                <h3 className="text-lg font-bold text-[#f0f6fc]">Why Upgrade?</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                    <h4 className="text-sm font-bold text-violet-300 mb-2">Unlimited Sessions</h4>
                    <p className="text-xs text-slate-400">No limits on AI-powered scheduling sessions per day.</p>
                </div>

                <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                    <h4 className="text-sm font-bold text-violet-300 mb-2">Advanced Analytics</h4>
                    <p className="text-xs text-slate-400">Detailed insights and productivity reports.</p>
                </div>

                <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                    <h4 className="text-sm font-bold text-violet-300 mb-2">All Focus Protocols</h4>
                    <p className="text-xs text-slate-400">Unlock 52/17, Ultradian, and Custom focus modes.</p>
                </div>

                <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                    <h4 className="text-sm font-bold text-violet-300 mb-2">Priority Support</h4>
                    <p className="text-xs text-slate-400">Get faster help from our productivity team.</p>
                </div>
            </div>

            <Button
                onClick={onUpgradeClick}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-bold h-12"
            >
                <Crown className="w-4 h-4 mr-2"/>
                Upgrade to Premium
            </Button>
        </div>
    );
}
