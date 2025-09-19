// firebase-config.js
// 👉 ใส่คีย์โปรเจกต์ของมึงเองตรงนี้ (Console > Project settings)
// ใช้ v9 modular + CDN "esm" แบบ native module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ==== EDIT THIS ====
const firebaseConfig = {
  apiKey: "AIzaSyDbjgr5L4Ej-_ead-M8Omai5hrmZ1s1yBc",
  authDomain: "ton888.firebaseapp.com",
  projectId: "ton888",
  storageBucket: "ton888.firebasestorage.app",
  messagingSenderId: "129898691956",
  appId: "1:129898691956:web:3dd49e1a442366a7ae0021",
  measurementId: "G-9Z6ZDCGPTS"
};
// ===================

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
