import {createContext, useContext, useEffect, useState} from 'react';
import {showSuccess, showError} from './toastTheme';

export interface CustomUser {
    uid: string;
    email: string;
    name: string;
    displayName?: string;
    picture?: string;
    address?: string;
    emailVerified?: boolean;
    gamification?: any; // Ideally import GamificationState but any for now
    isPremium?: boolean;
    premiumExpiry?: string | null;
    subscriptionPlan?: string | null;
    role?: string;
    aiUsage?: Record<string, { used: number; limit: number }>;
    getIdToken: () => Promise<string>;
}

interface AuthContextType {
    user: CustomUser | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name: string) => Promise<void>;
    loginAsGuest: () => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    getAccessToken: () => string | null;
    requestWorkspaceAccess: () => Promise<string | null>;
    disconnectWorkspaceAccess: () => void;
    updateUser: (updatedUser: { name?: string; address?: string; gamification?: any }) => void;
    refreshGamification: () => Promise<void>;
    refreshPremiumStatus: () => Promise<void>;
    refreshUser: () => Promise<void>;
    verify2FA: (tempToken: string, code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Cache the workspace access token in memory and local storage.
let cachedAccessToken: string | null = null;
try {
    cachedAccessToken = localStorage.getItem('workspace_access_token');
} catch (e) {
    console.warn('localStorage is not accessible');
}

export const AuthProvider = ({children}: { children: React.ReactNode }) => {
    const [user, setUser] = useState<CustomUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Helper to construct the compatible user object
    const makeUserObject = (userData: any, token: string): CustomUser => {
        return {
            uid: userData.uid,
            email: userData.email,
            name: userData.name,
            displayName: userData.name,
            picture: userData.picture,
            address: userData.address,
            emailVerified: userData.emailVerified,
            gamification: userData.gamification,
            isPremium: userData.isPremium,
            premiumExpiry: userData.premiumExpiry,
            subscriptionPlan: userData.subscriptionPlan,
            role: userData.role,
            aiUsage: userData.aiUsage,
            getIdToken: async () => localStorage.getItem('taskpilot_jwt') || token
        };
    };

    const refreshGamification = async () => {
        const token = localStorage.getItem('taskpilot_jwt');
        if (!token || !user) return;
        try {
            const res = await fetch('/api/auth/me', {
                headers: {'Authorization': `Bearer ${token}`}
            });
            if (res.ok) {
                const userData = await res.json();
                setUser(makeUserObject(userData, token));
            }
        } catch (err) {
            console.error("Failed to refresh user data:", err);
        }
    };

    const refreshPremiumStatus = refreshGamification;
    const refreshUser = refreshGamification;

    useEffect(() => {
        const fetchMe = async () => {
            const token = localStorage.getItem('taskpilot_jwt');
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const res = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (res.ok) {
                    const userData = await res.json();
                    setUser(makeUserObject(userData, token));
                } else {
                    // Token expired or invalid
                    localStorage.removeItem('taskpilot_jwt');
                    setUser(null);
                }
            } catch (err) {
                console.error("Failed to fetch current user:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchMe();
    }, []);

    useEffect(() => {
        const handleAuthMessage = async (event: MessageEvent) => {
            // Only accept the message if it came from our own window's origin —
            // the popup always posts back to window.opener's own origin, so this
            // is safe and tighter than allow-listing every *.run.app domain.
            if (event.origin !== window.location.origin) {
                return;
            }

            if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
                const {accessToken, taskpilotToken, user: googleUser} = event.data;
                cachedAccessToken = accessToken;
                localStorage.setItem('workspace_access_token', accessToken);

                if (taskpilotToken && googleUser) {
                    localStorage.setItem('taskpilot_jwt', taskpilotToken);
                    setUser(makeUserObject(googleUser, taskpilotToken));
                    showSuccess("Google Sign-In", "You have been successfully logged in with Google.");
                } else {
                    showSuccess("Workspace Access", "Your Google Workspace access has been authorized.");
                }
            }
        };

        window.addEventListener('message', handleAuthMessage);
        return () => window.removeEventListener('message', handleAuthMessage);
    }, []);

    const startWorkspaceOAuth = async (): Promise<string | null> => {
        try {
            const res = await fetch("/api/config");
            const {googleClientId} = await res.json();

            if (!googleClientId) {
                showError("Configuration Error", "Google Client ID is not configured on the server.");
                return null;
            }

            await new Promise<void>((resolve) => {
                if ((window as any).google?.accounts?.oauth2) return resolve();
                const script = document.createElement("script");
                script.src = "https://accounts.google.com/gsi/client";
                script.onload = () => resolve();
                document.head.appendChild(script);
            });

            return new Promise<string | null>((resolve) => {
                const client = (window as any).google.accounts.oauth2.initCodeClient({
                    client_id: googleClientId,
                    scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/tasks.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
                    ux_mode: "popup",
                    callback: async (response: any) => {
                        if (response.error) {
                            showError("Google Error", "Google Sign-In failed or was cancelled.");
                            resolve(null);
                            return;
                        }
                        if (response.code) {
                            try {
                                const headers: Record<string, string> = {"Content-Type": "application/json"};
                                const jwtToken = localStorage.getItem("taskpilot_jwt");
                                if (jwtToken) {
                                    headers["Authorization"] = `Bearer ${jwtToken}`;
                                }
                                const res = await fetch("/api/auth/google/callback", {
                                    method: "POST",
                                    headers,
                                    body: JSON.stringify({code: response.code}),
                                });
                                if (!res.ok) throw new Error(await res.text());

                                const authData = await res.json();

                                const {accessToken, taskpilotToken, user: googleUser} = authData;
                                cachedAccessToken = accessToken;
                                localStorage.setItem("workspace_access_token", accessToken);

                                if (taskpilotToken && googleUser) {
                                    localStorage.setItem("taskpilot_jwt", taskpilotToken);
                                    setUser(makeUserObject(googleUser, taskpilotToken));
                                    showSuccess("Google Sign-In", "You have been successfully logged in with Google.");
                                } else {
                                    showSuccess("Workspace Access", "Your Google Workspace access has been authorized.");
                                }
                                resolve(accessToken);
                            } catch (err: any) {
                                showError("Exchange Failed", "Failed to exchange authorization code: " + err.message);
                                resolve(null);
                            }
                        } else {
                            resolve(null);
                        }
                    },
                });

                client.requestCode();
            });
        } catch (error: any) {
            showError("Sign-In Error", "Failed to start Google Sign-In.");
            console.warn("Login start failed:", error);
            return null;
        }
    };

    const login = async (email: string, password: string) => {
        try {
            setLoading(true);
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, password})
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Login failed");
            }

            // 2FA required — throw with tempToken so Login component can handle it
            if (data.requires2FA) {
                const err = new Error("2FA_REQUIRED") as any;
                err.tempToken = data.tempToken;
                throw err;
            }

            localStorage.setItem('taskpilot_jwt', data.token);
            setUser(makeUserObject(data.user, data.token));
            showSuccess("Signed In", "You have been successfully logged in.");
        } catch (error: any) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const verify2FA = async (tempToken: string, code: string) => {
        try {
            setLoading(true);
            const res = await fetch('/api/auth/2fa/validate-login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({tempToken, code})
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Invalid code");
            localStorage.setItem('taskpilot_jwt', data.token);
            setUser(makeUserObject(data.user, data.token));
            showSuccess("Signed In", "You have been successfully logged in.");
        } catch (error: any) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const register = async (email: string, password: string, name: string) => {
        try {
            setLoading(true);
            const res = await fetch('/register/user', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, password, name})
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Registration failed");
            }

            localStorage.setItem('taskpilot_jwt', data.token);
            setUser(makeUserObject(data.user, data.token));
            showSuccess("Account Created", "Your account has been created successfully.");
        } catch (error: any) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const loginAsGuest = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/auth/guest', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Guest login failed");
            }

            localStorage.setItem('taskpilot_jwt', data.token);
            setUser(makeUserObject(data.user, data.token));
            showSuccess("Guest Login", "Welcome! You are now logged in as a guest.");
        } catch (error: any) {
            showError("Guest Login Failed", error.message || "Failed to sign in as guest.");
        } finally {
            setLoading(false);
        }
    };

    const loginWithGoogle = async () => {
        await startWorkspaceOAuth();
    };

    const requestWorkspaceAccess = async (): Promise<string | null> => {
        if (cachedAccessToken) return cachedAccessToken;
        return await startWorkspaceOAuth();
    };

    // Revokes only the cached Google Workspace access token (Calendar/Drive/
    // Docs/Sheets/Slides/Tasks scopes). Does NOT log the user out of TaskPilot
    // — a DB-authenticated (email/password or guest) user stays signed in,
    // they just lose Workspace access until they reconnect their Google
    // account.
    const disconnectWorkspaceAccess = () => {
        try {
            localStorage.removeItem('workspace_access_token');
        } catch (e) {
            console.warn('localStorage is not accessible');
        }
        cachedAccessToken = null;
    };

    const logout = async () => {
        try {
            localStorage.removeItem('taskpilot_jwt');
            localStorage.removeItem('workspace_access_token');
            cachedAccessToken = null;
            setUser(null);
            showSuccess("Signed Out", "You have been successfully logged out.");
        } catch (error) {
            console.warn("Logout failed:", error);
        }
    };

    const getAccessToken = () => cachedAccessToken;

    const updateUser = (updatedUser: { name?: string; address?: string; gamification?: any }) => {
        setUser(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                name: updatedUser.name ?? prev.name,
                displayName: updatedUser.name ?? prev.displayName,
                address: updatedUser.address ?? prev.address,
                gamification: updatedUser.gamification ?? prev.gamification
            };
        });
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            register,
            loginAsGuest,
            loginWithGoogle,
            logout,
            getAccessToken,
            requestWorkspaceAccess,
            disconnectWorkspaceAccess,
            updateUser,
            refreshGamification,
            refreshPremiumStatus,
            refreshUser,
            verify2FA
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);