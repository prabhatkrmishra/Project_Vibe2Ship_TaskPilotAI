import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2, LayoutDashboard, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function ForgotPassword() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) { setError("Please enter your email address."); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-bg flex min-h-screen items-center justify-center text-slate-200 py-10 px-4">
      <div className="w-full max-w-md p-8 bg-[#0d1117] border border-[#21262d] rounded-3xl shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)]">
            <LayoutDashboard className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-[#f0f6fc] tracking-tight">
            {sent ? "Check your email" : "Reset your password"}
          </h1>
          <p className="text-slate-400 text-xs">
            {sent
              ? "We've sent a password reset link to your email address."
              : "Enter the email address associated with your account and we'll send you a link to reset your password."}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-300">
                If an account with <strong>{email}</strong> exists, you'll receive a reset link shortly. The link expires in 15 minutes.
              </p>
            </div>
            <Link
              to="/login"
              className="block w-full h-11 text-center text-xs uppercase tracking-widest font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors leading-[44px]"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="pilot@workspace.com"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                />
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 text-xs uppercase tracking-widest font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Send Reset Link"}
            </Button>

            {error && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl text-center font-medium">
                {error}
              </div>
            )}
          </form>
        )}

        {!sent && (
          <div className="text-center">
            <Link to="/login" className="text-[13px] text-indigo-400 hover:text-indigo-300 transition-colors hover:underline font-medium">
              Back to Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Button({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={className} {...props}>{children}</button>;
}
