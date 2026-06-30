import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
    const querySnapshot = await getDocs(collection(db, "users"));
    console.log("Success! Found", querySnapshot.size, "documents");
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
