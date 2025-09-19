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

const getCurrentPage = () => {
  const { pathname } = window.location;
  if (!pathname || pathname === "/") {
    return "index.html";
  }
  const lastSegment = pathname.split("/").pop();
  if (!lastSegment || lastSegment === "") {
    return "index.html";
  }
  return lastSegment;
};

const redirectByRole = (role) => {
  const targetPage = role === "admin" ? "admin.html" : "student.html";
  if (getCurrentPage() !== targetPage) {
    window.location.href = targetPage;
  }
};

const ensureUserRecord = async (user) => {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      email: user.email ?? "",
      role: "student",
    });
    return "student";
  }

  const data = snapshot.data();
  if (data && typeof data.role === "string" && data.role.trim() !== "") {
    return data.role;
  }

  return "student";
};

document.addEventListener("DOMContentLoaded", () => {
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  const loadingIndicator = document.getElementById("loginLoading");
  const errorMessage = document.getElementById("loginError");

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", async () => {
      if (errorMessage) {
        errorMessage.textContent = "";
        errorMessage.hidden = true;
      }
      if (loadingIndicator) {
        loadingIndicator.hidden = false;
      }

      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        if (!user) {
          throw new Error("Unable to retrieve user information from Google Sign-In.");
        }

        const role = await ensureUserRecord(user);
        redirectByRole(role);
      } catch (error) {
        console.error("Google sign-in failed:", error);
        if (errorMessage) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to sign in with Google. Please try again.";
          errorMessage.textContent = message;
          errorMessage.hidden = false;
        }
      } finally {
        if (loadingIndicator) {
          loadingIndicator.hidden = true;
        }
      }
    });
  }

  const logoutButtons = document.querySelectorAll(".logout-btn");
  logoutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Sign-out failed:", error);
      } finally {
        window.location.href = "index.html";
      }
    });
  });
});

onAuthStateChanged(auth, async (user) => {
  const currentPage = getCurrentPage();

  if (!user) {
    if (currentPage !== "index.html") {
      window.location.href = "index.html";
    }
    return;
  }

  try {
    const role = await ensureUserRecord(user);
    const targetPage = role === "admin" ? "admin.html" : "student.html";

    if (currentPage !== targetPage) {
      window.location.href = targetPage;
    }
  } catch (error) {
    console.error("Failed to verify user role:", error);
    if (currentPage !== "index.html") {
      window.location.href = "index.html";
    }
  }
});
