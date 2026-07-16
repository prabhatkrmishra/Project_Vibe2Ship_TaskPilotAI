import {LucideIcon} from 'lucide-react';
import {ReactNode} from 'react';

interface PageHeaderProps {
    icon: LucideIcon;
    badge: string;
    /** Kept for backward compat but no longer drives per-page color. */
    color?: string;
    title: ReactNode;
    titleAccent?: ReactNode;
    description?: string;
    actions?: ReactNode;
}

export default function PageHeader({
                                       icon: Icon,
                                       badge,
                                       title,
                                       titleAccent,
                                       description,
                                       actions
                                   }: PageHeaderProps) {
    return (
        <header className="flex flex-col gap-3 border-b border-[var(--panel-line)] pb-6 mb-2">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-1.5">
                    <div
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest font-mono text-[var(--violet)]">
                        <Icon className="h-3.5 w-3.5 text-[var(--violet)]"/>
                        {badge}
                    </div>
                    <h1 className="text-3xl font-light font-heading text-white leading-tight">
                        {title}
                        {titleAccent &&
                            <span className="font-semibold italic text-[var(--violet)]"> {titleAccent}</span>}
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
