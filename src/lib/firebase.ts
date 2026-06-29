import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

let app: any;
let db: Firestore;
let auth: Auth;
let databaseId: string | undefined;

export const initFirebase = async () => {
  if (getApps().length === 0) {
    const res = await fetch('/api/firebase-config');
    const config = await res.json();
    app = initializeApp(config);
    databaseId = config.databaseId;
  } else {
    app = getApps()[0];
  }
  
  if (databaseId && databaseId !== '(default)') {
    db = getFirestore(app, databaseId);
  } else {
    db = getFirestore(app);
  }
  
  auth = getAuth(app);
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
