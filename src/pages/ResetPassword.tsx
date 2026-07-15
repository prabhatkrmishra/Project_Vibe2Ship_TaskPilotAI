import {useState, useEffect} from 'react';
import {Link, Navigate, useSearchParams} from 'react-router-dom';
import {Loader2, LayoutDashboard, Lock, CheckCircle2, XCircle} from 'lucide-react';
import {useAuth} from '../lib/AuthContext';

export default function ResetPassword() {
    const {user, loading} = useAuth();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [newPassword, setNewPassword] = useState('');
    const [retypePassword, setRetypePassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<'success' | 'error' | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Validate token on mount
    const [tokenValid, setTokenValid] = useState<boolean | null>(null);
    useEffect(() => {
        if (!token) {
            setTokenValid(false);
            return;
        }
        fetch(`/api/auth/reset-password/${encodeURIComponent(token)}`)
            .then(r => r.json())
            .then((data: any) => setTokenValid(data.valid))
            .catch(() => setTokenValid(false));
    }, [token]);

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2
        className="h-8 w-8 animate-spin"/></div>;
    if (user) return <Navigate to="/dashboard" replace/>;

    if (!token || tokenValid === false) {
        return (
            <div className="login-bg flex min-h-screen items-center justify-center text-slate-200 py-10 px-4">
                <div
                    className="w-full max-w-md p-8 bg-[#0d1117] border border-[#21262d] rounded-3xl shadow-2xl space-y-6 text-center">
                    <div className="mx-auto w-14 h-14 bg-rose-600/20 rounded-2xl flex items-center justify-center">
                        <XCircle className="h-7 w-7 text-rose-400"/>
                    </div>
                    <h1 className="text-2xl font-semibold text-[#f0f6fc]">Invalid or expired link</h1>
                    <p className="text-slate-400 text-sm">
                        This password reset link is invalid or has expired. Please request a new one.
                    </p>
                    <Link
                        to="/forgot-password"
                        className="block w-full h-11 text-center text-xs uppercase tracking-widest font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors leading-[44px]"
                    >
                        Request New Link
                    </Link>
                </div>
            </div>
        );
    }

    if (tokenValid === null) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/>
        </div>;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        if (!newPassword || !retypePassword) {
            setErrorMsg("Please fill in all fields.");
            return;
        }
        if (newPassword.length < 8) {
            setErrorMsg("Password must be at least 8 characters.");
            return;
        }
        if (newPassword !== retypePassword) {
            setErrorMsg("Passwords do not match.");
            return;
        }
        try {
            setSubmitting(true);
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({token, newPassword}),
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || "Something went wrong.");
                return;
            }
            setResult('success');
        } catch (err: any) {
            setErrorMsg(err.message || "Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-bg flex min-h-screen items-center justify-center text-slate-200 py-10 px-4">
            <div className="w-full max-w-md p-8 bg-[#0d1117] border border-[#21262d] rounded-3xl shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                    <div
                        className="mx-auto w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                        <LayoutDashboard className="h-7 w-7 text-white"/>
                    </div>
                    <h1 className="text-2xl font-semibold text-[#f0f6fc] tracking-tight">
                        {result === 'success' ? "Password reset!" : "Set new password"}
                    </h1>
                    <p className="text-slate-400 text-xs">
                        {result === 'success'
                            ? "Your password has been updated successfully."
                            : "Choose a strong new password for your account."}
                    </p>
                </div>

                {result === 'success' ? (
                    <div className="space-y-4">
                        <div
                            className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0"/>
                            <p className="text-sm text-emerald-300">Your password has been changed. You can now sign in
                                with your new password.</p>
                        </div>
                        <Link
                            to="/login"
                            className="block w-full h-11 text-center text-xs uppercase tracking-widest font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors leading-[44px]"
                        >
                            Sign In
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1 text-left">
                            <label
                                className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">New
                                Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => {
                                        setNewPassword(e.target.value);
                                        setErrorMsg(null);
                                    }}
                                    placeholder="••••••••"
                                    required
                                    className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                                />
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                            </div>
                        </div>

                        <div className="space-y-1 text-left">
                            <label
                                className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Confirm
                                Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={retypePassword}
                                    onChange={(e) => {
                                        setRetypePassword(e.target.value);
                                        setErrorMsg(null);
                                    }}
                                    placeholder="••••••••"
                                    required
                                    className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                                />
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full h-11 text-xs uppercase tracking-widest font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto"/> : "Reset Password"}
                        </button>

                        {errorMsg && (
                            <div
                                className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl text-center font-medium">
                                {errorMsg}
                            </div>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
}
