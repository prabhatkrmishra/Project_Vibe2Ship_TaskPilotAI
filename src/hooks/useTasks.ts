import {useState, useEffect, useCallback} from 'react';
import {tasksApi} from '../api/tasks';

export function useTasks() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await tasksApi.list();
            setTasks(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const createTask = async (data: any) => {
        const task = await tasksApi.create(data);
        setTasks(prev => [task, ...prev]);
        return task;
    };

    const updateTask = async (id: string, data: any) => {
        const result = await tasksApi.update(id, data);
        setTasks(prev => prev.map(t => t.id === id ? {...t, ...result} : t));
        return result;
    };

    const deleteTask = async (id: string) => {
        await tasksApi.delete(id);
        setTasks(prev => prev.filter(t => t.id !== id));
    };

    return {tasks, loading, error, refresh, createTask, updateTask, deleteTask};
}
