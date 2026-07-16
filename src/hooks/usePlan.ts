import {useState, useEffect, useCallback} from 'react';
import {plansApi} from '../api/plans';

export function usePlan(date: string) {
    const [plan, setPlan] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await plansApi.get(date);
            setPlan(data);
        } catch (err: any) {
            if (err.status === 404) {
                setPlan(null);
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const upsertPlan = async (sessions: any[]) => {
        const result = await plansApi.upsert(date, sessions);
        setPlan(result);
        return result;
    };

    const deletePlan = async () => {
        await plansApi.delete(date);
        setPlan(null);
    };

    return {plan, loading, error, refresh, upsertPlan, deletePlan};
}
