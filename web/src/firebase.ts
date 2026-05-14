import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace these with your Firebase project configuration
// You can find this in the Firebase Console -> Project Settings -> General -> Your apps
const firebaseConfig = {
  apiKey: "AIzaSyDzCmUxbE8BMTEjJI94CDmEDqpcxP45dE8",
  authDomain: "english-faf1b.firebaseapp.com",
  projectId: "english-faf1b",
  storageBucket: "english-faf1b.firebasestorage.app",
  messagingSenderId: "228450156721",
  appId: "1:228450156721:web:ed8caa7edc68cc03172290",
  measurementId: "G-M18FNKS59N"
};

// Check if keys are placeholders
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

// Initialize Firebase only if config is valid
const app = isConfigValid ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const isFirebaseActive = isConfigValid;

if (isFirebaseActive) {
  console.log('✅ Firebase inizializzato correttamente (Cloud Sync attivo)');
} else {
  console.warn('⚠️ Firebase non configurato o chiavi mancanti. L\'app funzionerà solo in locale.');
}
