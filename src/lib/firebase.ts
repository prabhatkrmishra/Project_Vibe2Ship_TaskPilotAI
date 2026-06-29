import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export const initFirebase = async () => {
  if (getApps().length > 0) {
      return { db: firestoreInstance!, auth: authInstance! };
  }
  
  try {
    const res = await fetch('/api/firebase-config');
    const config = await res.json();
    
    if (config.error) {
        throw new Error(config.error);
    }

    const app = initializeApp(config);
    firestoreInstance = getFirestore(app, config.databaseId);
    authInstance = getAuth(app);
    
    return { db: firestoreInstance, auth: authInstance };
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    throw error;
  }
};

export const getDb = () => {
    if (!firestoreInstance) throw new Error("Firebase not initialized");
    return firestoreInstance;
}

export const getFirebaseAuth = () => {
    if (!authInstance) throw new Error("Firebase not initialized");
    return authInstance;
}

