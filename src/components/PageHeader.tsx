import {LucideIcon} from 'lucide-react';
import {ReactNode} from 'react';

export type PageHeaderColor = 'indigo' | 'pink' | 'emerald' | 'cyan' | 'violet' | 'amber';

interface ColorClasses {
    badgeText: string;
    badgeIcon: string;
    accent: string;
}

// Static, fully-written class strings (Tailwind JIT needs literal classes, not dynamic ones)
const COLOR_MAP: Record<PageHeaderColor, ColorClasses> = {
    indigo: {badgeText: 'text-indigo-400', badgeIcon: 'text-indigo-400', accent: 'text-indigo-300'},
    pink: {badgeText: 'text-pink-400', badgeIcon: 'text-pink-400', accent: 'text-pink-300'},
    emerald: {badgeText: 'text-emerald-400', badgeIcon: 'text-emerald-400', accent: 'text-emerald-300'},
    cyan: {badgeText: 'text-cyan-400', badgeIcon: 'text-cyan-400', accent: 'text-cyan-300'},
    violet: {badgeText: 'text-violet-400', badgeIcon: 'text-violet-400', accent: 'text-violet-300'},
    amber: {badgeText: 'text-amber-400', badgeIcon: 'text-amber-400', accent: 'text-amber-300'},
};

interface PageHeaderProps {
    icon: LucideIcon;
    badge: string;
    color: PageHeaderColor;
    /** Main heading text (non-accented part) */
    title: ReactNode;
    /** Accented part of the heading, rendered in the page's accent color, italic + semibold */
    titleAccent?: ReactNode;
    description?: string;
    /** Right-aligned slot for page-specific controls (buttons, stats, status pills) */
    actions?: ReactNode;
}

export default function PageHeader({
                                       icon: Icon,
                                       badge,
                                       color,
                                       title,
                                       titleAccent,
                                       description,
                                       actions
                                   }: PageHeaderProps) {
    const c = COLOR_MAP[color];
    return (
        <header className="flex flex-col gap-3 border-b border-[#21262d] pb-6 mb-2">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-1.5">
                    <div
                        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest font-mono ${c.badgeText}`}>
                        <Icon className={`h-3.5 w-3.5 ${c.badgeIcon}`}/>
                        {badge}
                    </div>
                    <h1 className="text-3xl font-light text-white leading-tight">
                        {title}
                        {titleAccent && <span className={`font-semibold italic ${c.accent}`}> {titleAccent}</span>}
                    </h1>
                    {description && (
                        <p className="text-slate-400 text-sm max-w-xl mt-0.5">{description}</p>
                    )}
                </div>
                {actions && (
                    <div className="flex items-center gap-2 sm:gap-3">
                        {actions}
                    </div>
                )}
            </div>
        </header>
    );
}
