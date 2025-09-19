// auth.js
import { app, auth, provider, db } from "../firebase-config.js";
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const googleBtn = document.getElementById("googleSignInBtn");
const loadingEl = document.getElementById("loginLoading");
const errEl = document.getElementById("loginError");

// Login page only
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    errEl && (errEl.hidden = true);
    loadingEl && (loadingEl.hidden = false);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Ensure user doc with role exists
      const uref = doc(db, "users", user.uid);
      const snap = await getDoc(uref);
      if (!snap.exists()) {
        await setDoc(uref, { email: user.email || "", role: "student" });
      }
      const role = (snap.exists() ? snap.data()?.role : "student") || "student";
      // redirect based on role
      window.location.href = role === "admin" ? "admin.html" : "student.html";
    } catch (e) {
      console.error(e);
      if (errEl) {
        errEl.textContent = e?.message || "เข้าสู่ระบบล้มเหลว";
        errEl.hidden = false;
      }
    } finally {
      loadingEl && (loadingEl.hidden = true);
    }
  });
}

// Common: logout hooks on any page
document.querySelectorAll(".logout-btn").forEach((btn) =>
  btn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "index.html";
    } catch (e) {
      alert("ออกจากระบบล้มเหลว: " + (e?.message || e));
    }
  })
);

// Guard pages: redirect if not logged-in and ensure role routes
const path = location.pathname.split("/").pop();
const needsGuard = ["student.html", "admin.html"].includes(path);

if (needsGuard) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    // check role
    try {
      const uref = doc(db, "users", user.uid);
      const snap = await getDoc(uref);
      const role = snap.exists() ? snap.data()?.role : "student";

      if (path === "admin.html" && role !== "admin") {
        // not admin
        window.location.href = "student.html";
      }
      if (path === "student.html" && role === "admin") {
        // admin -> admin
        window.location.href = "admin.html";
      }
    } catch (e) {
      console.error("role check error", e);
      // fallback allow student
    }
  });
}
