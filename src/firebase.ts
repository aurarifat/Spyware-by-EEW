import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth setup
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firestore setup using specific databaseId from config if provided
export const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId || '(default)');

export default app;
