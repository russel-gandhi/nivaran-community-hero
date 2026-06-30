import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  "projectId": "thinking-replica-kdckx",
  "appId": "1:513568260262:web:a123a241046cba746af467",
  "apiKey": "AIzaSyDFoAoXXpPwhIxTyrMIi9gCAog2HSO0O10",
  "authDomain": "thinking-replica-kdckx.firebaseapp.com",
  "storageBucket": "thinking-replica-kdckx.firebasestorage.app",
  "messagingSenderId": "513568260262",
  "measurementId": ""
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'ai-studio-0578757c-fca5-4e28-a2cc-68b64af870d1');

async function test() {
  try {
    const q = query(
      collection(db, 'reports'),
      where('reporterId', '==', 'test'),
      where('categoryId', '==', 'test'),
      where('tier', '==', 'test'),
      where('status', '==', 'open')
    );
    const snap = await getDocs(q);
    console.log("Read Success! Size:", snap.size);
    process.exit(0);
  } catch (err) {
    console.error("Read Error:", err);
    process.exit(1);
  }
}

test();
