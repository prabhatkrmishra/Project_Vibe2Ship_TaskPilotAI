import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../lib/AuthContext';
import {Button} from '../components/ui/button';
import {Crown, Loader2} from 'lucide-react';
import {showSuccess, showError} from '../lib/toastTheme';

export function PaymentSuccess() {
    const navigate = useNavigate();
    const {user, refreshPremiumStatus} = useAuth();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const checkPaymentStatus = async () => {
            try {
                const token = await user?.getIdToken();
                if (!token) {
                    showError('Please login first');
                    navigate('/login');
                    return;
                }

                const res = await fetch('/api/subscriptions/status', {
                    headers: {'Authorization': `Bearer ${token}`}
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.isPremium) {
                        showSuccess('Payment successful! Premium activated.');
                        await refreshPremiumStatus();
                        setTimeout(() => navigate('/dashboard'), 2000);
                    } else {
                        showError('Payment not yet processed. Please wait a few minutes.');
                        setChecking(false);
                    }
                }
            } catch (error) {
                showError('Failed to verify payment status');
                setChecking(false);
            }
        };

        checkPaymentStatus();
    }, [user, navigate, refreshPremiumStatus]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
            {checking ? (
                <Loader2 className="w-8 h-8 animate-spin text-violet-400"/>
            ) : (
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-violet-500/20 rounded-full flex items-center justify-center mx-auto">
                        <Crown className="w-8 h-8 text-violet-400"/>
                    </div>
                    <h2 className="text-xl font-bold text-white">Payment Pending</h2>
                    <p className="text-sm text-slate-400">Your payment is being processed. Please check back in a few
                        minutes.</p>
                    <Button onClick={() => navigate('/dashboard')} className="mt-4">
                        Go to Dashboard
                    </Button>
                </div>
            )}
        </div>
    );
}
