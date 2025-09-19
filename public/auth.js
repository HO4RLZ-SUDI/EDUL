// auth.js
import { auth, db, provider } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const INDEX_PAGE = "index.html";
const ADMIN_PAGE = "admin.html";
const STUDENT_PAGE = "student.html";

let loginButton = null;
let loginLoading = null;
let loginError = null;
let cachedRole = null;

const getCurrentPage = () => {
  const { pathname } = window.location;
  if (!pathname || pathname === "/") {
    return INDEX_PAGE;
  }
  const lastSegment = pathname.split("/").pop();
  if (!lastSegment) {
    return INDEX_PAGE;
  }
  return lastSegment;
};

const redirectTo = (page) => {
  if (getCurrentPage() !== page) {
    window.location.href = page;
  }
};

const setLoading = (isLoading) => {
  if (loginLoading) {
    loginLoading.hidden = !isLoading;
  }
  if (loginButton) {
    loginButton.disabled = isLoading;
  }
};

const showLoginError = (message) => {
  if (!loginError) {
    return;
  }
  if (!message) {
    loginError.textContent = "";
    loginError.hidden = true;
    return;
  }
  loginError.textContent = message;
  loginError.hidden = false;
};

const updateLoginButton = (role) => {
  if (!loginButton) {
    return;
  }
  if (auth.currentUser && role) {
    loginButton.textContent = role === "admin" ? "ไปที่หน้า Admin" : "ไปที่หน้า Student";
  } else {
    loginButton.textContent = "เข้าสู่ระบบด้วย Google";
  }
};

const ensureUserRecord = async (user) => {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  const email = user.email ?? "";

  if (!snapshot.exists()) {
    const defaultRole = "student";
    await setDoc(userRef, { email, role: defaultRole });
    return defaultRole;
  }

  const data = snapshot.data() ?? {};
  let role = typeof data.role === "string" ? data.role.trim() : "";

  if (!role) {
    role = "student";
    await setDoc(userRef, { role, email: data.email ?? email }, { merge: true });
  } else if (!data.email && email) {
    await setDoc(userRef, { email }, { merge: true });
  }

  return role;
};

document.addEventListener("DOMContentLoaded", () => {
  loginButton = document.getElementById("googleSignInBtn");
  loginLoading = document.getElementById("loginLoading");
  loginError = document.getElementById("loginError");

  updateLoginButton(cachedRole);
  showLoginError("");
  setLoading(false);

  if (loginButton) {
    loginButton.addEventListener("click", async () => {
      showLoginError("");

      if (auth.currentUser) {
        try {
          const role = cachedRole || (await ensureUserRecord(auth.currentUser));
          cachedRole = role;
          updateLoginButton(role);
          redirectTo(role === "admin" ? ADMIN_PAGE : STUDENT_PAGE);
        } catch (error) {
          console.error("Failed to resolve existing user role:", error);
          showLoginError(
            error instanceof Error
              ? error.message
              : "ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง"
          );
        }
        return;
      }

      setLoading(true);
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        if (!user) {
          throw new Error("ไม่พบข้อมูลผู้ใช้จากการเข้าสู่ระบบ Google");
        }

        const role = await ensureUserRecord(user);
        cachedRole = role;
        updateLoginButton(role);
        redirectTo(role === "admin" ? ADMIN_PAGE : STUDENT_PAGE);
      } catch (error) {
        console.error("Google sign-in failed:", error);
        const message =
          error instanceof Error
            ? error.message
            : "ไม่สามารถเข้าสู่ระบบด้วย Google ได้ กรุณาลองใหม่อีกครั้ง";
        showLoginError(message);
      } finally {
        setLoading(false);
      }
    });
  }

  const logoutButtons = document.querySelectorAll(".logout-btn");
  logoutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Sign-out failed:", error);
      } finally {
        redirectTo(INDEX_PAGE);
      }
    });
  });
});

onAuthStateChanged(auth, async (user) => {
  const currentPage = getCurrentPage();

  if (!user) {
    cachedRole = null;
    updateLoginButton(null);
    showLoginError("");
    if (currentPage !== INDEX_PAGE) {
      redirectTo(INDEX_PAGE);
    }
    return;
  }

  try {
    const role = await ensureUserRecord(user);
    cachedRole = role;
    updateLoginButton(role);

    if (currentPage === INDEX_PAGE) {
      return;
    }

    const targetPage = role === "admin" ? ADMIN_PAGE : STUDENT_PAGE;
    if (currentPage !== targetPage) {
      redirectTo(targetPage);
    }
  } catch (error) {
    console.error("Failed to verify user role:", error);
    showLoginError(
      error instanceof Error ? error.message : "ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้ได้"
    );
    if (currentPage !== INDEX_PAGE) {
      redirectTo(INDEX_PAGE);
    }
  }
});
