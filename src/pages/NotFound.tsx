import {Link} from 'react-router-dom';
import {ArrowLeft, Compass, AlertCircle, Home} from 'lucide-react';
import {useAuth} from '../lib/AuthContext';

export function NotFound() {
    const {user} = useAuth();

    return (
        <div
            className="min-h-screen bg-[#030712] text-slate-200 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
            {/* Background visual art */}
            <div
                className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"/>
            <div
                className="absolute bottom-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none"/>

            {/* Grid lines background */}
            <div
                className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none"/>

            <div className="max-w-md w-full text-center space-y-8 relative z-10">
                {/* Animated Radar/Compass Container */}
                <div className="relative mx-auto w-32 h-32 flex items-center justify-center">
                    <div className="absolute inset-0 border border-slate-800 rounded-full animate-ping opacity-25"/>
                    <div className="absolute inset-2 border border-indigo-500/20 rounded-full"/>
                    <div className="absolute inset-6 border border-cyan-500/10 rounded-full"/>
                    <div
                        className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.3)] transform rotate-45 hover:rotate-180 transition-transform duration-1000">
                        <Compass className="h-8 w-8 text-white transform -rotate-45"/>
                    </div>
                    <div
                        className="absolute -top-1 -right-1 bg-red-500/10 border border-red-500/30 rounded-full p-1 text-red-400">
                        <AlertCircle className="h-4 w-4"/>
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="font-mono text-sm tracking-widest text-indigo-400 font-semibold uppercase">
                        Error Code: 404
                    </h1>
                    <h2 className="text-3xl sm:text-4xl font-light text-[#f0f6fc] tracking-tight">
                        Flight Path <span className="font-semibold text-cyan-400">Lost</span>
                    </h2>
                    <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
                        The coordinates you requested do not exist or have been re-routed in our autopilot matrix.
                    </p>
                </div>

                <div className="flex flex-col gap-3 max-w-xs mx-auto pt-4">
                    <Link
                        to={user ? "/dashboard" : "/"}
                        className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-white text-slate-950 font-medium hover:bg-slate-100 active:bg-slate-200 transition-colors shadow-lg"
                    >
                        <Home className="h-4 w-4"/> Return to Safety
                    </Link>
                    <Link
                        to="/"
                        className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-medium hover:bg-slate-800 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4"/> Back to Homepage
                    </Link>
                </div>

                <div className="flex justify-center gap-4 text-xs text-slate-600 pt-8 border-t border-slate-900">
                    <Link to="/privacy" className="hover:text-indigo-400 transition-colors">Privacy Policy</Link>
                    <span>•</span>
                    <Link to="/terms" className="hover:text-indigo-400 transition-colors">Terms of Service</Link>
                </div>
            </div>
        </div>
    );
}
