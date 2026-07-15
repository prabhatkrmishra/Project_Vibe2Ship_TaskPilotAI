import {useState, useEffect} from 'react';
import {useAuth} from '../lib/AuthContext';
import {showSuccess, showError} from '../lib/toastTheme';
import {
    Settings,
    Crown,
    Users,
    DollarSign,
    Tag,
    Loader2,
    Save,
    Trash2,
    Plus,
    ShieldCheck,
    ToggleLeft,
    ToggleRight,
    Search
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import {Button} from '../components/ui/button';
import {Link} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';

interface PlanConfig {
    _id: string;
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
    enabled: boolean;
}

interface SubStats {
    totalPremium: number;
    totalRevenue: number;
}

interface PremiumUser {
    email: string;
    name: string;
    isPremium: boolean;
    premiumExpiry: string;
    subscriptionPlan: string;
    subscriptionActive: boolean;
    subscriptions: any[];
    createdAt: string;
}

export function Admin() {
    const {user} = useAuth();
    const [activeTab, setActiveTab] = useState<'pricing' | 'users'>('pricing');
    const [plans, setPlans] = useState<PlanConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [stats, setStats] = useState<SubStats>({totalPremium: 0, totalRevenue: 0});
    const [premiumUsers, setPremiumUsers] = useState<PremiumUser[]>([]);
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [makeAdminLoading, setMakeAdminLoading] = useState(false);
    const [edits, setEdits] = useState<Record<string, Partial<PlanConfig>>>({});
    const [userSearch, setUserSearch] = useState('');
    const [userPage, setUserPage] = useState(0);
    const USERS_PER_PAGE = 10;

    const isAllowed = user?.role === 'admin';

    useEffect(() => {
        if (isAllowed) {
            fetchPlans();
            fetchStats();
        }
    }, [isAllowed]);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            const res = await fetch('/api/admin/pricing', {headers: {'Authorization': `Bearer ${token}`}});
            if (res.ok) {
                const data = await res.json();
                setPlans(data.plans);
            }
        } catch {
            showError('Failed to load pricing plans');
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const token = await user?.getIdToken();
            const res = await fetch('/api/admin/subscriptions', {headers: {'Authorization': `Bearer ${token}`}});
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats);
                setPremiumUsers(data.users);
            }
        } catch {
            showError('Failed to load subscription data');
        }
    };

    const updatePlan = async (planId: string, updates: Partial<PlanConfig>) => {
        setSaving(planId);
        try {
            const token = await user?.getIdToken();
            const res = await fetch(`/api/admin/pricing/${planId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
                body: JSON.stringify(updates)
            });
            if (res.ok) {
                showSuccess('Plan updated');
                setEdits(prev => {
                    const next = {...prev};
                    delete next[planId];
                    return next;
                });
                fetchPlans();
            } else {
                const err = await res.json();
                showError(err.error || 'Failed to update');
            }
        } catch {
            showError('Failed to update plan');
        } finally {
            setSaving(null);
        }
    };

    const toggleSale = (plan: PlanConfig) => {
        updatePlan(plan.planId, {
            saleActive: !plan.saleActive,
            salePrice: plan.salePrice ?? plan.basePrice
        });
    };

    const toggleEnabled = (plan: PlanConfig) => {
        updatePlan(plan.planId, {enabled: !plan.enabled});
    };

    const updateBasePrice = (plan: PlanConfig, price: number) => {
        updatePlan(plan.planId, {basePrice: price});
    };

    const updateSalePrice = (plan: PlanConfig, price: number) => {
        updatePlan(plan.planId, {salePrice: price});
    };

    const updateSaleLabel = (plan: PlanConfig, label: string) => {
        updatePlan(plan.planId, {saleLabel: label});
    };

    const getEdit = (plan: PlanConfig, field: keyof PlanConfig) => {
        return edits[plan.planId]?.[field] ?? plan[field];
    };

    const setEdit = (planId: string, field: keyof PlanConfig, value: any) => {
        setEdits(prev => ({...prev, [planId]: {...prev[planId], [field]: value}}));
    };

    const commitEdit = (plan: PlanConfig, field: keyof PlanConfig, updater: (plan: PlanConfig, val: any) => void) => {
        const val = edits[plan.planId]?.[field];
        if (val !== undefined && val !== plan[field]) {
            updater(plan, val);
        }
    };

    const handleMakeAdmin = async () => {
        if (!newAdminEmail) return;
        setMakeAdminLoading(true);
        try {
            const token = await user?.getIdToken();
            const res = await fetch('/api/admin/make-admin', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
                body: JSON.stringify({email: newAdminEmail})
            });
            const data = await res.json();
            if (res.ok) {
                showSuccess(data.message);
                setNewAdminEmail('');
            } else {
                showError(data.error || 'Failed');
            }
        } catch {
            showError('Failed');
        } finally {
            setMakeAdminLoading(false);
        }
    };

    if (!isAllowed) {
        return (
            <div className="flex-1 overflow-y-auto bg-[#030712] text-slate-200 p-6 md:p-8">
                <div className="max-w-4xl mx-auto text-center py-20 space-y-4">
                    <ShieldCheck className="w-16 h-16 text-rose-500 mx-auto"/>
                    <h2 className="text-2xl font-bold text-white">Access Denied</h2>
                    <p className="text-slate-400">You need admin privileges to access this page.</p>
                    <Link to="/dashboard">
                        <Button className="bg-indigo-600 hover:bg-indigo-500 text-white mt-4">Back to Dashboard</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-[#030712] text-slate-200 p-6 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-start gap-3">
                    <Link to="/dashboard"
                          className="p-2 mt-1 bg-slate-900 hover:bg-slate-800 border border-[#21262d] rounded-xl text-slate-400 hover:text-white transition-all shrink-0">
                        <ArrowLeft className="h-4 w-4"/>
                    </Link>
                    <div className="flex-1">
                        <PageHeader
                            icon={Settings}
                            badge="Admin Panel"
                            color="violet"
                            title="Admin"
                            titleAccent="Dashboard"
                            description="Manage pricing, subscriptions, and user access."
                        />
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-5 text-center">
                        <Users className="w-5 h-5 text-violet-400 mx-auto mb-2"/>
                        <div className="text-2xl font-bold text-white">{stats.totalPremium}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Premium Users</div>
                    </div>
                    <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-5 text-center">
                        <DollarSign className="w-5 h-5 text-emerald-400 mx-auto mb-2"/>
                        <div className="text-2xl font-bold text-white">₹{stats.totalRevenue.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Total Revenue</div>
                    </div>
                    <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-5 text-center">
                        <Crown className="w-5 h-5 text-amber-400 mx-auto mb-2"/>
                        <div className="text-2xl font-bold text-white">{plans.filter(p => p.enabled).length}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Active Plans</div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 p-1 bg-[#0d1117] border border-[#21262d] rounded-2xl">
                    <button onClick={() => setActiveTab('pricing')}
                            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'pricing' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        <Tag className="w-4 h-4"/> Pricing Management
                    </button>
                    <button onClick={() => setActiveTab('users')}
                            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'users' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        <Users className="w-4 h-4"/> Users & Admins
                    </button>
                </div>

                {/* Pricing Tab */}
                {activeTab === 'pricing' && (
                    <div className="space-y-6">
                        {loading ? (
                            <div className="flex items-center justify-center py-12"><Loader2
                                className="w-6 h-6 animate-spin text-violet-400"/></div>
                        ) : plans.map((plan) => (
                            <div key={plan.planId}
                                 className={`bg-[#0d1117] border rounded-3xl p-6 md:p-8 space-y-5 transition-all ${plan.enabled ? 'border-[#21262d]' : 'border-rose-500/30 opacity-60'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Crown className="w-5 h-5 text-violet-400"/>
                                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                                        {plan.popular && <span
                                            className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-md">Popular</span>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => toggleEnabled(plan)}
                                                className="text-slate-400 hover:text-white transition-colors"
                                                title={plan.enabled ? 'Disable' : 'Enable'}>
                                            {plan.enabled ? <ToggleRight className="w-8 h-8 text-emerald-400"/> :
                                                <ToggleLeft className="w-8 h-8 text-slate-600"/>}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="space-y-1">
                                        <label
                                            className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Base
                                            Price (₹)</label>
                                        <input type="number" value={String(getEdit(plan, 'basePrice'))}
                                               onChange={(e) => setEdit(plan.planId, 'basePrice', Number(e.target.value))}
                                               onBlur={() => commitEdit(plan, 'basePrice', updateBasePrice)}
                                               className="w-full px-3 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-white text-sm focus:outline-none focus:border-violet-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label
                                            className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Sale
                                            Price (₹)</label>
                                        <input type="number" value={String(getEdit(plan, 'salePrice') || '')}
                                               onChange={(e) => setEdit(plan.planId, 'salePrice', Number(e.target.value))}
                                               onBlur={() => commitEdit(plan, 'salePrice', updateSalePrice)}
                                               placeholder={String(plan.basePrice)}
                                               className="w-full px-3 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-white text-sm focus:outline-none focus:border-violet-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label
                                            className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Sale
                                            Label</label>
                                        <input type="text" value={String(getEdit(plan, 'saleLabel') || '')}
                                               onChange={(e) => setEdit(plan.planId, 'saleLabel', e.target.value)}
                                               onBlur={() => commitEdit(plan, 'saleLabel', updateSaleLabel)}
                                               placeholder="e.g. Launch Offer"
                                               className="w-full px-3 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-white text-sm focus:outline-none focus:border-violet-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label
                                            className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Status</label>
                                        <button onClick={() => toggleSale(plan)}
                                                className={`w-full px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                                                    plan.saleActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-[#21262d] text-slate-500'
                                                }`}>
                                            {plan.saleActive ? 'Sale Active' : 'Sale Off'}
                                        </button>
                                    </div>
                                </div>

                                {plan.saleActive && plan.salePrice && plan.salePrice < plan.basePrice && (
                                    <div
                                        className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                        <Tag className="w-4 h-4 text-emerald-400"/>
                                        <span className="text-emerald-300">
                      Users see ₹{plan.salePrice} (was ₹{plan.basePrice}) — {Math.round((1 - plan.salePrice / plan.basePrice) * 100)}% off
                                            {plan.saleLabel ? ` — "${plan.saleLabel}"` : ''}
                    </span>
                                    </div>
                                )}

                                {saving === plan.planId && (
                                    <div className="flex items-center gap-2 text-xs text-violet-400"><Loader2
                                        className="w-3 h-3 animate-spin"/> Saving...</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="space-y-6">
                        <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-violet-400"/> Make User Admin
                            </h3>
                            <div className="flex gap-3">
                                <input type="email" value={newAdminEmail}
                                       onChange={(e) => setNewAdminEmail(e.target.value)}
                                       placeholder="user@example.com"
                                       className="flex-1 px-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-white text-sm focus:outline-none focus:border-violet-500"/>
                                <Button onClick={handleMakeAdmin} disabled={makeAdminLoading || !newAdminEmail}
                                        className="bg-violet-600 hover:bg-violet-500 text-white font-bold">
                                    {makeAdminLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Grant Access'}
                                </Button>
                            </div>
                        </div>

                        <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Crown className="w-5 h-5 text-amber-400"/> Premium Subscribers ({premiumUsers.length})
                            </h3>
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"/>
                                <input type="text" value={userSearch} onChange={(e) => {
                                    setUserSearch(e.target.value);
                                    setUserPage(0);
                                }}
                                       placeholder="Search by name or email..."
                                       className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-[#21262d] rounded-xl text-white text-sm focus:outline-none focus:border-violet-500"/>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[#21262d]">
                                            <th className="text-left py-3 text-xs text-slate-500 font-medium">Name</th>
                                            <th className="text-left py-3 text-xs text-slate-500 font-medium">Email</th>
                                            <th className="text-center py-3 text-xs text-slate-500 font-medium">Plan</th>
                                            <th className="text-center py-3 text-xs text-slate-500 font-medium">Expiry</th>
                                            <th className="text-center py-3 text-xs text-slate-500 font-medium">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const q = userSearch.toLowerCase();
                                            const filtered = premiumUsers.filter(u =>
                                                u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
                                            );
                                            const totalPages = Math.ceil(filtered.length / USERS_PER_PAGE);
                                            const paged = filtered.slice(userPage * USERS_PER_PAGE, (userPage + 1) * USERS_PER_PAGE);

                                            if (paged.length === 0) {
                                                return <tr>
                                                    <td colSpan={5}
                                                        className="py-8 text-center text-slate-500">{filtered.length === 0 && userSearch ? 'No users match search' : 'No premium users yet'}</td>
                                                </tr>;
                                            }

                                            return paged.map((u, i) => (
                                                <tr key={i} className="border-b border-[#21262d]/50">
                                                    <td className="py-3 text-white font-medium">{u.name}</td>
                                                    <td className="py-3 text-slate-400 font-mono text-xs">{u.email}</td>
                                                    <td className="py-3 text-center"><span
                                                        className="text-xs font-bold uppercase text-violet-400 bg-violet-500/15 px-2 py-0.5 rounded-md">{u.subscriptionPlan || '-'}</span>
                                                    </td>
                                                    <td className="py-3 text-center text-xs text-slate-400">{u.premiumExpiry ? new Date(u.premiumExpiry).toLocaleDateString('en-IN') : '-'}</td>
                                                    <td className="py-3 text-center text-xs text-emerald-400 font-bold">₹{u.subscriptions?.reduce((sum: number, s: any) => sum + (s.amount || 0), 0) || 0}</td>
                                                </tr>
                                            ));
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                            {(() => {
                                const q = userSearch.toLowerCase();
                                const filtered = premiumUsers.filter(u =>
                                    u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
                                );
                                const totalPages = Math.ceil(filtered.length / USERS_PER_PAGE);
                                if (totalPages <= 1) return null;
                                return (
                                    <div className="flex items-center justify-between pt-3 border-t border-[#21262d]">
                                        <span
                                            className="text-xs text-slate-500">Page {userPage + 1} of {totalPages}</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => setUserPage(p => Math.max(0, p - 1))}
                                                    disabled={userPage === 0}
                                                    className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">Prev
                                            </button>
                                            <button onClick={() => setUserPage(p => Math.min(totalPages - 1, p + 1))}
                                                    disabled={userPage >= totalPages - 1}
                                                    className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">Next
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
