import {useState, useEffect, useCallback, useRef} from 'react';
import {useAuth} from '../lib/AuthContext';
import {showSuccess, showError} from '../lib/toastTheme';
import {
    User as UserIcon,
    Mail,
    MapPin,
    Key,
    ArrowLeft,
    Save,
    ShieldCheck,
    Lock,
    Loader2,
    LogOut,
    Trophy,
    Flame,
    CheckCircle,
    Clock,
    Star,
    Target,
    Briefcase,
    Cpu,
    Check,
    Smartphone,
    Copy,
    Headphones,
    Crown,
    BarChart3,
    Zap,
    Shield,
    AlertTriangle,
    CalendarClock
} from 'lucide-react';
import {Link, useNavigate} from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import {Button} from '../components/ui/button';
import {PremiumPayment} from '../components/PremiumPayment';
import {PremiumSubscriptionCard, PremiumPaymentInfo, PremiumFeaturesCard} from '../components/PremiumComponents';
import {ACHIEVEMENTS, Achievement} from '../types';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from '../components/ui/dialog';

export function Profile() {
    const {user, updateUser, logout} = useAuth();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<'achievements' | 'settings' | 'personalities' | 'premium'>('achievements');
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // Profile fields state
    const [name, setName] = useState(user?.name || '');
    const [address, setAddress] = useState(user?.address || '');
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

    // Model selection state
    const [models, setModelsList] = useState<{
        name: string;
        displayName: string;
        provider: string;
        available: boolean
    }[]>([]);
    const [defaultModel, setDefaultModel] = useState<string>(() => {
        return localStorage.getItem('default_gemini_model') || 'gemini-3.1-flash-lite';
    });
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [isModelModalOpen, setIsModelModalOpen] = useState(false);

    // 2FA state
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [twoFASetupStep, setTwoFASetupStep] = useState<'idle' | 'qr' | 'verify' | 'done'>('idle');
    const [twoFASecret, setTwoFASecret] = useState('');
    const [twoFAQRCode, setTwoFAQRCode] = useState('');
    const [twoFACode, setTwoFACode] = useState('');
    const [twoFADisableCode, setTwoFADisableCode] = useState('');
    const [twoFASetupLoading, setTwoFASetupLoading] = useState(false);
    const [twoFADialogOpen, setTwoFADialogOpen] = useState(false);
    const [twoFADisableDialogOpen, setTwoFADisableDialogOpen] = useState(false);

    useEffect(() => {
        const fetchModels = async () => {
            if (!user) return;
            setIsLoadingModels(true);
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/models', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setModelsList(data);

                    // Ensure valid selection — prefer an available model
                    const isSelectedAvailable = data.some((m: any) => m.name === defaultModel && m.available);
                    if (!isSelectedAvailable && data.length > 0) {
                        const fallbackModel = data.find((m: any) => m.available && m.name.includes('gemini-3.1-flash-lite'))?.name
                            || data.find((m: any) => m.available)?.name
                            || defaultModel;
                        setDefaultModel(fallbackModel);
                        localStorage.setItem('default_gemini_model', fallbackModel);
                    }
                }
            } catch (error) {
                console.error("Failed to load models:", error);
            } finally {
                setIsLoadingModels(false);
            }
        };

        if (activeTab === 'settings') {
            fetchModels();
        }
    }, [user, activeTab]);

    // Check 2FA status on mount
    useEffect(() => {
        const check2FA = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/auth/2fa/status', {
                    method: 'POST',
                    headers: {'Authorization': `Bearer ${token}`}
                });
                if (res.ok) {
                    const data = await res.json();
                    setTwoFAEnabled(data.enabled);
                }
            } catch {
            }
        };
        check2FA();
    }, [user]);

    const handleDefaultModelChange = (value: string) => {
        const model = models.find(m => m.name === value);
        if (model && !model.available) {
            showError('That model is not available. Set the API key for this provider in .env.');
            return;
        }
        setDefaultModel(value);
        localStorage.setItem('default_gemini_model', value);
        const displayName = model?.displayName || value;
        showSuccess(`Default AI Model updated to: ${displayName}`);
        setIsModelModalOpen(false);
    };

    // Password fields state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [retypeNewPassword, setRetypeNewPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const initialSyncDone = useRef(false);

    // Sync state with user context on first load only — avoid overwriting unsaved edits
    useEffect(() => {
        if (user && !initialSyncDone.current) {
            setName(user.name || '');
            setAddress(user.address || '');
            initialSyncDone.current = true;
        }
    }, [user]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            showError('Name cannot be empty');
            return;
        }

        try {
            setIsUpdatingProfile(true);
            const token = await user?.getIdToken();
            const res = await fetch('/api/auth/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({name, address})
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to update profile');
            }

            updateUser({name: data.name, address: data.address});
            showSuccess('Profile updated successfully!');
        } catch (err: any) {
            showError(err.message || 'An error occurred while updating profile');
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword || !newPassword || !retypeNewPassword) {
            showError('Please fill in all password fields');
            return;
        }

        if (newPassword !== retypeNewPassword) {
            showError('New passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            showError('New password must be at least 8 characters long');
            return;
        }

        try {
            setIsChangingPassword(true);
            const token = await user?.getIdToken();
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({currentPassword, newPassword})
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to change password');
            }

            showSuccess('Password changed successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setRetypeNewPassword('');
        } catch (err: any) {
            showError(err.message || 'An error occurred while changing password');
        } finally {
            setIsChangingPassword(false);
        }
    };

    // ─── 2FA Handlers ──────────────────────────────────────────────────────────
    const handle2FASetup = useCallback(async () => {
        if (!user) return;
        try {
            setTwoFASetupLoading(true);
            setTwoFADialogOpen(true);
            const token = await user.getIdToken();
            const res = await fetch('/api/auth/2fa/setup', {
                method: 'POST',
                headers: {'Authorization': `Bearer ${token}`}
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start 2FA setup');
            setTwoFASecret(data.secret);
            setTwoFAQRCode(data.qrCodeDataUrl);
            setTwoFASetupStep('qr');
        } catch (err: any) {
            showError(err.message || 'Failed to start 2FA setup');
        } finally {
            setTwoFASetupLoading(false);
        }
    }, [user]);

    const handle2FAVerify = useCallback(async () => {
        if (!user || twoFACode.length !== 6) return;
        try {
            setTwoFASetupLoading(true);
            const token = await user.getIdToken();
            const res = await fetch('/api/auth/2fa/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({code: twoFACode})
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid code');
            setTwoFAEnabled(true);
            setTwoFASetupStep('done');
            setTwoFACode('');
            showSuccess('Two-factor authentication enabled!');
            setTimeout(() => {
                setTwoFADialogOpen(false);
                setTwoFASetupStep('idle');
            }, 2000);
        } catch (err: any) {
            showError(err.message || 'Invalid code');
        } finally {
            setTwoFASetupLoading(false);
        }
    }, [user, twoFACode]);

    const handle2FADisable = useCallback(async () => {
        if (!user || twoFADisableCode.length !== 6) return;
        try {
            setTwoFASetupLoading(true);
            const token = await user.getIdToken();
            const res = await fetch('/api/auth/2fa/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({code: twoFADisableCode})
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid code');
            setTwoFAEnabled(false);
            setTwoFADisableDialogOpen(false);
            setTwoFADisableCode('');
            setTwoFASecret('');
            setTwoFAQRCode('');
            showSuccess('Two-factor authentication disabled');
        } catch (err: any) {
            showError(err.message || 'Invalid code');
        } finally {
            setTwoFASetupLoading(false);
        }
    }, [user, twoFADisableCode]);

    const copySecret = useCallback(() => {
        navigator.clipboard.writeText(twoFASecret);
        showSuccess('Secret copied to clipboard');
    }, [twoFASecret]);

    return (
        <div className="flex-1 overflow-y-auto bg-[#030712] text-slate-200 p-6 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-start gap-3">
                    <Link to="/dashboard"
                          className="p-2 mt-1 bg-slate-900 hover:bg-slate-800 border border-[#21262d] rounded-xl text-slate-400 hover:text-white transition-all shrink-0">
                        <ArrowLeft className="h-4 w-4"/>
                    </Link>
                    <div className="flex-1">
                        <PageHeader
                            icon={UserIcon}
                            badge="User Profile"
                            color="indigo"
                            title="Account &"
                            titleAccent="Settings"
                            description="Manage your personal settings and security password."
                            actions={
                                <div
                                    className="hidden sm:flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 rounded-full text-indigo-400 text-xs font-mono">
                                    <ShieldCheck className="h-4 w-4"/>
                                    <span>Profile Secured</span>
                                </div>
                            }
                        />
                    </div>
                </div>

                {/* Profile Card & Forms Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

                    {/* User Meta Summary Card */}
                    <div
                        className="md:col-span-4 lg:col-span-4 xl:col-span-3 bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 flex flex-col items-center text-center h-fit">
                        <div className="relative mb-4">
                            {user?.picture ? (
                                <img src={user.picture} alt="Profile"
                                     className="w-24 h-24 rounded-full ring-4 ring-indigo-500/30 object-cover"/>
                            ) : (
                                <div
                                    className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-medium text-3xl ring-4 ring-indigo-500/30">
                                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                                </div>
                            )}
                            <div
                                className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-emerald-500 border-4 border-[#0d1117] flex items-center justify-center">
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse"/>
                            </div>
                        </div>

                        <h2 className="text-lg font-bold text-[#f0f6fc] tracking-tight leading-snug mb-2">{user?.name}</h2>

                        {user?.isPremium ? (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-violet-400 bg-violet-500/15 px-2 py-0.5 rounded-md border border-violet-500/30">
                  <Crown className="w-3 h-3"/>
                  Premium
                </span>
                        ) : (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-500/15 px-2 py-0.5 rounded-md border border-slate-500/30">
                  Basic
                </span>
                        )}

                        <div className="w-full border-t border-[#21262d] mt-6 pt-6 space-y-4 text-left">
                            <div className="flex items-center gap-3">
                                <Mail className="h-4 w-4 text-slate-500 shrink-0"/>
                                <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Verified Email</span>
                                    <p className="text-xs text-slate-300 break-all">{user?.email}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <MapPin className="h-4 w-4 text-slate-500 shrink-0"/>
                                <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Workstation Address</span>
                                    <p className="text-xs text-slate-300">{user?.address || 'Not specified yet'}</p>
                                </div>
                            </div>
                        </div>

                        {user?.gamification && (
                            <div className="w-full border-t border-[#21262d] mt-6 pt-6 space-y-4 text-left">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Trophy className="h-4 w-4 text-indigo-400"/>
                                        <span
                                            className="text-xs font-bold text-slate-300">Level {user.gamification.level}</span>
                                    </div>
                                    <span className="text-xs text-slate-500 font-mono">{user.gamification.xp} XP</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500"
                                         style={{width: `${(user.gamification.xp / (user.gamification.level * 200)) * 100}%`}}></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <div
                                        className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1 items-center justify-center text-center">
                                        <Flame className="h-4 w-4 text-orange-500"/>
                                        <span
                                            className="text-sm font-bold text-white">{user.gamification.currentStreak}</span>
                                        <span
                                            className="text-[9px] uppercase tracking-wider text-slate-500">Day Streak</span>
                                    </div>
                                    <div
                                        className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1 items-center justify-center text-center">
                                        <Star className="h-4 w-4 text-yellow-500"/>
                                        <span
                                            className="text-sm font-bold text-white">{user.gamification.earnedBadges?.length || 0}</span>
                                        <span
                                            className="text-[9px] uppercase tracking-wider text-slate-500">Badges</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="w-full border-t border-[#21262d] mt-6 pt-6">
                            <Button
                                onClick={async () => {
                                    try {
                                        await logout();
                                        showSuccess("Logged out successfully");
                                        navigate("/login");
                                    } catch (err: any) {
                                        showError("Failed to log out");
                                    }
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white font-medium text-sm transition-all"
                            >
                                <LogOut className="h-4 w-4"/>
                                Sign Out
                            </Button>
                        </div>
                    </div>

                    {/* Profile Forms & Achievements */}
                    <div className="md:col-span-8 lg:col-span-8 xl:col-span-9 space-y-6">

                        {/* Tabs - stacked on mobile, horizontal on desktop */}
                        <div className="block sm:flex gap-2 p-1 bg-[#0d1117] border border-[#21262d] rounded-2xl">
                            <button
                                onClick={() => setActiveTab('achievements')}
                                className={`w-full sm:flex-1 py-2 text-sm font-bold rounded-xl sm:rounded-r-none transition-all flex items-center justify-center gap-2 ${activeTab === 'achievements' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5 sm:rounded-xl'}`}
                            >
                                <Trophy className="w-4 h-4"/>
                                <span className="sm:inline">Achievements</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('settings')}
                                className={`w-full sm:flex-1 py-2 text-sm font-bold rounded-xl sm:rounded-r-none transition-all flex items-center justify-center gap-2 ${activeTab === 'settings' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5 sm:rounded-xl'}`}
                            >
                                <UserIcon className="w-4 h-4"/>
                                <span className="sm:inline">Settings</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('personalities')}
                                className={`w-full sm:flex-1 py-2 text-sm font-bold rounded-xl sm:rounded-r-none transition-all flex items-center justify-center gap-2 ${activeTab === 'personalities' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5 sm:rounded-xl'}`}
                            >
                                <Target className="w-4 h-4"/>
                                <span className="sm:inline">AI Personalities</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('premium')}
                                className={`w-full sm:flex-1 py-2 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'premium' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5 rounded-r-none'}`}
                            >
                                <Crown className="w-4 h-4"/>
                                <span>Premium</span>
                            </button>
                        </div>

                        {activeTab === 'settings' && (
                            <div className="space-y-8">
                                {/* General Settings */}
                                <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-6">
                                    <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                                        <UserIcon className="h-5 w-5 text-indigo-400"/>
                                        <h3 className="text-lg font-bold text-[#f0f6fc]">General Information</h3>
                                    </div>

                                    <form onSubmit={handleUpdateProfile} className="space-y-5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div className="space-y-2">
                                                <label
                                                    className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Full
                                                    Name</label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="Enter your name"
                                                    className="w-full px-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm transition-all"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label
                                                    className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Email
                                                    Address (Read-only)</label>
                                                <input
                                                    type="email"
                                                    value={user?.email || ''}
                                                    disabled
                                                    className="w-full px-4 py-2.5 bg-[#161b22] border border-[#21262d] rounded-xl text-slate-400 cursor-not-allowed text-sm focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label
                                                className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Address</label>
                                            <textarea
                                                value={address}
                                                onChange={(e) => setAddress(e.target.value)}
                                                placeholder="Enter your workstation/billing address"
                                                rows={3}
                                                className="w-full px-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm transition-all resize-none"
                                            />
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            <Button
                                                type="submit"
                                                disabled={isUpdatingProfile}
                                                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-all"
                                            >
                                                {isUpdatingProfile ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin"/>
                                                        Saving...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="h-4 w-4"/>
                                                        Save Changes
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </form>
                                </div>

                                {/* Change Password */}
                                <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-6">
                                    <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                                        <Key className="h-5 w-5 text-emerald-400"/>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-[#f0f6fc]">Security & Credentials</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">Keep your account safe by
                                                updating your password regularly.</p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleChangePassword} className="space-y-5">
                                        <div className="space-y-2">
                                            <label
                                                className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Current
                                                Password</label>
                                            <div className="relative">
                                                <input
                                                    type="password"
                                                    value={currentPassword}
                                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm transition-all"
                                                />
                                                <Lock
                                                    className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div className="space-y-2">
                                                <label
                                                    className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">New
                                                    Password</label>
                                                <div className="relative">
                                                    <input
                                                        type="password"
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        placeholder="••••••••"
                                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm transition-all"
                                                    />
                                                    <Lock
                                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label
                                                    className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Retype
                                                    New Password</label>
                                                <div className="relative">
                                                    <input
                                                        type="password"
                                                        value={retypeNewPassword}
                                                        onChange={(e) => setRetypeNewPassword(e.target.value)}
                                                        placeholder="••••••••"
                                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm transition-all"
                                                    />
                                                    <Lock
                                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            <Button
                                                type="submit"
                                                disabled={isChangingPassword}
                                                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all"
                                            >
                                                {isChangingPassword ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin"/>
                                                        Updating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Key className="h-4 w-4"/>
                                                        Change Password
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </form>
                                </div>

                                {/* Two-Factor Authentication */}
                                <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-6">
                                    <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                                        <Smartphone className="h-5 w-5 text-amber-400"/>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-[#f0f6fc]">Two-Factor
                                                Authentication</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">Add an extra layer of security
                                                with an authenticator app.</p>
                                        </div>
                                        {twoFAEnabled ? (
                                            <span
                                                className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold font-mono">ENABLED</span>
                                        ) : (
                                            <span
                                                className="px-3 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-xs font-semibold font-mono">OFF</span>
                                        )}
                                    </div>

                                    <p className="text-sm text-slate-400">
                                        {twoFAEnabled
                                            ? "Two-factor authentication is active. You'll need your authenticator app code each time you sign in."
                                            : "Protect your account by requiring a verification code from your authenticator app when signing in."}
                                    </p>

                                    <div className="flex justify-end pt-2">
                                        {twoFAEnabled ? (
                                            <Button
                                                onClick={() => setTwoFADisableDialogOpen(true)}
                                                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm transition-all"
                                            >
                                                <Smartphone className="h-4 w-4"/>
                                                Disable 2FA
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={handle2FASetup}
                                                disabled={twoFASetupLoading}
                                                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-all"
                                            >
                                                {twoFASetupLoading ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin"/>
                                                        Setting up...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Smartphone className="h-4 w-4"/>
                                                        Enable 2FA
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Premium Features Section */}
                                {user?.isPremium && (
                                    <div
                                        className="bg-violet-500/10 border border-violet-500/20 rounded-3xl p-6 md:p-8 space-y-6">
                                        <div className="flex items-center gap-3 border-b border-violet-500/30 pb-4">
                                            <Crown className="h-5 w-5 text-violet-400"/>
                                            <h3 className="text-lg font-bold text-[#f0f6fc]">Premium Features</h3>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                                                <h4 className="text-sm font-bold text-violet-300 mb-2">Unlimited
                                                    Sessions</h4>
                                                <p className="text-xs text-slate-400">No limits on AI-powered scheduling
                                                    sessions per day.</p>
                                            </div>
                                            <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                                                <h4 className="text-sm font-bold text-violet-300 mb-2">Advanced
                                                    Analytics</h4>
                                                <p className="text-xs text-slate-400">Detailed insights and productivity
                                                    reports.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Default AI Brain Model Selector Card */}
                                <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-6">
                                    <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                                        <Cpu className="h-5 w-5 text-indigo-400"/>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-[#f0f6fc]">AI Brain Configuration</h3>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Choose the default model used for task analysis, subtask generation,
                                                quest planning, and daily routine rescheduling.
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/40 border border-[#21262d] hover:border-indigo-500/30 transition-all">
                                        <div className="space-y-1">
                                            <span
                                                className="text-[10px] text-indigo-400 uppercase tracking-wider font-mono font-bold">Active Workspace Default Brain</span>
                                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"/>
                                                {models.find(m => m.name === defaultModel)?.displayName || defaultModel.replace(/^models\//, '')}
                                            </div>
                                        </div>

                                        <Dialog open={isModelModalOpen} onOpenChange={setIsModelModalOpen}>
                                            <DialogTrigger
                                                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-500/15 border border-indigo-500/20 cursor-pointer">
                                                <Cpu className="h-4 w-4"/>
                                                Configure Brain
                                            </DialogTrigger>
                                            <DialogContent
                                                className="sm:max-w-[480px] bg-[#0d1117] text-[#c9d1d9] border-[#30363d] rounded-3xl shadow-2xl p-6">
                                                <DialogHeader className="border-b border-[#21262d] pb-4">
                                                    <DialogTitle
                                                        className="text-[#f0f6fc] text-xl flex items-center gap-2">
                                                        <Cpu className="h-5 w-5 text-indigo-400"/>
                                                        Select Default AI Model
                                                    </DialogTitle>
                                                    <p className="text-slate-400 text-xs mt-1">This setting changes the
                                                        default brain model used globally for all automated planning and
                                                        execution features except chat.</p>
                                                </DialogHeader>

                                                <div className="space-y-3 my-5 max-h-[300px] overflow-y-auto pr-1">
                                                    {isLoadingModels && models.length === 0 ? (
                                                        <div
                                                            className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
                                                            <Loader2 className="h-6 w-6 animate-spin text-indigo-500"/>
                                                            <span
                                                                className="text-xs font-mono">Syncing active models...</span>
                                                        </div>
                                                    ) : (
                                                        (() => {
                                                            const modelList = models.length > 0 ? models : [
                                                                {
                                                                    name: "gemini-3.5-flash",
                                                                    displayName: "Gemini 3.5 Flash",
                                                                    provider: "Google Gemini",
                                                                    available: true
                                                                },
                                                                {
                                                                    name: "gemini-3.1-flash-lite",
                                                                    displayName: "Gemini 3.1 Flash Lite",
                                                                    provider: "Google Gemini",
                                                                    available: true
                                                                },
                                                                {
                                                                    name: "gemini-3.1-pro-preview",
                                                                    displayName: "Gemini 3.1 Pro (Preview)",
                                                                    provider: "Google Gemini",
                                                                    available: true
                                                                },
                                                            ];
                                                            const grouped = new Map<string, typeof modelList>();
                                                            for (const m of modelList) {
                                                                const provider = m.provider || 'Unknown';
                                                                if (!grouped.has(provider)) grouped.set(provider, []);
                                                                grouped.get(provider)!.push(m);
                                                            }
                                                            return Array.from(grouped.entries()).map(([provider, providerModels]) => (
                                                                <div key={provider}>
                                                                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 mt-1">{provider}</p>
                                                                    <div className="space-y-2">
                                                                        {providerModels.map((model) => {
                                                                            const isSelected = model.name === defaultModel;
                                                                            return (
                                                                                <button
                                                                                    key={model.name}
                                                                                    onClick={() => handleDefaultModelChange(model.name)}
                                                                                    type="button"
                                                                                    disabled={!model.available}
                                                                                    className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                                                                                        !model.available
                                                                                            ? 'bg-slate-900/20 border-[#21262d] text-slate-600 opacity-50 cursor-not-allowed'
                                                                                            : isSelected
                                                                                                ? 'bg-indigo-500/10 border-indigo-500 text-white'
                                                                                                : 'bg-slate-900/40 border-[#21262d] hover:border-[#30363d] hover:bg-slate-900/80 text-slate-300'
                                                                                    }`}
                                                                                >
                                                                                    <div className="space-y-1">
                                                                                        <p className="text-sm font-bold">{model.displayName}</p>
                                                                                        <p className="text-[10px] font-mono text-slate-500">{model.name}</p>
                                                                                        {!model.available &&
                                                                                            <p className="text-[9px] text-slate-600">Set
                                                                                                the API key for this
                                                                                                provider in .env</p>}
                                                                                    </div>
                                                                                    {isSelected && model.available && (
                                                                                        <Check
                                                                                            className="h-5 w-5 text-indigo-400 shrink-0"/>
                                                                                    )}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ));
                                                        })()
                                                    )}
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'achievements' && (
                            <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-8">
                                <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                                    <Trophy className="h-6 w-6 text-yellow-500"/>
                                    <h3 className="text-xl font-bold text-[#f0f6fc]">Achievement Badges</h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {ACHIEVEMENTS.map((achievement) => {
                                        const isEarned = user?.gamification?.earnedBadges?.includes(achievement.id);
                                        let Icon = Trophy;
                                        if (achievement.icon === 'Flame') Icon = Flame;
                                        if (achievement.icon === 'CheckCircle') Icon = CheckCircle;
                                        if (achievement.icon === 'Clock') Icon = Clock;
                                        if (achievement.icon === 'Headphones') Icon = Headphones;

                                        const tierColors = {
                                            'Common': 'from-slate-500 to-slate-400 border-slate-500 text-slate-100',
                                            'Rare': 'from-blue-600 to-blue-400 border-blue-500 text-blue-100',
                                            'Epic': 'from-purple-600 to-purple-400 border-purple-500 text-purple-100',
                                            'Legendary': 'from-orange-500 to-yellow-400 border-yellow-500 text-yellow-100'
                                        };

                                        return (
                                            <div
                                                key={achievement.id}
                                                className={`relative flex flex-col items-center p-5 rounded-2xl border transition-all ${
                                                    isEarned
                                                        ? 'bg-[#161b22] border-[#30363d] shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:border-indigo-500/50'
                                                        : 'bg-[#0a0d14] border-[#161b22] opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
                                                }`}
                                            >
                                                <div
                                                    className={`w-14 h-14 rounded-full bg-gradient-to-br ${tierColors[achievement.tier]} flex items-center justify-center mb-4 shadow-lg border-2 ${isEarned ? 'animate-pulse-slow' : ''}`}>
                                                    <Icon
                                                        className={`h-7 w-7 ${isEarned ? 'drop-shadow-md' : 'opacity-50'}`}/>
                                                </div>
                                                <h4 className="text-sm font-bold text-white text-center mb-1">{achievement.name}</h4>
                                                <p className="text-xs text-slate-400 text-center mb-3">{achievement.description}</p>

                                                <div
                                                    className="mt-auto w-full flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
                                                    <span className="text-indigo-400">{achievement.category}</span>
                                                    <span
                                                        className={`${isEarned ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {isEarned ? 'Unlocked' : 'Locked'}
                        </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/** Premium Subscription Tab */}
                        {activeTab === 'premium' && (
                            <PremiumTabContent/>
                        )}

                        {activeTab === 'personalities' && (
                            <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-8">
                                <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                                    <Target className="h-6 w-6 text-cyan-500"/>
                                    <h3 className="text-xl font-bold text-[#f0f6fc]">AI Personalities</h3>
                                </div>
                                <p className="text-sm text-slate-400">Unlock different AI personalities for Mission
                                    Control using your Gamification XP.</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {[
                                        {
                                            id: 'default',
                                            name: 'Standard Assistant',
                                            desc: 'Helpful, concise, and professional.',
                                            cost: 0,
                                            icon: UserIcon
                                        },
                                        {
                                            id: 'drill_sergeant',
                                            name: 'Strict Drill Sergeant',
                                            desc: 'Tough love, demanding, no excuses.',
                                            cost: 500,
                                            icon: Flame
                                        },
                                        {
                                            id: 'zen_guide',
                                            name: 'Zen Guide',
                                            desc: 'Calm, mindful, focus on process.',
                                            cost: 1000,
                                            icon: Target
                                        },
                                        {
                                            id: 'executive',
                                            name: 'Executive Assistant',
                                            desc: 'Hyper-organized, business-focused.',
                                            cost: 2000,
                                            icon: Briefcase
                                        }
                                    ].map((personality) => {
                                        const isUnlocked = user?.gamification?.unlockedPersonalities?.includes(personality.id) || personality.cost === 0;
                                        const isActive = user?.gamification?.activePersonality === personality.id || (!user?.gamification?.activePersonality && personality.id === 'default');
                                        const Icon = personality.icon;

                                        const handleUnlock = async () => {
                                            try {
                                                const token = await user?.getIdToken();
                                                const res = await fetch('/api/user/personalities/unlock', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${token}`
                                                    },
                                                    body: JSON.stringify({
                                                        personalityId: personality.id,
                                                        cost: personality.cost
                                                    })
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error);
                                                updateUser({gamification: data.gamification});
                                                showSuccess(`Unlocked ${personality.name}!`);
                                            } catch (err: any) {
                                                showError(err.message || 'Failed to unlock');
                                            }
                                        };

                                        const handleSelect = async () => {
                                            try {
                                                const token = await user?.getIdToken();
                                                const res = await fetch('/api/user/personalities/active', {
                                                    method: 'PUT',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${token}`
                                                    },
                                                    body: JSON.stringify({personalityId: personality.id})
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error);
                                                updateUser({gamification: data.gamification});
                                                showSuccess(`Active personality changed to ${personality.name}!`);
                                            } catch (err: any) {
                                                showError(err.message || 'Failed to set active personality');
                                            }
                                        };

                                        return (
                                            <div
                                                key={personality.id}
                                                className={`relative flex flex-col p-5 rounded-2xl border transition-all ${
                                                    isActive ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' :
                                                        isUnlocked ? 'bg-[#161b22] border-[#30363d] hover:border-indigo-500/50' : 'bg-[#0a0d14] border-[#161b22] opacity-80'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div
                                                        className={`p-2 rounded-full ${isActive ? 'bg-indigo-500 text-white' : isUnlocked ? 'bg-slate-800 text-slate-300' : 'bg-slate-900 text-slate-600'}`}>
                                                        <Icon className="w-5 h-5"/>
                                                    </div>
                                                    <h4 className="font-bold text-[#f0f6fc]">{personality.name}</h4>
                                                </div>
                                                <p className="text-xs text-slate-400 flex-1 mb-4">{personality.desc}</p>

                                                <div className="mt-auto flex items-center justify-between">
                                                    {!isUnlocked ? (
                                                        <span
                                                            className="text-xs font-bold text-yellow-500">{personality.cost} XP</span>
                                                    ) : (
                                                        <span
                                                            className="text-xs font-bold text-emerald-500">Unlocked</span>
                                                    )}

                                                    {!isUnlocked ? (
                                                        <Button
                                                            onClick={handleUnlock}
                                                            disabled={!user?.gamification?.xp || user.gamification.xp < personality.cost}
                                                            size="sm"
                                                            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3"
                                                        >
                                                            Unlock
                                                        </Button>
                                                    ) : isActive ? (
                                                        <span
                                                            className="text-xs font-bold text-indigo-400 uppercase tracking-wider px-2">Active</span>
                                                    ) : (
                                                        <Button
                                                            onClick={handleSelect}
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 rounded-lg px-3"
                                                        >
                                                            Select
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                    </div>

                </div>

            </div>

            {/* 2FA Setup Dialog */}
            <Dialog open={twoFADialogOpen} onOpenChange={(open) => {
                setTwoFADialogOpen(open);
                if (!open) {
                    setTwoFASetupStep('idle');
                    setTwoFACode('');
                    setTwoFASecret('');
                    setTwoFAQRCode('');
                }
            }}>
                <DialogContent
                    className="sm:max-w-[480px] bg-[#0d1117] text-[#c9d1d9] border-[#30363d] rounded-3xl shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#f0f6fc] text-xl">Set Up Two-Factor Authentication</DialogTitle>
                    </DialogHeader>

                    {twoFASetupStep === 'qr' && (
                        <div className="space-y-4 py-4">
                            <p className="text-sm text-slate-400 text-center">Scan this QR code with your authenticator
                                app (Google Authenticator, Authy, etc.)</p>
                            <div className="flex justify-center">
                                <div className="bg-white p-3 rounded-xl">
                                    <img src={twoFAQRCode} alt="2FA QR Code" className="w-48 h-48"/>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500 text-center">Or enter this secret manually:</p>
                                <div className="flex items-center gap-2">
                                    <code
                                        className="flex-1 text-xs bg-slate-900 border border-[#21262d] rounded-lg px-3 py-2 font-mono text-amber-300 break-all">{twoFASecret}</code>
                                    <Button onClick={copySecret} size="sm"
                                            className="shrink-0 h-8 px-3 rounded-lg bg-[#161b22] border border-[#21262d] hover:border-amber-500/30">
                                        <Copy className="h-3.5 w-3.5"/>
                                    </Button>
                                </div>
                            </div>
                            <Button onClick={() => setTwoFASetupStep('verify')}
                                    className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm">
                                I've scanned it — Next
                            </Button>
                        </div>
                    )}

                    {twoFASetupStep === 'verify' && (
                        <div className="space-y-4 py-4">
                            <p className="text-sm text-slate-400 text-center">Enter the 6-digit code from your
                                authenticator app to verify</p>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                autoFocus
                                value={twoFACode}
                                onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000"
                                className="w-full px-4 py-3 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-center text-lg font-mono tracking-[0.5em] transition-all"
                            />
                            <Button
                                onClick={handle2FAVerify}
                                disabled={twoFACode.length !== 6 || twoFASetupLoading}
                                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm"
                            >
                                {twoFASetupLoading ?
                                    <Loader2 className="h-4 w-4 animate-spin mx-auto"/> : "Verify & Enable"}
                            </Button>
                        </div>
                    )}

                    {twoFASetupStep === 'done' && (
                        <div className="py-6 text-center space-y-3">
                            <div
                                className="mx-auto w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                <CheckCircle className="h-6 w-6 text-emerald-400"/>
                            </div>
                            <p className="text-sm text-emerald-300 font-medium">Two-factor authentication is now
                                active!</p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* 2FA Disable Dialog */}
            <Dialog open={twoFADisableDialogOpen} onOpenChange={(open) => {
                setTwoFADisableDialogOpen(open);
                if (!open) setTwoFADisableCode('');
            }}>
                <DialogContent
                    className="sm:max-w-[420px] bg-[#0d1117] text-[#c9d1d9] border-[#30363d] rounded-3xl shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#f0f6fc] text-xl">Disable Two-Factor Authentication</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-slate-400">Enter a code from your authenticator app to confirm.</p>
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            autoFocus
                            value={twoFADisableCode}
                            onChange={(e) => setTwoFADisableCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000"
                            className="w-full px-4 py-3 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 text-center text-lg font-mono tracking-[0.5em] transition-all"
                        />
                        <div className="flex gap-3">
                            <Button onClick={() => setTwoFADisableDialogOpen(false)} variant="ghost"
                                    className="flex-1 h-10 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-[#161b22]">Cancel</Button>
                            <Button
                                onClick={handle2FADisable}
                                disabled={twoFADisableCode.length !== 6 || twoFASetupLoading}
                                className="flex-1 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm"
                            >
                                {twoFASetupLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto"/> : "Disable"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 2FA Setup Trigger Dialog (hidden, opened by button) */}
            <Dialog open={twoFADialogOpen && twoFASetupStep === 'idle'} onOpenChange={(open) => {
                setTwoFADialogOpen(open);
            }}>
                <DialogContent
                    className="sm:max-w-[480px] bg-[#0d1117] text-[#c9d1d9] border-[#30363d] rounded-3xl shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#f0f6fc] text-xl">Set Up Two-Factor Authentication</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-400"/>
                        <p className="text-sm text-slate-400 mt-3">Preparing your authenticator setup...</p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Premium Tab (self-contained) ────────────────────────────────────────────
function PremiumTabContent() {
    const {user, refreshPremiumStatus} = useAuth();
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);

    const isPremium = user?.isPremium;
    const expiry = user?.premiumExpiry;
    const plan = user?.subscriptionPlan;
    const remaining = expiry ? Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

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
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}
            });
            const data = await res.json();
            if (data.success) {
                showSuccess(data.message || 'Subscription cancelled');
                await refreshPremiumStatus();
                setConfirmCancel(false);
            } else showError(data.error || 'Failed to cancel');
        } catch {
            showError('Failed to cancel subscription');
        } finally {
            setCancelling(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* ── Status Banner ── */}
            <div className={`rounded-3xl p-6 md:p-8 border ${
                isPremium
                    ? 'bg-gradient-to-r from-violet-900/30 to-indigo-900/20 border-violet-500/30'
                    : 'bg-[#161b22] border-[#21262d]'
            }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div
                        className={`p-3 rounded-2xl ${isPremium ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-800 text-slate-400'}`}>
                        <Crown className="w-6 h-6"/>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-[#f0f6fc]">
                            {isPremium ? `${plan === 'annual' ? 'Annual' : 'Monthly'} Premium` : 'Free Tier'}
                        </h3>
                        <p className="text-sm text-slate-400">
                            {isPremium
                                ? `Active until ${new Date(expiry!).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                })} · ${remaining} days left`
                                : 'Upgrade for unlimited AI-powered productivity'}
                        </p>
                    </div>
                    {isPremium && remaining <= 7 && (
                        <div
                            className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0"/>
                            <span>Expires soon</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── AI Usage (Free Tier only) ── */}
            {!isPremium && user?.aiUsage && Object.keys(user.aiUsage).length > 0 && (
                <div className="bg-[#161b22] border border-[#21262d] rounded-3xl p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-4">
                        <BarChart3 className="h-5 w-5 text-cyan-400"/>
                        <h3 className="text-sm font-bold text-[#f0f6fc]">Today's AI Usage</h3>
                        <span className="text-[10px] text-slate-500 font-mono">(Free Tier)</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {Object.entries(user.aiUsage).map(([endpoint, {used, limit}]) => {
                            const name = endpoint.replace('/api/', '').replace(/-/g, ' ');
                            const pct = Math.min(100, (used / limit) * 100);
                            return (
                                <div key={endpoint} className="bg-[#0d1117] border border-[#21262d] rounded-xl p-3">
                                    <div
                                        className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 capitalize">{name}</div>
                                    <div className="flex items-end justify-between">
                                        <span
                                            className={`text-lg font-bold ${used >= limit ? 'text-rose-400' : used >= limit * 0.8 ? 'text-amber-400' : 'text-white'}`}>{used}</span>
                                        <span className="text-xs text-slate-500">/ {limit}</span>
                                    </div>
                                    <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-violet-500'}`}
                                            style={{width: `${pct}%`}}/>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3">Limits reset daily at midnight.</p>
                </div>
            )}

            {/* ── Switch to Premium / Manage Subscription ── */}
            {!isPremium ? (
                <Button
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold h-12 rounded-xl"
                >
                    <Crown className="w-4 h-4 mr-2"/>
                    Switch to Premium
                </Button>
            ) : (
                <div className="bg-[#161b22] border border-[#21262d] rounded-3xl p-6 md:p-8">
                    <h4 className="text-sm font-bold text-[#f0f6fc] mb-4 flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-violet-400"/>
                        Subscription Details
                    </h4>
                    <div className="space-y-3 text-sm mb-6">
                        <div className="flex justify-between"><span className="text-slate-400">Plan</span><span
                            className="text-white font-medium capitalize">{plan} Premium</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Status</span><span
                            className="text-emerald-400 font-medium">Active</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Expires</span><span
                            className="text-white font-medium">{new Date(expiry!).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                        })}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Days Left</span><span
                            className={`font-bold ${remaining <= 7 ? 'text-amber-400' : 'text-emerald-400'}`}>{remaining} days</span>
                        </div>
                    </div>
                    {confirmCancel ? (
                        <div className="flex gap-3">
                            <Button onClick={handleCancel} disabled={cancelling}
                                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold h-10 rounded-xl">
                                {cancelling ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Confirm Cancel'}
                            </Button>
                            <Button onClick={() => setConfirmCancel(false)} variant="outline"
                                    className="flex-1 border-slate-700 text-slate-300 h-10 rounded-xl">Keep</Button>
                        </div>
                    ) : (
                        <Button onClick={handleCancel} variant="outline"
                                className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-medium h-10 rounded-xl">Cancel
                            Subscription</Button>
                    )}
                </div>
            )}

            {/* ── Comparison Table ── */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-3xl p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="w-5 h-5 text-cyan-400"/>
                    <h3 className="text-sm font-bold text-[#f0f6fc]">Plan Comparison</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#21262d]">
                                <th className="text-left py-3 text-xs text-slate-400 font-medium">Feature</th>
                                <th className="text-center py-3 text-xs text-slate-400 font-medium">Free</th>
                                <th className="text-center py-3 text-xs text-violet-400 font-medium">Premium</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {[
                                ['AI Scheduling', '3/day', 'Unlimited'],
                                ['AI Chat Messages', '20/day', 'Unlimited'],
                                ['Task Analysis', '5/day', 'Unlimited'],
                                ['Daily Planner', '1/day', 'Unlimited'],
                                ['Focus Protocols', 'Pomodoro, Flowtime', 'All 5 modes'],
                                ['Priority Support', '—', 'Included'],
                            ].map(([feature, free, prem]) => (
                                <tr key={feature} className="border-b border-[#21262d]/50 last:border-0">
                                    <td className="py-3 text-slate-300">{feature}</td>
                                    <td className="py-3 text-center text-slate-500">{free}</td>
                                    <td className="py-3 text-center text-violet-400 font-bold">{prem}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!isPremium && (
                    <p className="text-[11px] text-slate-500 mt-4">Payments processed via Razorpay/UPI. Premium
                        activates immediately.</p>
                )}
            </div>

            {/* ── Payment Modal ── */}
            <PremiumPayment isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)}/>
        </div>
    );
}
