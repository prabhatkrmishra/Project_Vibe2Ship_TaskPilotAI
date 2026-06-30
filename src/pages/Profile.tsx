import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { toast } from 'sonner';
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
  Target
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { ACHIEVEMENTS, Achievement } from '../types';

export function Profile() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'achievements' | 'settings'>('achievements');

  // Profile fields state
  const [name, setName] = useState(user?.name || '');
  const [address, setAddress] = useState(user?.address || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [retypeNewPassword, setRetypeNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Sync state with user context if it loads late
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setAddress(user.address || '');
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name cannot be empty');
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
        body: JSON.stringify({ name, address })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      updateUser({ name: data.name, address: data.address });
      toast.success('Profile updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while updating profile');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !retypeNewPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (newPassword !== retypeNewPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
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
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setRetypeNewPassword('');
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while changing password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#030712] text-slate-200 p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Breadcrumb Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="p-2 bg-slate-900 hover:bg-slate-800 border border-[#21262d] rounded-xl text-slate-400 hover:text-white transition-all">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#f0f6fc] tracking-tight">User Profile</h1>
              <p className="text-slate-400 text-xs md:text-sm">Manage your personal settings and security password.</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 rounded-full text-indigo-400 text-xs font-mono">
            <ShieldCheck className="h-4 w-4" />
            <span>Profile Secured</span>
          </div>
        </div>

        {/* Profile Card & Forms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* User Meta Summary Card */}
          <div className="md:col-span-4 bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 flex flex-col items-center text-center h-fit">
            <div className="relative mb-4">
              {user?.picture ? (
                <img src={user.picture} alt="Profile" className="w-24 h-24 rounded-full ring-4 ring-indigo-500/30 object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-medium text-3xl ring-4 ring-indigo-500/30">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-emerald-500 border-4 border-[#0d1117] flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              </div>
            </div>

            <h2 className="text-lg font-bold text-[#f0f6fc] tracking-tight leading-snug">{user?.name}</h2>
            <p className="text-xs text-slate-400 font-mono mt-1 break-all px-2 py-0.5 rounded bg-slate-900 border border-slate-800/60 w-fit">{user?.email}</p>

            <div className="w-full border-t border-[#21262d] mt-6 pt-6 space-y-4 text-left">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Verified Email</span>
                  <p className="text-xs text-slate-300 break-all">{user?.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
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
                    <Trophy className="h-4 w-4 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-300">Level {user.gamification.level}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">{user.gamification.xp} XP</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${(user.gamification.xp / (user.gamification.level * 200)) * 100}%` }}></div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1 items-center justify-center text-center">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-bold text-white">{user.gamification.currentStreak}</span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500">Day Streak</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1 items-center justify-center text-center">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-bold text-white">{user.gamification.earnedBadges?.length || 0}</span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500">Badges</span>
                  </div>
                </div>
              </div>
            )}

            <div className="w-full border-t border-[#21262d] mt-6 pt-6">
              <Button 
                onClick={async () => {
                  try {
                    await logout();
                    toast.success("Logged out successfully");
                    navigate("/login");
                  } catch (err: any) {
                    toast.error("Failed to log out");
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white font-medium text-sm transition-all"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>

          {/* Profile Forms & Achievements */}
          <div className="md:col-span-8 space-y-6">
            
            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-[#0d1117] border border-[#21262d] rounded-2xl">
              <button
                onClick={() => setActiveTab('achievements')}
                className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'achievements' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Trophy className="w-4 h-4" />
                Achievements
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'settings' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <UserIcon className="w-4 h-4" />
                Settings
              </button>
            </div>
            
            {activeTab === 'settings' && (
              <div className="space-y-8">
                {/* General Settings */}
                <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-6">
                  <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                    <UserIcon className="h-5 w-5 text-indigo-400" />
                    <h3 className="text-lg font-bold text-[#f0f6fc]">General Information</h3>
                  </div>

              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Full Name</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Email Address (Read-only)</label>
                    <input 
                      type="email" 
                      value={user?.email || ''} 
                      disabled
                      className="w-full px-4 py-2.5 bg-[#161b22] border border-[#21262d] rounded-xl text-slate-400 cursor-not-allowed text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Address</label>
                  <textarea 
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter your workstation/billing address"
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all resize-none"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button 
                    type="submit" 
                    disabled={isUpdatingProfile}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all"
                  >
                    {isUpdatingProfile ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
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
                <Key className="h-5 w-5 text-emerald-400" />
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-[#f0f6fc]">Security & Credentials</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Keep your account safe by updating your password regularly.</p>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Current Password</label>
                  <div className="relative">
                    <input 
                      type="password" 
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                    />
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">New Password</label>
                    <div className="relative">
                      <input 
                        type="password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                      />
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Retype New Password</label>
                    <div className="relative">
                      <input 
                        type="password" 
                        value={retypeNewPassword}
                        onChange={(e) => setRetypeNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-[#21262d] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-all"
                      />
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
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
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4" />
                        Change Password
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
          )}

          {activeTab === 'achievements' && (
            <div className="bg-[#0d1117] border border-[#21262d] rounded-3xl p-6 md:p-8 space-y-8">
              <div className="flex items-center gap-3 border-b border-[#21262d] pb-4">
                <Trophy className="h-6 w-6 text-yellow-500" />
                <h3 className="text-xl font-bold text-[#f0f6fc]">Achievement Badges</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ACHIEVEMENTS.map((achievement) => {
                  const isEarned = user?.gamification?.earnedBadges?.includes(achievement.id);
                  let Icon = Trophy;
                  if (achievement.icon === 'Flame') Icon = Flame;
                  if (achievement.icon === 'CheckCircle') Icon = CheckCircle;
                  if (achievement.icon === 'Clock') Icon = Clock;

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
                      <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${tierColors[achievement.tier]} flex items-center justify-center mb-4 shadow-lg border-2 ${isEarned ? 'animate-pulse-slow' : ''}`}>
                        <Icon className={`h-7 w-7 ${isEarned ? 'drop-shadow-md' : 'opacity-50'}`} />
                      </div>
                      <h4 className="text-sm font-bold text-white text-center mb-1">{achievement.name}</h4>
                      <p className="text-xs text-slate-400 text-center mb-3">{achievement.description}</p>
                      
                      <div className="mt-auto w-full flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
                        <span className="text-indigo-400">{achievement.category}</span>
                        <span className={`${isEarned ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {isEarned ? 'Unlocked' : 'Locked'}
                        </span>
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
    </div>
  );
}
