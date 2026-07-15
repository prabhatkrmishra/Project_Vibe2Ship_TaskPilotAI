import {useState} from 'react';
import {Star, Clock, Zap, Save, X} from 'lucide-react';
import type {FocusMethod} from '../types';
import {showSuccess, showError} from '../lib/toastTheme';

const METHOD_LABELS: Record<FocusMethod, string> = {
    pomodoro: 'Pomodoro', flowtime: 'Flowtime', '52-17': '52/17', ultradian: 'Ultradian', custom: 'Custom'
};

interface FocusSessionSummaryProps {
    method: FocusMethod;
    duration: number;         // seconds
    breaks: number;
    startedAt?: string;       // ISO string from timer
    taskTitle?: string;
    onSave: () => void;
    onDiscard: () => void;
}

export default function FocusSessionSummary({
                                                method, duration, breaks, startedAt, taskTitle, onSave, onDiscard
                                            }: FocusSessionSummaryProps) {
    const [rating, setRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const mins = Math.round(duration / 60);
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    const durationLabel = hrs > 0 ? `${hrs}h ${remainMins}m` : `${mins}m`;

    const handleSave = async () => {
        if (rating === 0 || saving) return;
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/focus-sessions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
                body: JSON.stringify({
                    method,
                    startedAt: startedAt || new Date(Date.now() - duration * 1000).toISOString(),
                    endedAt: new Date().toISOString(),
                    plannedDuration: 0,
                    actualDuration: duration,
                    breaks,
                    qualityRating: rating,
                    note: note.trim() || undefined,
                    completed: true,
                    taskTitle: taskTitle || undefined,
                }),
            });
            const text = await res.text();
            let data: any;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Server error (HTTP ${res.status})`);
            }
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            const xp = data.gamification?.xpEarned || 20;
            showSuccess(`Focus session saved! +${xp} XP`, {duration: 3000});
            onSave();
        } catch (e: any) {
            showError(e.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // XP preview: 20 base + 5 bonus if rated 4+
    const previewXp = rating >= 4 ? 25 : 20;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="bg-[#12161f] border border-slate-700/50 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-5 shadow-2xl">
                {/* Header */}
                <div className="text-center">
                    <div className="text-lg font-semibold text-slate-100">Session Complete</div>
                    <div className="text-xs text-slate-500 mt-1">How did that feel?</div>
                </div>

                {/* Stats row */}
                <div className="flex justify-center gap-6 text-center">
                    <div>
                        <div className="flex items-center justify-center gap-1 text-indigo-400">
                            <Clock className="h-4 w-4"/>
                            <span className="text-lg font-bold">{durationLabel}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{METHOD_LABELS[method]}</div>
                    </div>
                    {breaks > 0 && (
                        <div>
                            <div className="text-lg font-bold text-emerald-400">{breaks}</div>
                            <div className="text-[10px] text-slate-500">Breaks taken</div>
                        </div>
                    )}
                    {taskTitle && (
                        <div className="max-w-[120px]">
                            <div className="text-xs text-amber-400 truncate">{taskTitle}</div>
                            <div className="text-[10px] text-slate-500">Task</div>
                        </div>
                    )}
                </div>

                {/* Star rating */}
                <div className="flex justify-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                        <button key={star}
                                onMouseEnter={() => setHoveredStar(star)}
                                onMouseLeave={() => setHoveredStar(0)}
                                onClick={() => setRating(star)}
                                className="p-0.5 transition-transform hover:scale-110">
                            <Star className={`h-7 w-7 ${
                                star <= (hoveredStar || rating)
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-600'
                            }`}/>
                        </button>
                    ))}
                </div>
                {rating > 0 && (
                    <div className="text-center text-[10px] text-slate-500">
                        {rating <= 2 ? 'Tough session — happens to everyone.' :
                            rating === 3 ? 'Solid work.' :
                                rating === 4 ? 'Great focus!' :
                                    'Peak performance!'}
                        {rating >= 4 && <span className="text-indigo-400 ml-1">+5 bonus XP</span>}
                    </div>
                )}

                {/* Note */}
                <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Optional note — what did you accomplish?"
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none h-16 focus:outline-none focus:border-indigo-500/50"
                />

                {/* Actions */}
                <div className="flex gap-3">
                    <button onClick={onDiscard}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 text-sm transition-colors">
                        <X className="h-4 w-4"/> Discard
                    </button>
                    <button onClick={handleSave} disabled={rating === 0 || saving}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-sm font-medium transition-colors">
                        <Save className="h-4 w-4"/>
                        {saving ? 'Saving...' : 'Save Session'}
                    </button>
                </div>

                {/* XP preview */}
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                    <Zap className="h-3 w-3 text-indigo-400"/>
                    {rating >= 4 ? '25 XP (includes +5 quality bonus)' : '20 XP'}
                </div>
            </div>
        </div>
    );
}
