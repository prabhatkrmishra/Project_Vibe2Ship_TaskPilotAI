import {useState, useEffect, useCallback} from 'react';
import {focusApi} from '../api/focusSessions';

export function useFocusSessions() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const refreshSessions = useCallback(async () => {
        try {
            setLoading(true);
            const data = await focusApi.list({limit: 50});
            setSessions(data.sessions || []);
        } catch {
            setSessions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshStats = useCallback(async () => {
        try {
            const data = await focusApi.stats();
            setStats(data);
        } catch {
            setStats(null);
        }
    }, []);

    useEffect(() => {
        refreshSessions();
        refreshStats();
    }, [refreshSessions, refreshStats]);

    const createSession = async (data: any) => {
        const result = await focusApi.create(data);
        await refreshSessions();
        await refreshStats();
        return result;
    };

    return {sessions, stats, loading, refreshSessions, refreshStats, createSession};
}
