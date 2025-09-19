// admin.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDoc,
  runTransaction,
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
const setText = (el, text) => {
  if (el) {
    el.textContent = text;
  }
};

const sidebar = byId("sidebar");
const toggleSidebarBtn = byId("toggleSidebar");
if (sidebar && toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

const viewButtons = Array.from(document.querySelectorAll(".side-link[data-view]"));
const viewSections = new Map();
viewButtons.forEach((button) => {
  const viewId = button.dataset.view;
  if (!viewId) {
    return;
  }
  const section = byId(viewId);
  if (!section) {
    console.warn(`Missing section for view '${viewId}'`);
    return;
  }
  viewSections.set(viewId, section);
  button.addEventListener("click", () => activateView(viewId, button));
});

function activateView(viewId, activeButton) {
  viewButtons.forEach((btn) => {
    btn.classList.toggle("active", btn === activeButton);
  });
  viewSections.forEach((section, id) => {
    toggleHidden(section, id !== viewId);
  });
}

const initialButton = viewButtons.find((btn) => btn.classList.contains("active")) ?? viewButtons[0];
if (initialButton && initialButton.dataset.view && viewSections.has(initialButton.dataset.view)) {
  activateView(initialButton.dataset.view, initialButton);
}

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

const statTotalItems = byId("statTotalItems");
const statActiveLoans = byId("statActiveLoans");
const statPendingLoans = byId("statPendingLoans");

const itemForm = byId("itemForm");
const itemIdEl = byId("itemId");
const itemNameEl = byId("itemName");
const itemTotalEl = byId("itemTotal");
const itemAvailEl = byId("itemAvailable");
const itemDescEl = byId("itemDesc");
const itemSubmitBtn = byId("itemSubmitBtn");
const itemResetBtn = byId("itemResetBtn");

const itemsGrid = byId("itemsAdminGrid");
const itemsAdminLoading = byId("itemsAdminLoading");
const itemsAdminError = byId("itemsAdminError");
const itemSearchEl = byId("itemSearch");

const pendingTbody = byId("pendingTableBody");
const pendingLoading = byId("pendingLoading");
const pendingError = byId("pendingError");
const hasPendingSection = Boolean(pendingTbody && pendingLoading && pendingError);

const activeTbody = byId("activeTableBody");
const activeLoading = byId("activeLoading");
const activeError = byId("activeError");
const hasActiveSection = Boolean(activeTbody && activeLoading && activeError);

const historyTbody = byId("historyTableBody");
const historyLoading = byId("historyLoading");
const historyError = byId("historyError");
const hasHistorySection = Boolean(historyTbody && historyLoading && historyError);

let currentUser = null;
const userCache = new Map();
const itemCache = new Map();
let allItems = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  await refreshItems();
  await refreshPending();
  await refreshActive();
  await refreshHistory();
  updateStats();
});

if (itemForm && itemNameEl && itemTotalEl && itemAvailEl && itemSubmitBtn) {
  itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = itemNameEl.value.trim();
    const total = Number(itemTotalEl.value);
    const available = Number(itemAvailEl.value);
    const description = itemDescEl ? itemDescEl.value.trim() : "";

    if (!name) {
      showToast("กรุณากรอกชื่ออุปกรณ์");
      return;
    }
    if (!Number.isFinite(total) || total < 0) {
      showToast("จำนวนทั้งหมดต้องไม่ติดลบ");
      return;
    }
    if (!Number.isFinite(available) || available < 0) {
      showToast("จำนวนคงเหลือต้องไม่ติดลบ");
      return;
    }
    if (available > total) {
      showToast("จำนวนคงเหลือต้องไม่มากกว่าจำนวนทั้งหมด");
      return;
    }

    const payload = {
      name,
      totalStock: total,
      availableStock: available,
      description,
    };

    try {
      itemSubmitBtn.disabled = true;
      if (itemIdEl && itemIdEl.value) {
        await updateDoc(doc(db, "items", itemIdEl.value), payload);
        showToast("อัปเดตอุปกรณ์เรียบร้อย");
      } else {
        await addDoc(collection(db, "items"), payload);
        showToast("เพิ่มอุปกรณ์เรียบร้อย");
      }
      itemForm.reset();
      if (itemIdEl) {
        itemIdEl.value = "";
      }
      await refreshItems();
      updateStats();
    } catch (error) {
      console.error("Failed to save item:", error);
      showToast(`บันทึกข้อมูลล้มเหลว: ${error?.message ?? error}`);
    } finally {
      itemSubmitBtn.disabled = false;
    }
  });
}

if (itemResetBtn && itemIdEl) {
  itemResetBtn.addEventListener("click", () => {
    itemIdEl.value = "";
  });
}

if (itemSearchEl) {
  itemSearchEl.addEventListener("input", () => {
    const keyword = itemSearchEl.value.trim().toLowerCase();
    const filtered = allItems.filter((item) =>
      (item.name ?? "").toLowerCase().includes(keyword)
    );
    const message = keyword ? "ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา" : "ยังไม่มีอุปกรณ์ในระบบ";
    renderItems(filtered, message);
  });
}

async function refreshItems() {
  try {
    setError(itemsAdminError, "");
    toggleHidden(itemsAdminLoading, false);
    itemCache.clear();

    const snapshot = await getDocs(collection(db, "items"));
    const items = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const item = { id: docSnap.id, ...data };
      itemCache.set(item.id, item);
      return item;
    });

    allItems = items;
    renderItems(items);
  } catch (error) {
    console.error("Failed to load items:", error);
    setError(itemsAdminError, error?.message ?? "โหลดอุปกรณ์ไม่สำเร็จ");
  } finally {
    toggleHidden(itemsAdminLoading, true);
  }
}

function renderItems(items, emptyMessage = "ยังไม่มีอุปกรณ์ในระบบ") {
  if (!itemsGrid) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    itemsGrid.innerHTML = `<p class="muted">${emptyMessage}</p>`;
    return;
  }

  itemsGrid.innerHTML = items.map((item) => renderItemCard(item)).join("");

  itemsGrid.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => {
      const { id } = button.dataset;
      if (!id || !itemCache.has(id)) {
        return;
      }
      const data = itemCache.get(id);
      if (!data || !itemIdEl || !itemNameEl || !itemTotalEl || !itemAvailEl) {
        return;
      }
      itemIdEl.value = id;
      itemNameEl.value = data.name ?? "";
      itemTotalEl.value = data.totalStock ?? 0;
      itemAvailEl.value = data.availableStock ?? 0;
      if (itemDescEl) {
        itemDescEl.value = data.description ?? "";
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  itemsGrid.querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", async () => {
      const { id } = button.dataset;
      if (!id) {
        return;
      }
      const confirmed = window.confirm("ยืนยันการลบอุปกรณ์นี้หรือไม่?");
      if (!confirmed) {
        return;
      }
      try {
        await deleteDoc(doc(db, "items", id));
        showToast("ลบอุปกรณ์แล้ว");
        await refreshItems();
        updateStats();
      } catch (error) {
        console.error("Failed to delete item:", error);
        showToast(`ไม่สามารถลบอุปกรณ์ได้: ${error?.message ?? error}`);
      }
    });
  });
}

function renderItemCard(item) {
  const available = item.availableStock ?? 0;
  const total = item.totalStock ?? 0;
  return `
    <article class="item-card">
      <div class="item-head">
        <div class="item-name">${escapeHtml(item.name ?? "—")}</div>
        <span class="badge ${available > 0 ? "" : "danger"}">${available}/${total}</span>
      </div>
      <p class="muted">${escapeHtml(item.description ?? "")}</p>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" data-action="edit" data-id="${item.id}">แก้ไข</button>
        <button class="btn btn-danger" data-action="delete" data-id="${item.id}">ลบ</button>
      </div>
    </article>
  `;
}

async function refreshPending() {
  if (!hasPendingSection) {
    return;
  }
  try {
    setError(pendingError, "");
    toggleHidden(pendingLoading, false);

    const pendingQuery = query(
      collection(db, "loans"),
      where("status", "==", "pending"),
      orderBy("requestedAt", "asc")
    );
    const snapshot = await getDocs(pendingQuery);

    const rows = [];
    for (const docSnap of snapshot.docs) {
      const loan = { id: docSnap.id, ...docSnap.data() };
      const item = await safeGetItem(loan.itemId);
      const borrower = await safeGetUser(loan.borrowerUid);
      rows.push(renderPendingRow(loan, item, borrower));
    }

    pendingTbody.innerHTML = rows.join("");
    pendingTbody.querySelectorAll("[data-action='approve']").forEach((button) => {
      button.addEventListener("click", () => changeLoanStatus(button.dataset.id, "approve"));
    });
    pendingTbody.querySelectorAll("[data-action='reject']").forEach((button) => {
      button.addEventListener("click", () => changeLoanStatus(button.dataset.id, "reject"));
    });
    updateStats();
  } catch (error) {
    console.error("Failed to load pending loans:", error);
    setError(pendingError, error?.message ?? "โหลดคำขอยืมไม่สำเร็จ");
  } finally {
    toggleHidden(pendingLoading, true);
  }
}

function renderPendingRow(loan, item, borrower) {
  return `
    <tr>
      <td>${escapeHtml(item?.name ?? "—")}</td>
      <td>${escapeHtml(borrower?.email ?? loan.borrowerUid ?? "—")}</td>
      <td>${fmt(tsToDate(loan.requestedAt))}</td>
      <td>
        <button class="btn btn-ok" data-action="approve" data-id="${loan.id}">อนุมัติ</button>
        <button class="btn btn-danger" data-action="reject" data-id="${loan.id}">ปฏิเสธ</button>
      </td>
    </tr>
  `;
}

async function changeLoanStatus(loanId, action) {
  if (!loanId || !action) {
    return;
  }
  try {
    await runTransaction(db, async (transaction) => {
      const loanRef = doc(db, "loans", loanId);
      const loanSnap = await transaction.get(loanRef);
      if (!loanSnap.exists()) {
        throw new Error("ไม่พบคำขอยืม");
      }
      const loan = loanSnap.data();

      const itemRef = doc(db, "items", loan.itemId);
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error("ไม่พบอุปกรณ์");
      }
      const item = itemSnap.data();

      if (action === "approve") {
        if ((item.availableStock ?? 0) <= 0) {
          throw new Error("สต๊อกอุปกรณ์ไม่เพียงพอ");
        }
        const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        transaction.update(loanRef, {
          status: "approved",
          dueAt,
          requestedAt: loan.requestedAt ?? serverTimestamp(),
        });
        transaction.update(itemRef, {
          availableStock: (item.availableStock ?? 0) - 1,
        });
      } else if (action === "reject") {
        transaction.update(loanRef, { status: "rejected" });
      }
    });

    showToast(action === "approve" ? "อนุมัติคำขอยืมแล้ว" : "ปฏิเสธคำขอยืมแล้ว");
    await refreshPending();
    await refreshActive();
    await refreshItems();
    updateStats();
  } catch (error) {
    console.error("Failed to update loan status:", error);
    showToast(`อัปเดตคำขอยืมล้มเหลว: ${error?.message ?? error}`);
  }
}

async function refreshActive() {
  if (!hasActiveSection) {
    return;
  }
  try {
    setError(activeError, "");
    toggleHidden(activeLoading, false);

    const activeQuery = query(
      collection(db, "loans"),
      where("status", "==", "approved"),
      orderBy("dueAt", "asc")
    );
    const snapshot = await getDocs(activeQuery);

    const rows = [];
    for (const docSnap of snapshot.docs) {
      const loan = { id: docSnap.id, ...docSnap.data() };
      const item = await safeGetItem(loan.itemId);
      const borrower = await safeGetUser(loan.borrowerUid);
      rows.push(renderActiveRow(loan, item, borrower));
    }

    activeTbody.innerHTML = rows.join("");
    activeTbody.querySelectorAll("[data-action='return']").forEach((button) => {
      button.addEventListener("click", () => recordReturn(button.dataset.id));
    });
    updateStats();
  } catch (error) {
    console.error("Failed to load active loans:", error);
    setError(activeError, error?.message ?? "โหลดรายการยืมอยู่ไม่สำเร็จ");
  } finally {
    toggleHidden(activeLoading, true);
  }
}

function renderActiveRow(loan, item, borrower) {
  return `
    <tr>
      <td>${escapeHtml(item?.name ?? "—")}</td>
      <td>${escapeHtml(borrower?.email ?? loan.borrowerUid ?? "—")}</td>
      <td>${fmt(tsToDate(loan.dueAt))}</td>
      <td><span class="badge">อนุมัติ</span></td>
      <td><button class="btn btn-warn" data-action="return" data-id="${loan.id}">บันทึกการคืน</button></td>
    </tr>
  `;
}

async function recordReturn(loanId) {
  if (!loanId) {
    return;
  }
  try {
    await runTransaction(db, async (transaction) => {
      const loanRef = doc(db, "loans", loanId);
      const loanSnap = await transaction.get(loanRef);
      if (!loanSnap.exists()) {
        throw new Error("ไม่พบคำขอยืม");
      }
      const loan = loanSnap.data();

      const itemRef = doc(db, "items", loan.itemId);
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error("ไม่พบอุปกรณ์");
      }
      const item = itemSnap.data();

      transaction.update(loanRef, {
        status: "returned",
        returnedAt: serverTimestamp(),
      });
      transaction.update(itemRef, {
        availableStock: (item.availableStock ?? 0) + 1,
      });
    });

    showToast("บันทึกการคืนเรียบร้อย");
    await refreshActive();
    await refreshItems();
    await refreshHistory();
    updateStats();
  } catch (error) {
    console.error("Failed to record return:", error);
    showToast(`บันทึกการคืนล้มเหลว: ${error?.message ?? error}`);
  }
}

async function refreshHistory() {
  if (!hasHistorySection) {
    return;
  }
  try {
    setError(historyError, "");
    toggleHidden(historyLoading, false);

    const historyQuery = query(
      collection(db, "loans"),
      where("status", "==", "returned"),
      orderBy("returnedAt", "desc")
    );
    const snapshot = await getDocs(historyQuery);

    const rows = [];
    for (const docSnap of snapshot.docs) {
      const loan = { id: docSnap.id, ...docSnap.data() };
      const item = await safeGetItem(loan.itemId);
      const borrower = await safeGetUser(loan.borrowerUid);
      rows.push(renderHistoryRow(loan, item, borrower));
    }

    historyTbody.innerHTML = rows.join("");
  } catch (error) {
    console.error("Failed to load loan history:", error);
    setError(historyError, error?.message ?? "โหลดประวัติการยืมไม่สำเร็จ");
  } finally {
    toggleHidden(historyLoading, true);
  }
}

function renderHistoryRow(loan, item, borrower) {
  return `
    <tr>
      <td>${escapeHtml(item?.name ?? "—")}</td>
      <td>${escapeHtml(borrower?.email ?? loan.borrowerUid ?? "—")}</td>
      <td>${fmt(tsToDate(loan.returnedAt))}</td>
      <td><span class="badge">คืนแล้ว</span></td>
    </tr>
  `;
}

async function safeGetItem(id) {
  if (!id) {
    return null;
  }
  if (itemCache.has(id)) {
    return itemCache.get(id);
  }
  const snapshot = await getDoc(doc(db, "items", id));
  if (!snapshot.exists()) {
    return null;
  }
  const item = { id: snapshot.id, ...snapshot.data() };
  itemCache.set(id, item);
  return item;
}

async function safeGetUser(uid) {
  if (!uid) {
    return null;
  }
  if (userCache.has(uid)) {
    return userCache.get(uid);
  }
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) {
    return { email: "(ไม่พบข้อมูลผู้ใช้)" };
  }
  const user = snapshot.data();
  userCache.set(uid, user);
  return user;
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
    return "—";
  }
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function updateStats() {
  if (!statTotalItems && !statPendingLoans && !statActiveLoans) {
    return;
  }
  try {
    if (statTotalItems) {
      setText(statTotalItems, allItems.length);
    }

    if (statPendingLoans) {
      const pendingSnap = await getDocs(
        query(collection(db, "loans"), where("status", "==", "pending"))
      );
      setText(statPendingLoans, pendingSnap.size);
    }

    if (statActiveLoans) {
      const activeSnap = await getDocs(
        query(collection(db, "loans"), where("status", "==", "approved"))
      );
      setText(statActiveLoans, activeSnap.size);
    }
  } catch (error) {
    console.error("Failed to update dashboard stats:", error);
  }
}
