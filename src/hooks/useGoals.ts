import {useState, useEffect, useCallback} from 'react';
import {goalsApi} from '../api/goals';

export function useGoals() {
    const [goals, setGoals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await goalsApi.list();
            setGoals(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const createGoal = async (data: any) => {
        const goal = await goalsApi.create(data);
        setGoals(prev => [goal, ...prev]);
        return goal;
    };

    const updateGoal = async (id: string, data: any) => {
        const result = await goalsApi.update(id, data);
        setGoals(prev => prev.map(g => g.id === id ? {...g, ...result} : g));
        return result;
    };

    const deleteGoal = async (id: string) => {
        await goalsApi.delete(id);
        setGoals(prev => prev.filter(g => g.id !== id));
    };

    return {goals, loading, error, refresh, createGoal, updateGoal, deleteGoal};
}
