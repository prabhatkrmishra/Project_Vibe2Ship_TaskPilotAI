import { createContext, useContext, useEffect, useState } from 'react';
import { showSuccess, showError } from './toastTheme';

export interface CustomUser {
  uid: string;
  email: string;
  name: string;
  displayName?: string;
  picture?: string;
  address?: string;
  gamification?: any; // Ideally import GamificationState but any for now
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
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Cache the workspace access token in memory and local storage.
let cachedAccessToken: string | null = null;
try {
  cachedAccessToken = localStorage.getItem('workspace_access_token');
} catch (e) {
  console.warn('localStorage is not accessible');
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
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
      gamification: userData.gamification,
      getIdToken: async () => token
    };
  };

  const refreshGamification = async () => {
    const token = localStorage.getItem('taskpilot_jwt');
    if (!token || !user) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(makeUserObject(userData, token));
      }
    } catch (err) {
      console.error("Failed to refresh gamification data:", err);
    }
  };

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
        const { accessToken, taskpilotToken, user: googleUser } = event.data;
        cachedAccessToken = accessToken;
        localStorage.setItem('workspace_access_token', accessToken);
        
        if (taskpilotToken && googleUser) {
          localStorage.setItem('taskpilot_jwt', taskpilotToken);
          setUser(makeUserObject(googleUser, taskpilotToken));
          showSuccess("Successfully logged in with Google!");
        } else {
          showSuccess("Workspace access authorized.");
        }
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  const startWorkspaceOAuth = async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/config");
      const { googleClientId } = await res.json();

      if (!googleClientId) {
        showError("Google Client ID is not configured on the server.");
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
              showError("Google Sign-In failed or was cancelled.");
              resolve(null);
              return;
            }
            if (response.code) {
              try {
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                const jwtToken = localStorage.getItem("taskpilot_jwt");
                if (jwtToken) {
                  headers["Authorization"] = `Bearer ${jwtToken}`;
                }
                const res = await fetch("/api/auth/google/callback", {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ code: response.code }),
                });
                if (!res.ok) throw new Error(await res.text());
                
                const authData = await res.json();
                
                const { accessToken, taskpilotToken, user: googleUser } = authData;
                cachedAccessToken = accessToken;
                localStorage.setItem("workspace_access_token", accessToken);
                
                if (taskpilotToken && googleUser) {
                  localStorage.setItem("taskpilot_jwt", taskpilotToken);
                  setUser(makeUserObject(googleUser, taskpilotToken));
                  showSuccess("Successfully logged in with Google!");
                } else {
                  showSuccess("Workspace access authorized.");
                }
                resolve(accessToken);
              } catch (err: any) {
                showError("Failed to exchange code: " + err.message);
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
      showError("Failed to start Google Sign-In.");
      console.warn("Login start failed:", error);
      return null;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      localStorage.setItem('taskpilot_jwt', data.token);
      setUser(makeUserObject(data.user, data.token));
      showSuccess("Successfully logged in!");
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      localStorage.setItem('taskpilot_jwt', data.token);
      setUser(makeUserObject(data.user, data.token));
      showSuccess("Account created successfully!");
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
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Guest login failed");
      }

      localStorage.setItem('taskpilot_jwt', data.token);
      setUser(makeUserObject(data.user, data.token));
      showSuccess("Welcome! Logged in as Guest.");
    } catch (error: any) {
      showError(error.message || "Failed to sign in as guest.");
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
      showSuccess("Logged out successfully");
    } catch (error) {
      console.warn("Logout failed:", error);
    }
  };

  const getAccessToken = () => cachedAccessToken;

  const updateUser = (updatedUser: { name?: string; address?: string; gamification?: any }) => {
    if (user) {
      setUser({ 
        ...user, 
        name: updatedUser.name ?? user.name, 
        displayName: updatedUser.name ?? user.displayName, 
        address: updatedUser.address ?? user.address,
        gamification: updatedUser.gamification ?? user.gamification
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginAsGuest, loginWithGoogle, logout, getAccessToken, requestWorkspaceAccess, disconnectWorkspaceAccess, updateUser, refreshGamification }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);