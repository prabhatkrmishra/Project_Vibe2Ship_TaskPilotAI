import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initFirebase, getFirebaseAuth } from './firebase';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Cache the access token in memory.
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    initFirebase().then(({ auth }) => {
      unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) {
          if (!isSigningIn && !cachedAccessToken) {
            // We have a user but no token (e.g. page reload). They might need to sign in again to get a fresh token for Workspace APIs.
            // But we still set the user for basic app functionality.
            setUser(u);
          } else {
            setUser(u);
          }
        } else {
          setUser(null);
          cachedAccessToken = null;
        }
        setLoading(false);
      });
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      isSigningIn = true;
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar');
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/documents');
      provider.addScope('https://www.googleapis.com/auth/presentations');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        console.log("Sign-in popup closed or cancelled by user.");
      } else if (error?.code === 'auth/popup-blocked') {
        toast.error("Sign-in popup was blocked by your browser. Please allow popups for this site.");
        console.warn("Sign-in popup blocked:", error);
      } else {
        toast.error("Failed to continue with Google.");
        console.warn("Login failed:", error);
      }
    } finally {
      isSigningIn = false;
    }
  };

  const logout = async () => {
    try {
      const auth = getFirebaseAuth();
      await signOut(auth);
      cachedAccessToken = null;
    } catch (error) {
      console.warn("Logout failed:", error);
    }
  };

  const getAccessToken = () => cachedAccessToken;

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
