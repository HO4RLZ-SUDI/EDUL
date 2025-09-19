// student.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// UI refs
const itemsView = document.getElementById("itemsView");
const historyView = document.getElementById("historyView");
const navlinks = document.querySelectorAll(".nav .navlink");
const itemsGrid = document.getElementById("itemsGrid");
const itemsLoading = document.getElementById("itemsLoading");
const itemsError = document.getElementById("itemsError");
const historyLoading = document.getElementById("historyLoading");
const historyError = document.getElementById("historyError");
const historyTableBody = document.getElementById("historyTableBody");
const toast = document.getElementById("toast");

// simple toast
function showToast(msg, ms = 2200) {
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), ms);
}

// Nav switch
navlinks.forEach((b) =>
  b.addEventListener("click", () => {
    navlinks.forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    const v = b.dataset.view;
    itemsView.hidden = v !== "itemsView";
    historyView.hidden = v !== "historyView";
  })
);

let currentUser = null;
let itemCache = new Map(); // id -> item

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
  try {
    itemsError.hidden = true;
    itemsLoading.hidden = false;

    const snap = await getDocs(collection(db, "items"));
    const items = [];
    itemCache.clear();
    snap.forEach((d) => {
      const it = { id: d.id, ...d.data() };
      items.push(it);
      itemCache.set(it.id, it);
    });

    itemsGrid.innerHTML = items
      .map((it) => {
        const out = it.availableStock ?? 0;
        const total = it.totalStock ?? 0;
        const can = out > 0;
        return `
        <article class="item-card">
          <div class="item-head">
            <div class="item-name">${escapeHtml(it.name || "—")}</div>
            <span class="badge ${can ? "" : "danger"}">${out}/${total}</span>
          </div>
          <p class="muted">${escapeHtml(it.description || "")}</p>
          <button class="btn ${can ? "btn-primary" : "btn-ghost"}"
            data-action="request" data-id="${it.id}" ${can ? "" : "disabled"}>
            ${can ? "ขอยืม" : "หมด"}
          </button>
        </article>`;
      })
      .join("");

    // bind click
    itemsGrid.querySelectorAll("[data-action='request']").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const itemId = btn.dataset.id;
        await requestLoan(itemId, btn);
      })
    );
  } catch (e) {
    console.error(e);
    itemsError.textContent = e?.message || "โหลดอุปกรณ์ล้มเหลว";
    itemsError.hidden = false;
  } finally {
    itemsLoading.hidden = true;
  }
}

async function requestLoan(itemId, btn) {
  if (!currentUser) return;
  try {
    btn.disabled = true;
    btn.textContent = "กำลังส่งคำขอ...";
    // ไม่ลดสต๊อกตอน pending — จะลดตอน admin อนุมัติ
    await addDoc(collection(db, "loans"), {
      itemId,
      borrowerUid: currentUser.uid,
      status: "pending",
      requestedAt: serverTimestamp(),
      dueAt: null,
      returnedAt: null,
    });
    showToast("ส่งคำขอแล้ว (รออนุมัติ)");
  } catch (e) {
    alert("ส่งคำขอล้มเหลว: " + (e?.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = "ขอยืม";
  }
}

async function loadHistory() {
  try {
    historyError.hidden = true;
    historyLoading.hidden = false;
    if (!currentUser) return;

    const qref = query(
      collection(db, "loans"),
      where("borrowerUid", "==", currentUser.uid),
      orderBy("requestedAt", "desc")
    );
    const snap = await getDocs(qref);
    const rows = [];
    snap.forEach((d) => {
      const lo = { id: d.id, ...d.data() };
      const it = itemCache.get(lo.itemId);
      rows.push(renderRow(lo, it));
    });
    historyTableBody.innerHTML = rows.join("");
  } catch (e) {
    console.error(e);
    historyError.textContent = e?.message || "โหลดประวัติล้มเหลว";
    historyError.hidden = false;
  } finally {
    historyLoading.hidden = true;
  }
}

function renderRow(loan, item) {
  const statusMap = {
    pending: `<span class="badge gray">รออนุมัติ</span>`,
    approved: `<span class="badge">อนุมัติ</span>`,
    rejected: `<span class="badge danger">ปฏิเสธ</span>`,
    returned: `<span class="badge gray">คืนแล้ว</span>`,
  };
  const req = tsToDate(loan.requestedAt);
  const due = tsToDate(loan.dueAt);
  return `
    <tr>
      <td>${escapeHtml(item?.name || "อุปกรณ์")}</td>
      <td>${statusMap[loan.status] || loan.status}</td>
      <td>${fmt(req)}</td>
      <td>${fmt(due)}</td>
    </tr>`;
}

// helpers
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
