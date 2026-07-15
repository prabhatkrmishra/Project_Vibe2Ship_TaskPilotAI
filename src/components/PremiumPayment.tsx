import {useState, useEffect, useRef, useCallback} from 'react';
import {useAuth} from '../lib/AuthContext';
import {Button} from './ui/button';
import {Dialog, DialogContent} from './ui/dialog';
import {Loader2, Crown, Check, Tag, AlertTriangle} from 'lucide-react';
import {showSuccess, showError, showInfo} from '../lib/toastTheme';

interface PlanConfig {
    planId: string;
    name: string;
    description: string;
    basePrice: number;
    salePrice: number | null;
    saleActive: boolean;
    saleLabel: string;
    interval: string;
    features: string[];
    popular: boolean;
}

const FALLBACK_PLANS: PlanConfig[] = [
    {
        planId: 'monthly', name: 'Monthly Premium', description: '', basePrice: 199,
        salePrice: null, saleActive: false, saleLabel: '', interval: 'month',
        features: ['Unlimited AI-powered scheduling', 'Advanced analytics & insights', 'All 5 focus protocols', 'Priority email support', '20+ customization themes'],
        popular: false
    },
    {
        planId: 'annual', name: 'Annual Premium', description: '', basePrice: 1999,
        salePrice: null, saleActive: false, saleLabel: '', interval: 'year',
        features: ['All Monthly Premium features', '20% savings vs monthly', 'Early access to new features', 'Premium badge & customization', 'No ads, ever'],
        popular: true
    }
];

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
}

declare global {
    interface Window {
        Razorpay: any;
    }
}

export function PremiumPaymentModal({isOpen, onClose}: PaymentModalProps) {
    const {user, refreshPremiumStatus} = useAuth();
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
    const [loading, setLoading] = useState(false);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unmountedRef = useRef(false);
    const [plans, setPlans] = useState<PlanConfig[]>(FALLBACK_PLANS);
    const [pricingError, setPricingError] = useState(false);

    useEffect(() => {
        fetch('/api/pricing')
            .then(r => r.json())
            .then(data => {
                if (data.plans && data.plans.length > 0) {
                    setPlans(data.plans);
                }
            })
            .catch(() => {
                setPricingError(true);
            });
    }, []);

    useEffect(() => {
        return () => {
            unmountedRef.current = true;
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    const loadRazorpayScript = useCallback(() => {
        return new Promise<boolean>((resolve) => {
            if (window.Razorpay) {
                resolve(true);
                return;
            }
            const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
            if (existing) {
                const onLoad = () => {
                    existing.removeEventListener('load', onLoad);
                    existing.removeEventListener('error', onError);
                    resolve(true);
                };
                const onError = () => {
                    existing.removeEventListener('load', onLoad);
                    existing.removeEventListener('error', onError);
                    resolve(false);
                };
                existing.addEventListener('load', onLoad);
                existing.addEventListener('error', onError);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => {
                console.error('Failed to load Razorpay script');
                resolve(false);
            };
            document.head.appendChild(script);
        });
    }, []);

    const getEffectivePrice = (plan: PlanConfig) => {
        return plan.saleActive && plan.salePrice ? plan.salePrice : plan.basePrice;
    };

    const handlePayment = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            if (!token) {
                showError('Please login first');
                setLoading(false);
                return;
            }

            const res = await fetch('/api/subscriptions/create-order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
                body: JSON.stringify({plan: selectedPlan})
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                let err;
                try {
                    err = JSON.parse(text);
                } catch {
                    err = {error: text || 'Failed to create order'};
                }
                throw new Error(err?.error || `HTTP ${res.status}: Failed to create order`);
            }

            const order = await res.json();
            console.log('Order response:', order);

            if (!order.orderId || !order.keyId) {
                throw new Error('Invalid order response from server');
            }

            const scriptLoaded = await loadRazorpayScript();
            if (!scriptLoaded) throw new Error('Failed to load Razorpay payment gateway. Please check your connection.');

            let verificationAttempted = false;
            const options = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                order_id: order.orderId,
                name: 'TaskPilot AI',
                description: `${order.plan || selectedPlan} Subscription`,
                image: `${window.location.origin}/taskpilot-logo.png`,
                retry: {enabled: true, max_count: 4},
                handler: async (response: any) => {
                    console.log('Razorpay response:', response);
                    if (verificationAttempted) return;
                    verificationAttempted = true;
                    setLoading(true);
                    try {
                        const vToken = await user?.getIdToken();
                        const verifyRes = await fetch('/api/subscriptions/verify', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json', ...(vToken ? {'Authorization': `Bearer ${vToken}`} : {})},
                            body: JSON.stringify({
                                orderId: response.razorpay_order_id,
                                paymentId: response.razorpay_payment_id,
                                signature: response.razorpay_signature,
                                plan: selectedPlan
                            })
                        });
                        const data = await verifyRes.json();
                        if (data.success) {
                            showSuccess('Subscription activated successfully!');
                            await refreshPremiumStatus();
                            closeTimeoutRef.current = setTimeout(() => {
                                if (!unmountedRef.current) onClose();
                            }, 1000);
                        } else {
                            showError(data.error || 'Subscription verification failed');
                        }
                    } catch {
                        showError('Payment verification failed. Contact support if money was deducted.');
                    } finally {
                        setLoading(false);
                    }
                },
                prefill: {name: user?.name || '', email: user?.email || ''},
                theme: {color: '#8b5cf6'},
                modal: {
                    confirm_close: true, ondismiss: () => {
                        if (!verificationAttempted) setLoading(false);
                    }
                }
            };

            console.log('Razorpay options:', options);

            const razorpay = new window.Razorpay(options);
            razorpay.on('payment.failed', (response: any) => {
                console.error('Payment failed:', response);
                showError(response?.error?.description || 'Payment failed. Please try again.');
                setLoading(false);
            });
            razorpay.open();
        } catch (error: any) {
            console.error('Payment error:', error);
            showError(error.message || 'Payment failed');
            setLoading(false);
        }
    };

    const isPremium = user?.isPremium;
    const currentPlan = user?.subscriptionPlan;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc] w-full max-w-lg sm:max-w-xl md:max-w-2xl max-h-[85vh] overflow-y-auto no-scrollbar p-0">
                <div className="p-6 sm:p-8 space-y-6">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-[#f0f6fc] mb-1 flex items-center justify-center gap-2">
                            <Crown className="w-5 h-5 text-violet-400"/>
                            {isPremium ? 'Manage Subscription' : 'Upgrade to Premium'}
                        </h2>
                        <p className="text-sm text-slate-400">
                            {isPremium ? `You are on the ${currentPlan === 'annual' ? 'Annual' : 'Monthly'} plan` : 'Choose a plan to unlock all features'}
                        </p>
                    </div>

                    {pricingError && (
                        <div
                            className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0"/>
                            <span className="text-amber-300">Using default pricing • couldn't reach server.</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {plans.map((plan) => {
                            const effectivePrice = getEffectivePrice(plan);
                            const monthlyEquiv = plan.interval === 'year' ? Math.round(effectivePrice / 12) : null;
                            const hasDiscount = plan.saleActive && plan.salePrice && plan.salePrice < plan.basePrice;

                            return (
                                <div
                                    key={plan.planId}
                                    className={`bg-[#161b22] border rounded-xl p-5 cursor-pointer transition-all relative ${
                                        selectedPlan === plan.planId ? 'ring-2 ring-violet-500 bg-violet-500/10' : 'border-[#21262d] hover:border-slate-700 hover:bg-[#1a1f29]'
                                    }`}
                                    onClick={() => setSelectedPlan(plan.planId as any)}
                                >
                                    {hasDiscount && (
                                        <div
                                            className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <Tag className="w-3 h-3"/>
                                            {plan.saleLabel || 'Sale'}
                                        </div>
                                    )}
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <h3 className="text-sm font-bold text-white">{plan.name}</h3>
                                            <p className="text-[11px] text-slate-400 mt-1">Billed {plan.interval}</p>
                                            {currentPlan === plan.planId && (
                                                <span
                                                    className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md">
                                                    Current
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="flex items-baseline gap-1.5 justify-end">
                                                {hasDiscount && <span
                                                    className="text-xs text-slate-500 line-through">₹{plan.basePrice}</span>}
                                                <div
                                                    className="text-xl font-bold text-violet-400">₹{effectivePrice}</div>
                                            </div>
                                            {monthlyEquiv && (
                                                <div
                                                    className="text-[10px] text-slate-500 mt-1">₹{monthlyEquiv}/mo</div>
                                            )}
                                        </div>
                                    </div>

                                    <ul className="space-y-2 mb-4">
                                        {plan.features.slice(0, 3).map((feature) => (
                                            <li key={feature} className="flex items-start gap-2 text-xs">
                                                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0"/>
                                                <span className="text-slate-300">{feature}</span>
                                            </li>
                                        ))}
                                        {plan.features.length > 3 && (
                                            <li className="text-[10px] text-slate-500 pl-5">+{plan.features.length - 3} more</li>
                                        )}
                                    </ul>

                                    <label className="flex items-center gap-2 pt-3 border-t border-[#21262d]">
                                        <input
                                            type="radio"
                                            name="plan"
                                            checked={selectedPlan === plan.planId}
                                            onChange={() => setSelectedPlan(plan.planId as any)}
                                            className="w-4 h-4 text-violet-500"
                                        />
                                        <span className="text-xs text-slate-400">Select</span>
                                    </label>
                                </div>
                            );
                        })}
                    </div>

                    <Button
                        onClick={handlePayment}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold h-11 rounded-xl">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Continue to Payment'}
                    </Button>

                    <button onClick={onClose}
                            className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors">
                        {isPremium ? 'Close' : 'Maybe later'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function PremiumPayment({isOpen, onClose}: PaymentModalProps) {
    return <PremiumPaymentModal isOpen={isOpen} onClose={onClose}/>;
}
