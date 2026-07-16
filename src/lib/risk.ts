import type {RiskLevel} from '@/features/timetable/lib/sessionState.ts';

export function riskBadgeClass(level: RiskLevel): string {
    switch (level) {
        case 'high':
            return 'bg-destructive/15 text-destructive border-destructive/25';
        case 'medium':
            return 'bg-warning/15 text-warning border-warning/25';
        default:
            return 'bg-success/15 text-success border-success/25';
    }
}

export function riskColorClass(level: RiskLevel): string {
    switch (level) {
        case 'high':
            return 'bg-destructive';
        case 'medium':
            return 'bg-warning';
        default:
            return 'bg-success';
    }
}
