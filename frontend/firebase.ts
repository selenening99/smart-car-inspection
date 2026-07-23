import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBsaJiIhPqTtwBf8n-M5aH-9Yz1M38qBJ8",
  authDomain: "ai-car-inspection-system.firebaseapp.com",
  projectId: "ai-car-inspection-system",
  storageBucket: "ai-car-inspection-system.firebasestorage.app",
  messagingSenderId: "126041459634",
  appId: "1:126041459634:web:b1495eb48fd1a44d75b2ab",
  measurementId: "G-KCRMEV4GNB"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);