// admin.js
import { auth, db } from "../firebase-config.js";
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
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

// UI
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
toggleSidebarBtn?.addEventListener("click", () => sidebar.classList.toggle("open"));

const viewButtons = document.querySelectorAll(".side-link");
const views = {
  itemsAdmin: document.getElementById("itemsAdmin"),
  pendingAdmin: document.getElementById("pendingAdmin"),
  activeAdmin: document.getElementById("activeAdmin"),
  historyAdmin: document.getElementById("historyAdmin"),
};
viewButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    viewButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const v = btn.dataset.view;
    Object.keys(views).forEach((key) => (views[key].hidden = key !== v));
  })
);

const toast = document.getElementById("toast");
function showToast(msg, ms = 2200) {
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), ms);
}

// Dashboard elements
const statTotalItems = document.getElementById("statTotalItems");
const statActiveLoans = document.getElementById("statActiveLoans");
const statPendingLoans = document.getElementById("statPendingLoans");

// Items form
const itemForm = document.getElementById("itemForm");
const itemIdEl = document.getElementById("itemId");
const itemNameEl = document.getElementById("itemName");
const itemTotalEl = document.getElementById("itemTotal");
const itemAvailEl = document.getElementById("itemAvailable");
const itemDescEl = document.getElementById("itemDesc");
const itemSubmitBtn = document.getElementById("itemSubmitBtn");
const itemResetBtn = document.getElementById("itemResetBtn");

const itemsGrid = document.getElementById("itemsAdminGrid");
const itemsAdminLoading = document.getElementById("itemsAdminLoading");
const itemsAdminError = document.getElementById("itemsAdminError");
const itemSearchEl = document.getElementById("itemSearch");

const pendingTbody = document.getElementById("pendingTableBody");
const pendingLoading = document.getElementById("pendingLoading");
const pendingError = document.getElementById("pendingError");

const activeTbody = document.getElementById("activeTableBody");
const activeLoading = document.getElementById("activeLoading");
const activeError = document.getElementById("activeError");

const historyTbody = document.getElementById("historyTableBody");
const historyLoading = document.getElementById("historyLoading");
const historyError = document.getElementById("historyError");

let currentUser = null;
let userCache = new Map(); // uid -> email
let itemCache = new Map(); // id -> item
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

// ========== Items ==========
itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = itemNameEl.value.trim();
  const total = Number(itemTotalEl.value);
  const avail = Number(itemAvailEl.value);
  const desc = itemDescEl.value.trim();

  if (!name) return alert("กรอกชื่ออุปกรณ์");
  if (total < 0 || avail < 0) return alert("จำนวนต้องไม่ติดลบ");
  if (avail > total) return alert("คงเหลือต้องไม่เกินจำนวนทั้งหมด");

  const payload = { name, totalStock: total, availableStock: avail, description: desc };

  try {
    itemSubmitBtn.disabled = true;
    if (itemIdEl.value) {
      await updateDoc(doc(db, "items", itemIdEl.value), payload);
      showToast("อัปเดตอุปกรณ์แล้ว");
    } else {
      await addDoc(collection(db, "items"), payload);
      showToast("เพิ่มอุปกรณ์แล้ว");
    }
    itemForm.reset();
    itemIdEl.value = "";
    await refreshItems();
    updateStats();
  } catch (e) {
    alert("บันทึกล้มเหลว: " + (e?.message || e));
  } finally {
    itemSubmitBtn.disabled = false;
  }
});

itemResetBtn.addEventListener("click", () => {
  itemIdEl.value = "";
});

async function refreshItems() {
  try {
    itemsAdminError.hidden = true;
    itemsAdminLoading.hidden = false;
    itemCache.clear();
    const snap = await getDocs(collection(db, "items"));
    const items = [];
    snap.forEach((d) => {
      const it = { id: d.id, ...d.data() };
      itemCache.set(it.id, it);
      items.push(it);
    });
    allItems = items;
    renderItems(items);
  } catch (e) {
    console.error(e);
    itemsAdminError.textContent = e?.message || "โหลดอุปกรณ์ล้มเหลว";
    itemsAdminError.hidden = false;
  } finally {
    itemsAdminLoading.hidden = true;
  }
}

function renderItems(items) {
  itemsGrid.innerHTML = items.map((it) => renderItemCard(it)).join("");

  // bind
  itemsGrid.querySelectorAll("[data-action='edit']").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      const it = itemCache.get(id);
      if (!it) return;
      itemIdEl.value = id;
      itemNameEl.value = it.name || "";
      itemTotalEl.value = it.totalStock ?? 0;
      itemAvailEl.value = it.availableStock ?? 0;
      itemDescEl.value = it.description || "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    })
  );
  itemsGrid.querySelectorAll("[data-action='delete']").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.id;
      if (!confirm("ลบอุปกรณ์นี้?")) return;
      try {
        await deleteDoc(doc(db, "items", id));
        showToast("ลบแล้ว");
        await refreshItems();
        updateStats();
      } catch (e) {
        alert("ลบล้มเหลว: " + (e?.message || e));
      }
    })
  );
}

function renderItemCard(it) {
  const out = it.availableStock ?? 0;
  const total = it.totalStock ?? 0;
  return `
    <article class="item-card">
      <div class="item-head">
        <div class="item-name">${escapeHtml(it.name || "—")}</div>
        <span class="badge ${out>0?"":"danger"}">${out}/${total}</span>
      </div>
      <p class="muted">${escapeHtml(it.description || "")}</p>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" data-action="edit" data-id="${it.id}">แก้ไข</button>
        <button class="btn btn-danger" data-action="delete" data-id="${it.id}">ลบ</button>
      </div>
    </article>
  `;
}

// Search filter
itemSearchEl?.addEventListener("input", () => {
  const q = itemSearchEl.value.trim().toLowerCase();
  const filtered = allItems.filter((it) => (it.name || "").toLowerCase().includes(q));
  renderItems(filtered);
});

// ========== Pending Requests ==========
async function refreshPending() {
  try {
    pendingError.hidden = true;
    pendingLoading.hidden = false;

    const qref = query(
      collection(db, "loans"),
      where("status", "==", "pending"),
      orderBy("requestedAt", "asc")
    );
    const snap = await getDocs(qref);
    const rows = [];
    for (const d of snap.docs) {
      const loan = { id: d.id, ...d.data() };
      const item = await safeGetItem(loan.itemId);
      const borrower = await safeGetUser(loan.borrowerUid);
      rows.push(renderPendingRow(loan, item, borrower));
    }
    pendingTbody.innerHTML = rows.join("");

    pendingTbody.querySelectorAll("[data-action='approve']").forEach((b) =>
      b.addEventListener("click", () => changeLoanStatus(b.dataset.id, "approve"))
    );
    pendingTbody.querySelectorAll("[data-action='reject']").forEach((b) =>
      b.addEventListener("click", () => changeLoanStatus(b.dataset.id, "reject"))
    );
    updateStats();
  } catch (e) {
    console.error(e);
    pendingError.textContent = e?.message || "โหลดคำขอยืมล้มเหลว";
    pendingError.hidden = false;
  } finally {
    pendingLoading.hidden = true;
  }
}

function renderPendingRow(loan, item, borrower) {
  return `
    <tr>
      <td>${escapeHtml(item?.name || "—")}</td>
      <td>${escapeHtml(borrower?.email || loan.borrowerUid)}</td>
      <td>${fmt(tsToDate(loan.requestedAt))}</td>
      <td>
        <button class="btn btn-ok" data-action="approve" data-id="${loan.id}">อนุมัติ</button>
        <button class="btn btn-danger" data-action="reject" data-id="${loan.id}">ปฏิเสธ</button>
      </td>
    </tr>
  `;
}

async function changeLoanStatus(loanId, action) {
  try {
    await runTransaction(db, async (tx) => {
      const lref = doc(db, "loans", loanId);
      const lsnap = await tx.get(lref);
      if (!lsnap.exists()) throw new Error("ไม่พบคำขอยืม");
      const loan = lsnap.data();

      const iref = doc(db, "items", loan.itemId);
      const isnap = await tx.get(iref);
      if (!isnap.exists()) throw new Error("ไม่พบอุปกรณ์");
      const item = isnap.data();

      if (action === "approve") {
        if ((item.availableStock ?? 0) <= 0) throw new Error("สต๊อกไม่พอ");
        const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        tx.update(lref, { status: "approved", dueAt, requestedAt: loan.requestedAt ?? serverTimestamp() });
        tx.update(iref, { availableStock: (item.availableStock ?? 0) - 1 });
      } else if (action === "reject") {
        tx.update(lref, { status: "rejected" });
      }
    });
    showToast(action === "approve" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว");
    await refreshPending();
    await refreshActive();
    await refreshItems();
    updateStats();
  } catch (e) {
    alert("อัปเดตคำขอล้มเหลว: " + (e?.message || e));
  }
}

// ========== Active Loans ==========
async function refreshActive() {
  try {
    activeError.hidden = true;
    activeLoading.hidden = false;

    const qref = query(
      collection(db, "loans"),
      where("status", "==", "approved"),
      orderBy("dueAt", "asc")
    );
    const snap = await getDocs(qref);
    const rows = [];
    for (const d of snap.docs) {
      const loan = { id: d.id, ...d.data() };
      const item = await safeGetItem(loan.itemId);
      const borrower = await safeGetUser(loan.borrowerUid);
      rows.push(renderActiveRow(loan, item, borrower));
    }
    activeTbody.innerHTML = rows.join("");

    activeTbody.querySelectorAll("[data-action='return']").forEach((b) =>
      b.addEventListener("click", () => recordReturn(b.dataset.id))
    );
    updateStats();
  } catch (e) {
    console.error(e);
    activeError.textContent = e?.message || "โหลดรายการยืมอยู่ล้มเหลว";
    activeError.hidden = false;
  } finally {
    activeLoading.hidden = true;
  }
}

function renderActiveRow(loan, item, borrower) {
  return `
    <tr>
      <td>${escapeHtml(item?.name || "—")}</td>
      <td>${escapeHtml(borrower?.email || loan.borrowerUid)}</td>
      <td>${fmt(tsToDate(loan.dueAt))}</td>
      <td><span class="badge">อนุมัติ</span></td>
      <td><button class="btn btn-warn" data-action="return" data-id="${loan.id}">บันทึกการคืน</button></td>
    </tr>
  `;
}

async function recordReturn(loanId) {
  try {
    await runTransaction(db, async (tx) => {
      const lref = doc(db, "loans", loanId);
      const lsnap = await tx.get(lref);
      if (!lsnap.exists()) throw new Error("ไม่พบรายการ");
      const loan = lsnap.data();

      const iref = doc(db, "items", loan.itemId);
      const isnap = await tx.get(iref);
      if (!isnap.exists()) throw new Error("ไม่พบอุปกรณ์");
      const item = isnap.data();

      tx.update(lref, { status: "returned", returnedAt: serverTimestamp() });
      tx.update(iref, { availableStock: (item.availableStock ?? 0) + 1 });
    });
    showToast("คืนของแล้ว");
    await refreshActive();
    await refreshItems();
    await refreshHistory();
    updateStats();
  } catch (e) {
    alert("บันทึกการคืนล้มเหลว: " + (e?.message || e));
  }
}

// ========== History ==========
async function refreshHistory() {
  try {
    historyError.hidden = true;
    historyLoading.hidden = false;

    const qref = query(
      collection(db, "loans"),
      where("status", "==", "returned"),
      orderBy("returnedAt", "desc")
    );
    const snap = await getDocs(qref);
    const rows = [];
    for (const d of snap.docs) {
      const loan = { id: d.id, ...d.data() };
      const item = await safeGetItem(loan.itemId);
      const borrower = await safeGetUser(loan.borrowerUid);
      rows.push(renderHistoryRow(loan, item, borrower));
    }
    historyTbody.innerHTML = rows.join("");
  } catch (e) {
    console.error(e);
    historyError.textContent = e?.message || "โหลดประวัติล้มเหลว";
    historyError.hidden = false;
  } finally {
    historyLoading.hidden = true;
  }
}

function renderHistoryRow(loan, item, borrower) {
  return `
    <tr>
      <td>${escapeHtml(item?.name || "—")}</td>
      <td>${escapeHtml(borrower?.email || loan.borrowerUid)}</td>
      <td>${fmt(tsToDate(loan.returnedAt))}</td>
      <td><span class="badge">คืนแล้ว</span></td>
    </tr>
  `;
}

// ========== helpers ==========
async function safeGetItem(id) {
  if (!id) return null;
  if (itemCache.has(id)) return itemCache.get(id);
  const snap = await getDoc(doc(db, "items", id));
  if (!snap.exists()) return null;
  const it = { id: snap.id, ...snap.data() };
  itemCache.set(id, it);
  return it;
}

async function safeGetUser(uid) {
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return { email: "(ไม่พบ)" };
  const u = snap.data();
  userCache.set(uid, u);
  return u;
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return null;
}
function fmt(d) {
  if (!d) return "—";
  return d.toLocaleString();
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Update stats on top dashboard
async function updateStats() {
  try {
    statTotalItems.textContent = allItems.length;

    const pendingSnap = await getDocs(query(collection(db, "loans"), where("status", "==", "pending")));
    statPendingLoans.textContent = pendingSnap.size;

    const activeSnap = await getDocs(query(collection(db, "loans"), where("status", "==", "approved")));
    statActiveLoans.textContent = activeSnap.size;
  } catch (e) {
    console.error("อัปเดตสถิติล้มเหลว:", e);
  }
}
