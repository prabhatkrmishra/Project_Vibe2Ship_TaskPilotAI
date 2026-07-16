import {useState, useEffect} from 'react';
import {Sparkles, RefreshCw, Plus, Trash2} from 'lucide-react';
import {Button} from './ui/button';
import {apiFetch} from '../lib/utils';

interface DopamineItem {
    _id: string;
    label: string;
    emoji: string;
    durationMinutes: number;
}

interface DopamineMenuProps {
    triggerLabel?: string;
}

export function DopamineMenu({triggerLabel = 'Need a reset?'}: DopamineMenuProps) {
    const [items, setItems] = useState<DopamineItem[]>([]);
    const [suggestions, setSuggestions] = useState<DopamineItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newEmoji, setNewEmoji] = useState('✨');
    const [showMenu, setShowMenu] = useState(false);

    const fetchItems = async () => {
        try {
            const token = localStorage.getItem('taskpilot_jwt');
            const res = await apiFetch('/api/dopamine-menu', {
                headers: {Authorization: `Bearer ${token}`}
            });
            if (res.ok) {
                const data = await res.json();
                setItems(data.allItems || []);
                setSuggestions(data.items || []);
            }
        } catch (e: any) {
            if (e?.name === 'TierUpgradeRequiredError') return;
            console.error('Failed to fetch dopamine menu:', e);
        }
    };

    useEffect(() => {
        if (showMenu) fetchItems();
    }, [showMenu]);

    const refreshSuggestions = () => {
        const shuffled = [...items].sort(() => 0.5 - Math.random());
        setSuggestions(shuffled.slice(0, 3));
    };

    const addItem = async () => {
        if (!newLabel.trim()) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('taskpilot_jwt');
            await apiFetch('/api/dopamine-menu', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
                body: JSON.stringify({label: newLabel, emoji: newEmoji, durationMinutes: 5})
            });
            setNewLabel('');
            setNewEmoji('✨');
            setShowAdd(false);
            await fetchItems();
        } catch (e: any) {
            if (e?.name === 'TierUpgradeRequiredError') return;
            console.error('Failed to add item:', e);
        }
        setLoading(false);
    };

    const deleteItem = async (id: string) => {
        try {
            const token = localStorage.getItem('taskpilot_jwt');
            await apiFetch(`/api/dopamine-menu/${id}`, {
                method: 'DELETE',
                headers: {Authorization: `Bearer ${token}`}
            });
            await fetchItems();
        } catch (e: any) {
            if (e?.name === 'TierUpgradeRequiredError') return;
            console.error('Failed to delete item:', e);
        }
    };

    return (
        <div className="relative">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMenu(!showMenu)}
                className="text-[var(--violet)] border-[var(--violet)]/30 hover:bg-[var(--violet)]/10 text-xs"
            >
                <Sparkles className="h-3 w-3 mr-1.5"/>
                {triggerLabel}
            </Button>

            {showMenu && (
                <div
                    className="absolute right-0 top-full mt-2 w-72 bg-[var(--graphite-900)] border border-[var(--panel-line)] rounded-xl shadow-2xl z-50 p-3">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--violet)] font-mono">
                            Quick Reset
                        </h4>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refreshSuggestions}>
                            <RefreshCw className="h-3 w-3 text-slate-400"/>
                        </Button>
                    </div>

                    <div className="space-y-2 mb-3">
                        {suggestions.map(item => (
                            <div
                                key={item._id}
                                className="flex items-center gap-2 p-2 rounded-lg bg-[var(--graphite-950)] hover:bg-[var(--panel-line)]/20 transition-colors"
                            >
                                <span className="text-lg">{item.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{item.label}</p>
                                    <p className="text-[10px] text-slate-500 font-mono">{item.durationMinutes} min</p>
                                </div>
                                <button onClick={() => deleteItem(item._id)}
                                        className="text-slate-600 hover:text-red-400 transition-colors p-1">
                                    <Trash2 className="h-3 w-3"/>
                                </button>
                            </div>
                        ))}
                    </div>

                    {showAdd ? (
                        <div className="flex gap-2">
                            <input
                                value={newEmoji}
                                onChange={e => setNewEmoji(e.target.value)}
                                className="w-10 text-center bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-lg text-sm"
                                maxLength={2}
                            />
                            <input
                                value={newLabel}
                                onChange={e => setNewLabel(e.target.value)}
                                placeholder="Activity..."
                                className="flex-1 bg-[var(--graphite-950)] border border-[var(--panel-line)] rounded-lg px-2 text-sm text-white placeholder-slate-500"
                                onKeyDown={e => e.key === 'Enter' && addItem()}
                            />
                            <Button size="sm" onClick={addItem} disabled={loading}
                                    className="bg-[var(--violet)] text-white text-xs">
                                Add
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAdd(true)}
                            className="w-full flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-[var(--panel-line)] text-xs text-slate-400 hover:text-white hover:border-[var(--violet)]/50 transition-colors"
                        >
                            <Plus className="h-3 w-3"/> Add to menu
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
