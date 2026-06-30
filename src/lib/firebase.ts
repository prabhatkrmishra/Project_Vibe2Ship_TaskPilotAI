import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

let app: any;
let db: Firestore;
let auth: Auth;
let databaseId: string | undefined;

export const initFirebase = async () => {
  const res = await fetch('/api/firebase-config');
  const config = await res.json();
  const currentDbId = config.databaseId;

  if (getApps().length === 0) {
    app = initializeApp(config);
  } else {
    app = getApps()[0];
  }
  
  if (!db || databaseId !== currentDbId) {
    databaseId = currentDbId;
    if (databaseId && databaseId !== '(default)') {
      db = getFirestore(app, databaseId);
    } else {
      db = getFirestore(app);
    }
  }
  
  if (!auth) {
    auth = getAuth(app);
  }
  
  return { db, auth };
};

export const getDb = (): Firestore => {
  if (!db) throw new Error('Firebase not initialized');
  return db;
};

export const getFirebaseAuth = (): Auth => {
  if (!auth) throw new Error('Firebase not initialized');
  return auth;
};
