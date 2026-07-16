import {X, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';

interface SessionEditorProps {
    editingIndex: number | null;
    editTitle: string;
    editStartTime: string;
    editEndTime: string;
    onTitleChange: (value: string) => void;
    onStartTimeChange: (value: string) => void;
    onEndTimeChange: (value: string) => void;
    onSave: () => void;
    onDelete: (index: number) => void;
    onClose: () => void;
}

export function SessionEditor({
                                  editingIndex,
                                  editTitle,
                                  editStartTime,
                                  editEndTime,
                                  onTitleChange,
                                  onStartTimeChange,
                                  onEndTimeChange,
                                  onSave,
                                  onDelete,
                                  onClose
                              }: SessionEditorProps) {
    if (editingIndex === null) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div
                className="bg-background border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-muted pb-3">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                        {editingIndex === -1 ? "✨ Add New Session" : "✏️ Edit Daily Session"}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-white rounded-md p-1 hover:bg-muted transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4"/>
                    </button>
                </div>

                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <label
                            className="text-[10px] font-bold font-mono text-muted-foreground uppercase tracking-wider block">
                            Session Title
                        </label>
                        <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => onTitleChange(e.target.value)}
                            placeholder="e.g. Morning Cardio, Deep Work, Reading"
                            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label
                                className="text-[10px] font-bold font-mono text-muted-foreground uppercase tracking-wider block">
                                Start Time
                            </label>
                            <input
                                type="time"
                                value={editStartTime}
                                onChange={(e) => onStartTimeChange(e.target.value)}
                                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label
                                className="text-[10px] font-bold font-mono text-muted-foreground uppercase tracking-wider block">
                                End Time
                            </label>
                            <input
                                type="time"
                                value={editEndTime}
                                onChange={(e) => onEndTimeChange(e.target.value)}
                                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-muted">
                    {editingIndex !== -1 ? (
                        <button
                            type="button"
                            onClick={() => {
                                onDelete(editingIndex);
                                onClose();
                            }}
                            className="text-xs font-bold text-destructive hover:text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <Trash2 className="w-3.5 h-3.5"/>
                            Delete
                        </button>
                    ) : (
                        <div/>
                    )}

                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="text-muted-foreground hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={onSave}
                            className="bg-primary hover:bg-primary/80 text-white rounded-xl font-bold text-xs uppercase tracking-widest px-4 py-2 transition-colors cursor-pointer"
                        >
                            Save Session
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
