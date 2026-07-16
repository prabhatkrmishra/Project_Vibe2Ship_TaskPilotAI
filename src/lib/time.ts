export function formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

export function isoToTimeStr(isoString: string): string {
    const match = isoString.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '12:00';
}

export function formatHourLabel(hour: number): string {
    return `${pad2(hour)}:00`;
}

export function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

export function minutesOfDay(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

export function timeToMinutes(date: Date | string): number {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.getHours() * 60 + d.getMinutes();
}

export function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleDateString();
}

export function formatDateLong(isoString: string, locale: string = 'en-US'): string {
    return new Date(isoString).toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export function formatDateShort(isoString: string, locale: string = 'en-IN'): string {
    return new Date(isoString).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

export function getTodayISO(): string {
    return new Date().toISOString().split('T')[0];
}

export function formatMinutes(mins: number): string {
    if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''}`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
