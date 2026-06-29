import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut } from 'firebase/auth';
import { initFirebase, getFirebaseAuth } from './firebase';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
  requestWorkspaceAccess: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Cache the access token in memory and local storage.
let cachedAccessToken: string | null = localStorage.getItem('workspace_access_token');
let isSigningIn = false;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    initFirebase().then(({ auth }) => {
      unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) {
          setUser(u);
        } else {
          setUser(null);
          cachedAccessToken = null;
          localStorage.removeItem('workspace_access_token');
        }
        setLoading(false);
      });
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleAuthMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }

      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        const { accessToken } = event.data;
        cachedAccessToken = accessToken;
        localStorage.setItem('workspace_access_token', accessToken);
        toast.success("Workspace access authorized.");
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  const startWorkspaceOAuth = async () => {
    try {
      const res = await fetch("/api/auth/google/url");
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const { url } = await res.json();

      const popup = window.open(url, "google_oauth_popup", "width=600,height=700");
      if (!popup) {
        toast.error("Sign-in popup was blocked by your browser. Please allow popups for this site.");
        return;
      }
    } catch (error: any) {
      toast.error("Failed to start Google Sign-In.");
      console.warn("Login start failed:", error);
    }
  };

  const loginWithGoogle = async () => {
    try {
      isSigningIn = true;
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      // Only request basic profile scopes for Firebase auth
      provider.addScope('profile');
      provider.addScope('email');
      
      await signInWithPopup(auth, provider);
      toast.success("Successfully logged in with Google!");
    } catch (error: any) {
      toast.error("Failed to sign in with Google.");
      console.error("Login failed:", error);
    } finally {
      isSigningIn = false;
    }
  };

  const requestWorkspaceAccess = async (): Promise<string | null> => {
    if (cachedAccessToken) return cachedAccessToken;
    
    return new Promise(async (resolve) => {
      const handleMsg = (event: MessageEvent) => {
        if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
          window.removeEventListener('message', handleMsg);
          const { accessToken } = event.data;
          cachedAccessToken = accessToken;
          localStorage.setItem('workspace_access_token', accessToken);
          resolve(accessToken);
        }
      };
      window.addEventListener('message', handleMsg);
      
      await startWorkspaceOAuth();
      
      // Auto-cleanup after 2 minutes in case user closes popup
      setTimeout(() => {
        window.removeEventListener('message', handleMsg);
        resolve(null);
      }, 120000);
    });
  };

  const logout = async () => {
    try {
      const auth = getFirebaseAuth();
      await signOut(auth);
      cachedAccessToken = null;
      localStorage.removeItem('workspace_access_token');
    } catch (error) {
      console.warn("Logout failed:", error);
    }
  };

  const getAccessToken = () => cachedAccessToken;

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, getAccessToken, requestWorkspaceAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
