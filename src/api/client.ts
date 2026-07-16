const TOKEN_KEY = 'taskpilot_jwt';

function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export async function apiFetch<T = any>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(path, {...options, headers});

    if (!res.ok) {
        const body = await res.json().catch(() => ({error: res.statusText}));
        const err = new Error(body.error || body.message || `Request failed: ${res.status}`);
        (err as any).status = res.status;
        (err as any).body = body;
        throw err;
    }

    return res.json();
}

export const api = {
    get: <T = any>(path: string) => apiFetch<T>(path),
    post: <T = any>(path: string, data?: any) =>
        apiFetch<T>(path, {method: 'POST', body: data ? JSON.stringify(data) : undefined}),
    put: <T = any>(path: string, data?: any) =>
        apiFetch<T>(path, {method: 'PUT', body: data ? JSON.stringify(data) : undefined}),
    delete: <T = any>(path: string) => apiFetch<T>(path, {method: 'DELETE'}),
};
