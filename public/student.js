// student.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const byId = (id) => document.getElementById(id);
const toggleHidden = (el, hidden) => {
  if (el) {
    el.hidden = hidden;
  }
};
const setError = (el, message) => {
  if (!el) {
    return;
  }
  if (!message) {
    el.textContent = "";
    el.hidden = true;
    return;
  }
  el.textContent = message;
  el.hidden = false;
};

const itemsView = byId("itemsView");
const historyView = byId("historyView");
const navLinks = Array.from(document.querySelectorAll(".navlink[data-view]"));
const itemsGrid = byId("itemsGrid");
const itemsLoading = byId("itemsLoading");
const itemsError = byId("itemsError");
const historyLoading = byId("historyLoading");
const historyError = byId("historyError");
const historyTableBody = byId("historyTableBody");
const toast = byId("toast");

let toastTimer = null;
function showToast(message, duration = 2600) {
  if (!message) {
    return;
  }
  if (!toast) {
    window.alert?.(message);
    return;
  }
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    toastTimer = null;
  }, duration);
}

function activateStudentView(viewId) {
  navLinks.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  if (itemsView) {
    toggleHidden(itemsView, viewId !== "itemsView");
  }
  if (historyView) {
    toggleHidden(historyView, viewId !== "historyView");
  }
}

if (navLinks.length) {
  navLinks.forEach((button) => {
    button.addEventListener("click", () => {
      const targetView = button.dataset.view ?? "itemsView";
      activateStudentView(targetView);
    });
  });
  const defaultButton = navLinks.find((btn) => btn.classList.contains("active")) ?? navLinks[0];
  if (defaultButton) {
    activateStudentView(defaultButton.dataset.view ?? "itemsView");
  }
}

let currentUser = null;
let itemCache = new Map();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  await loadItems();
  await loadHistory();
});

async function loadItems() {
  if (!itemsGrid) {
    return;
  }
  try {
    setError(itemsError, "");
    toggleHidden(itemsLoading, false);
    itemCache = new Map();

    const snapshot = await getDocs(collection(db, "items"));
    const items = snapshot.docs.map((docSnap) => {
      const item = { id: docSnap.id, ...docSnap.data() };
      itemCache.set(item.id, item);
      return item;
    });

    renderItems(items);
  } catch (error) {
    console.error("Failed to load items:", error);
    setError(itemsError, error?.message ?? "โหลดอุปกรณ์ไม่สำเร็จ");
  } finally {
    toggleHidden(itemsLoading, true);
  }
}

function renderItems(items) {
  if (!itemsGrid) {
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    itemsGrid.innerHTML = '<p class="muted">ยังไม่มีอุปกรณ์ให้ยืม</p>';
    return;
  }

  itemsGrid.innerHTML = items
    .map((item) => {
      const available = item.availableStock ?? 0;
      const total = item.totalStock ?? 0;
      const canRequest = available > 0;
      return `
        <article class="item-card">
          <div class="item-head">
            <div class="item-name">${escapeHtml(item.name ?? "—")}</div>
            <span class="badge ${canRequest ? "" : "danger"}">${available}/${total}</span>
          </div>
          <p class="muted">${escapeHtml(item.description ?? "")}</p>
          <button class="btn ${canRequest ? "btn-primary" : "btn-ghost"}" data-action="request" data-id="${item.id}" ${
        canRequest ? "" : "disabled"
      }>${canRequest ? "ขอยืม" : "หมด"}</button>
        </article>`;
    })
    .join("");

  itemsGrid.querySelectorAll("[data-action='request']").forEach((button) => {
    button.addEventListener("click", async () => {
      const { id } = button.dataset;
      if (!id) {
        return;
      }
      await requestLoan(id, button);
    });
  });
}

async function requestLoan(itemId, button) {
  if (!currentUser) {
    return;
  }
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "กำลังส่งคำขอ...";
    }
    await addDoc(collection(db, "loans"), {
      itemId,
      borrowerUid: currentUser.uid,
      status: "pending",
      requestedAt: serverTimestamp(),
      dueAt: null,
      returnedAt: null,
    });
    showToast("ส่งคำขอเรียบร้อย รอการอนุมัติ");
  } catch (error) {
    console.error("Failed to request loan:", error);
    showToast(`ไม่สามารถส่งคำขอได้: ${error?.message ?? error}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "ขอยืม";
    }
  }
}

async function loadHistory() {
  if (!historyTableBody || !currentUser) {
    return;
  }
  try {
    setError(historyError, "");
    toggleHidden(historyLoading, false);

    const historyQuery = query(
      collection(db, "loans"),
      where("borrowerUid", "==", currentUser.uid),
      orderBy("requestedAt", "desc")
    );
    const snapshot = await getDocs(historyQuery);

    const rows = snapshot.docs.map((docSnap) => {
      const loan = { id: docSnap.id, ...docSnap.data() };
      const item = itemCache.get(loan.itemId);
      return renderHistoryRow(loan, item);
    });

    historyTableBody.innerHTML = rows.join("");
  } catch (error) {
    console.error("Failed to load loan history:", error);
    setError(historyError, error?.message ?? "โหลดประวัติการยืมไม่สำเร็จ");
  } finally {
    toggleHidden(historyLoading, true);
  }
}

function renderHistoryRow(loan, item) {
  const statusLabels = {
    pending: '<span class="badge gray">รออนุมัติ</span>',
    approved: '<span class="badge">อนุมัติ</span>',
    rejected: '<span class="badge danger">ปฏิเสธ</span>',
    returned: '<span class="badge gray">คืนแล้ว</span>',
  };
  const requestedAt = fmt(tsToDate(loan.requestedAt));
  const dueAt = fmt(tsToDate(loan.dueAt));
  return `
    <tr>
      <td>${escapeHtml(item?.name ?? "อุปกรณ์")}</td>
      <td>${statusLabels[loan.status] ?? escapeHtml(loan.status ?? "")}</td>
      <td>${requestedAt}</td>
      <td>${dueAt}</td>
    </tr>
  `;
}

function tsToDate(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (value instanceof Date) {
    return value;
  }
  return null;
}

function fmt(date) {
  if (!date) {
    return "";
  }
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
