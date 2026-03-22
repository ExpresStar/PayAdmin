/* ===================================================
   PayAdmin - Financial Management System
   script.js  —  Supabase Edition
   All dummy data removed. Supabase is the only source.
   =================================================== */

"use strict";

// ─────────────────────────────────────────────────────
//  SUPABASE CONFIG
//  Replace the two strings below with your project values.
//  URL  : Project Settings → API → Project URL
//  KEY  : Project Settings → API → anon / public key
// ─────────────────────────────────────────────────────
const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY = "sb_publishable_pkZOPM-0BRpiLyMdHn8UJA_K4kI8hnx";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const WORKERS = ["anan78", "xiaoxian99", "xiaoting99", "yaer78", "bobi908"];

// ─────────────────────────────────────────────────────
//  FIELD MAP  (exact Supabase column names from schema)
//
//  transactions table:
//    id               uuid   PK
//    transaction_id   text
//    order_id         text
//    account_number   text
//    account_name     text
//    bank_name        text
//    amount           numeric
//    status           text
//    source           text   (optional - rendered blank if absent)
//    created_at       timestamp
//    process_time     timestamp
//    completed_time   timestamp
//
//  transaction_logs table:
//    id               uuid   PK
//    transaction_id   uuid   FK → transactions.id
//    action           text
//    note             text
//    created_at       timestamp
// ─────────────────────────────────────────────────────

function selectBank(bankName) {
  console.log("Klik bank:", bankName);

  selectedBank = bankName; // ⬅️ pakai ini, bukan account number

  // set dropdown biar kelihatan kepilih
  const bankFilter = document.getElementById("f-bank");
  if (bankFilter) bankFilter.value = bankName;

  switchPage("transactions");

  currentPage = 1;
  loadTransactions();
}
// ─────────────────────────────────────────────────────
//  STATE  — no dummy data here anymore
// ─────────────────────────────────────────────────────
let currentUser = "admin";
let txCache = []; // current page rows, used by modal lookups
let filteredTotal = 0; // server-side count for pagination
let currentPage = 1;
const PAGE_SIZE = 15;

let rejectTargetId = null;
let confirmTargetId = null;
let checkTargetId = null;
let checkNameTargetId = null;
let historyTotal = 0;
let isBotRunning = false;
let botHost = null;
let lastTime = Date.now();
let historyPage = 1;
const HISTORY_LIMIT = 10;
let selectedBank = null; // for filtering
let isSearching = false;
let presenceChannel = null; // ⬅️ Global agar bisa ditutup saat logout

// function jam

function getCurrentHour() {
  const now = new Date();
  return now.getHours(); // Browser Anda sudah WIB, tidak perlu +7 lagi
}

function getTrafficConfig() {
  // SELALU CEPAT (Sesuai permintaan user: 2-4 detik)
  return {
    insertDelay: [2000, 4000], 
    processDelay: [5000, 15000], 
  };
}

// ─────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────
function fmtAmount(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("vi-VN") + " VND";
}

function fmtTime(iso) {
  if (!iso) return '<span style="color:#ccc">—</span>';

  const d = new Date(iso);

  // tambah +7 jam manual (WIB)
  d.setHours(d.getHours() + 7);

  const date = d.toLocaleDateString("id-ID");
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return `<span class="td-time">${date}<br>${time}</span>`;
}

function statusBadge(status) {
  const map = {
    Pending: "badge badge-pending",
    Processing: "badge badge-processing",
    Completed: "badge badge-completed",
    Failed: "badge badge-failed",
  };
  return `<span class="${map[status] || "badge"}">${status || "—"}</span>`;
}

function shortBank(name) {
  if (!name) return "—";
  const map = {
    Vietcombank: "VCB",
    Techcombank: "TCB",
    "MB Bank": "MB",
    ACB: "ACB",
    BIDV: "BIDV",
    VPBank: "VPB",
    VietinBank: "VTB",
    OCB: "OCB",
    MSB: "MSB",
    LPBank: "LPB",
    "Sacombank": "SCB",
  };
  return map[name] || name.slice(0, 4).toUpperCase();
}

function showTableLoading() {
  document.getElementById("tx-tbody").innerHTML = Array.from({ length: 8 })
    .map(
      () =>
        `<tr style="opacity:0.45">${Array.from({ length: 14 })
          .map(
            () =>
              `<td><div style="height:11px;background:#e5e7eb;border-radius:3px;width:80%"></div></td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
}

function showTableEmpty(msg) {
  document.getElementById("tx-tbody").innerHTML =
    `<tr><td colspan="14" style="text-align:center;padding:30px;color:#9ca3af;font-size:12px">${msg || "No transactions found."}</td></tr>`;
}

function findTx(uid) {
  return txCache.find((t) => t.id === uid) || null;
}

// ─────────────────────────────────────────────────────
//  DETERMINISTIC PROOF MISMATCH (Sifat Manusia)
// ─────────────────────────────────────────────────────
function getProofUrl(tx) {
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return hash;
  }

  let pName = tx.account_name || "UNKNOWN";
  let pBank = tx.bank_name || "Vietcombank";
  let pPhone = tx.account_number || "—";
  let pAmount = tx.amount || 0;
  
  // Deterministic random based on transaction_id
  const h = Math.abs(hashString(tx.transaction_id || ""));
  
  // 25% chance of mismatch BETWEEN table and uploaded proof
  if (h % 4 === 0) {
    const errType = h % 3;
    if (errType === 0) {
      // Name typo on proof
      pName = pName.split(" ")[0] || pName; 
    } else if (errType === 1) {
      // Amount typo on proof (e.g. they transferred 100k but receipt says 50k, or vice versa)
      pAmount = pAmount + ((h % 5) + 1) * 10000; 
    } else {
      // Bank typo on proof
      const banks = ["Vietcombank", "Techcombank", "MB Bank", "ACB"];
      pBank = banks[(h % banks.length)];
    }
  }

  const qName = encodeURIComponent(pName);
  const qBank = encodeURIComponent(pBank);
  const qPhone = encodeURIComponent(pPhone);
  const qAmount = encodeURIComponent(pAmount);
  const qCreated = encodeURIComponent(tx.created_at || "");
  const qLogo = encodeURIComponent(BANK_LOGO[pBank] || "");
  
  return `proof.html?id=${encodeURIComponent(tx.transaction_id)}&name=${qName}&bank=${qBank}&phone=${qPhone}&amount=${qAmount}&created=${qCreated}&logo=${qLogo}`;
}

// ─────────────────────────────────────────────────────
//  CORE DATA LAYER
// ─────────────────────────────────────────────────────
async function loadTransactions() {
  showTableLoading();

  const fTxId = (document.getElementById("f-txid")?.value || "").trim();
  const fOrderId = (document.getElementById("f-orderid")?.value || "").trim();
  const fAccNum = (document.getElementById("f-accnum")?.value || "").trim();
  const fAccName = (document.getElementById("f-accname")?.value || "").trim();
  const fStatus = document.getElementById("f-status")?.value || "";
  const fBank = document.getElementById("f-bank")?.value || "";
  const fDateFrom = document.getElementById("f-date-from")?.value || "";
  const fDateTo = document.getElementById("f-date-to")?.value || "";

  let query = sb
    .from("transactions")
    .select("*", { count: "exact" })
    .not("status", "ilike", "completed")
    .not("status", "ilike", "failed");

  if (fTxId) query = query.ilike("transaction_id", `%${fTxId}%`);
  if (fOrderId) query = query.ilike("order_id", `%${fOrderId}%`);
  if (fAccNum) query = query.ilike("account_number", `%${fAccNum}%`);
  if (fAccName) query = query.ilike("account_name", `%${fAccName}%`);
  if (fStatus) query = query.eq("status", fStatus);
  if (fBank) query = query.eq("bank_name", fBank);
  // ✅ FINAL TIMEZONE FIX (Local to UTC Boundary)
  if (fDateFrom) {
    // Ambil jam 00:00 pagi ini di waktu laptop Anda, lalu konversi ke dunia nyata (UTC)
    const localStart = new Date(fDateFrom + "T00:00:00");
    query = query.gte("created_at", localStart.toISOString());
  }
  if (fDateTo) {
    // Ambil jam 23:59 malam ini di waktu laptop Anda, lalu konversi ke dunia nyata (UTC)
    const localEnd = new Date(fDateTo + "T23:59:59");
    query = query.lte("created_at", localEnd.toISOString());
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.order("created_at", { ascending: true }).range(from, to);

  const { data, error, count } = await query;

  // AUTO ASSIGN
  // for (let tx of data) {
  //   const createdTime = new Date(tx.created_at).getTime();
  //   const now = Date.now();

  //   // ⏱️ kasih delay 10 detik sebelum bot boleh ambil
  //   if (!tx.assigned_to && now - createdTime > 10000) {
  //     const randomWorker = WORKERS[Math.floor(Math.random() * WORKERS.length)];

  //     // update transaksi
  //     await sb
  //       .from("transactions")
  //       .update({ assigned_to: randomWorker })
  //       .eq("id", tx.id);

  //     // ✅ TAMBAH LOG DI SINI
  //     await sb.from("transaction_logs").insert({
  //       transaction_id: tx.id,
  //       action: "Assigned",
  //       note: "Auto assigned to " + randomWorker,
  //       actor: "system",
  //     });

  //     tx.assigned_to = randomWorker;
  //   }
  // }

  if (error) {
    console.error("[loadTransactions]", error);
    showTableEmpty("⚠ Failed to load: " + error.message);
    return;
  }

  filteredTotal = count ?? 0;
  txCache = data ?? [];

  renderTable(txCache);
  buildPagination();
}

// ─────────────────────────────────────────────────────
//  renderTable()  — maps exact Supabase field names
// ─────────────────────────────────────────────────────
function renderTable(rows) {
  const tbody = document.getElementById("tx-tbody");
  const nowMs = Date.now();

  if (!rows || rows.length === 0) {
    showTableEmpty();
    return;
  }

  tbody.innerHTML = rows
    .map((tx) => {
      const uid = tx.id;
      const txId = tx.transaction_id || "—";
      const orderId = tx.order_id || "—";
      const accNum = tx.account_number || "—";
      const accName = tx.account_name || "—";
      const bankFull = tx.bank_name || "—";
      const bankShort = shortBank(bankFull);
      const amount = tx.amount;
      const status = tx.status || "pending";
      const source = tx.source || "";
      const createdAt = tx.created_at;
      const processTime = tx.process_time;
      const completedAt = tx.completed_time;

      let pastProcess = false;

      if (processTime) {
        const pt = new Date(processTime);
        pt.setHours(pt.getHours() + 7); // WIB

        pastProcess = nowMs >= pt.getTime();
      }
      const statusLower = (status || "").toLowerCase().trim();

      const isActive = statusLower !== "completed" && statusLower !== "failed";

      const confirmBtn =
        pastProcess && isActive
          ? `<button class="abtn abtn-confirm" onclick="openConfirm('${uid}')">✎ Confirm</button>`
          : "";
      const rejectBtn = isActive
        ? `<button class="abtn abtn-reject" onclick="openReject('${uid}')">✎ Reject</button>`
        : "";
      const detailBtn = `<button class="abtn abtn-detail" onclick="openDetail('${uid}')">✎ Detail</button>`;
      const proofBtn = `<a href="${getProofUrl(tx)}" target="_blank"><button class="abtn abtn-proof">✎ Proof</button></a>`;
      const checkNumBtn = `<button class="abtn abtn-checknum"  onclick="openCheckNum('${uid}')">✎ Chk No.</button>`;
      const checkNameBtn = `<button class="abtn abtn-checkname" onclick="openCheckName('${uid}')">✎ Chk Name</button>`;

      const txIdA = txId.slice(0, 16),
        txIdB = txId.slice(16);
      const orIdA = orderId.slice(0, 16),
        orIdB = orderId.slice(16);
      const ptStyle = pastProcess ? "color:#10b981" : "color:#f59e0b";

      return `<tr>
      <td class="td-check" style="text-align:center"><input type="checkbox" class="row-check"></td>
      <td class="td-id" style="text-align:center">${txIdA}${txIdB ? `<br><small style="color:#9ca3af">${txIdB}</small>` : ""}</td>
      <td class="td-order" style="text-align:center;color:#6b7280;font-size:11px">${orIdA}${orIdB ? `<br><small>${orIdB}</small>` : ""}</td>
      <td style="text-align:center;font-family:monospace;font-size:11px">${accNum}</td>
      <td class="td-amount" style="text-align:right">${fmtAmount(amount)}</td>
      <td style="text-align:center;font-size:11px;font-weight:600;color:#6366f1">${accName}</td>
      <td style="text-align:center"><span style="font-size:10px;font-weight:700;background:#f0f9ff;padding:2px 6px;border-radius:3px;border:1px solid #bae6fd;color:#0369a1">${bankShort}</span></td>
      <td style="text-align:center">${statusBadge(status)}</td>
      <td style="text-align:center">${source ? `<span class="badge badge-source" style="font-size:9px">${source.split(" ")[0]}</span>` : '<span style="color:#ccc">—</span>'}</td>
      <td style="text-align:center">${fmtTime(createdAt)}</td>
      <td style="text-align:center;${ptStyle}">${fmtTime(processTime)}</td>
      <td style="text-align:center">${fmtTime(completedAt)}</td>
      <td>
        <div class="action-group">
          ${confirmBtn}${rejectBtn}${detailBtn}${proofBtn}
        </div>
      </td>
      <td>
        <div class="action-group">
          ${checkNumBtn}${checkNameBtn}
        </div>
      </td>
    </tr>`;
    })
    .join("");
}

// ─────────────────────────────────────────────────────
//  PAGINATION  (server-side count)
// ─────────────────────────────────────────────────────
function buildPagination() {
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  document.getElementById("pagination-info").textContent =
    `Page ${currentPage} of ${totalPages} · ${PAGE_SIZE} per page · Total: ${filteredTotal}`;

  const btnsEl = document.getElementById("pagination-btns");
  btnsEl.innerHTML = "";

  const mk = (label, disabled, fn) => {
    const b = document.createElement("button");
    b.className = "pgbtn";
    b.textContent = label;
    b.disabled = disabled;
    b.onclick = fn;
    return b;
  };

  btnsEl.appendChild(
    mk("‹", currentPage <= 1, () => {
      if (currentPage > 1) {
        currentPage--;
        loadTransactions();
      }
    }),
  );

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) {
    const b = document.createElement("button");
    b.className = "pgbtn" + (i === currentPage ? " active" : "");
    b.textContent = i;
    b.onclick = ((pg) => () => {
      currentPage = pg;
      loadTransactions();
    })(i);
    btnsEl.appendChild(b);
  }

  btnsEl.appendChild(
    mk("›", currentPage >= totalPages, () => {
      if (currentPage < totalPages) {
        currentPage++;
        loadTransactions();
      }
    }),
  );
}

// ─────────────────────────────────────────────────────
//  FILTER CONTROLS
// ─────────────────────────────────────────────────────
function searchTransactions() {
  currentPage = 1;
  loadTransactions();
}

function resetFilters() {
  [
    "f-txid",
    "f-orderid",
    "f-accnum",
    "f-accname",
    "f-date-from",
    "f-date-to",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("f-status").value = "";
  document.getElementById("f-bank").value = "";
  currentPage = 1;
  loadTransactions();
}

function getLocalDate(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function filterToday() {
  const today = getLocalDate();
  document.getElementById("f-date-from").value = today;
  document.getElementById("f-date-to").value = today;
  currentPage = 1;
  loadTransactions();
}

function filterYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = getLocalDate(d);
  document.getElementById("f-date-from").value = y;
  document.getElementById("f-date-to").value = y;
  currentPage = 1;
  loadTransactions();
}

function toggleAll(cb) {
  document
    .querySelectorAll(".row-check")
    .forEach((c) => (c.checked = cb.checked));
}

// ─────────────────────────────────────────────────────
//  LOGIN / LOGOUT
// ─────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  const errEl = document.getElementById("login-error");

  if (!email || !password) {
    errEl.style.display = "block";
    errEl.textContent = "Isi email & password";
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    errEl.style.display = "block";
    errEl.textContent = error.message;
    return;
  }

  // 🔐 UNIFIED MASTER 2FA VERIFICATION (Satu Kunci untuk Semua Admin)
  const twoFACode = document.getElementById("login-2fa").value.trim();
  const MASTER_SECRET = "PAYADMIN24MSTRKY";
  
  const userEmail = data.user.email.toLowerCase();

  try {
    // 🕵️‍♂️ Cek Library
    if (typeof otplib === "undefined") {
      throw new Error("Pustaka Keamanan (otplib) gagal dimuat! Periksa koneksi internet atau CDN URL.");
    }
    if (!otplib.authenticator) {
      throw new Error("Pustaka Keamanan (otplib) dimuat tapi (authenticator) tidak ditemukan.");
    }
    
    const cleanCode = twoFACode.replace(/\s/g, ""); 
    const isValid = otplib.authenticator.check(cleanCode, MASTER_SECRET);
    
    if (!isValid) {
      errEl.style.display = "block";
      errEl.textContent = `Security Code salah untuk ${userEmail}! 🛡️`;
      return;
    }
  } catch (err) {
    console.error("2FA Error:", err);
    errEl.style.display = "block";
    errEl.textContent = `Sistem Eror: ${err.message}`;
    return;
  }

  const user = data.user;

  currentUser = user.email;

  document.getElementById("topbar-username").textContent = user.email;
  document.getElementById("sidebar-username").textContent = user.email;
  document.getElementById("user-avatar-text").textContent = user.email
    .slice(0, 2)
    .toUpperCase();

  document.getElementById("login-page").style.display = "none";
  document.getElementById("app").style.display = "flex";

  loadDashboardStats();
  await ensureBanksExist();
  loadBanks();
  subscribeAppRealtime();
  initPresence(); // <--- Mulai lacak kehadiran admin
}

async function ensureBanksExist() {
  const defaultBanks = [
    { name: 'Vietcombank', account_number: '0123456789' },
    { name: 'Techcombank', account_number: '0987654321' },
    { name: 'MB Bank', account_number: '8112233445' },
    { name: 'BIDV', account_number: '0223344566' },
    { name: 'ACB', account_number: '0334455667' },
    { name: 'VPBank', account_number: '012345678' },
    { name: 'VietinBank', account_number: '023456789' },
    { name: 'OCB', account_number: '034567890' },
    { name: 'MSB', account_number: '045678901' },
    { name: 'LPBank', account_number: '056789012' },
    { name: 'Sacombank', account_number: '056783762' },
    { name: 'SHB', account_number: '056725981' },
    { name: 'TPBank', account_number: '467725901' }
  ];

  // 🔍 KITA CEK SATU PER SATU: Biar gak ada yang ketinggalan (seperti TPBank)
  for (const b of defaultBanks) {
    const { data: exists } = await sb.from('banks').select('id').eq('name', b.name).single();
    if (!exists) {
      console.log(`🌱 Seed: Missing ${b.name}, adding now...`);
      await sb.from('banks').insert(b);
    }
  }
}

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    document.getElementById("login-page").style.display !== "none"
  )
    doLogin();
});

function doLogout() {
  // Tutup jalur presence agar langsung hilang dari daftar "Online"
  if (presenceChannel) {
    sb.removeChannel(presenceChannel);
    presenceChannel = null;
  }

  if (confirmTargetId || rejectTargetId) handleAutoUnclaim(confirmTargetId ? "modal-confirm" : "modal-reject");
  document.getElementById("app").style.display = "none";
  document.getElementById("login-page").style.display = "flex";
  document.getElementById("login-user").value = "";
  document.getElementById("login-pass").value = "";
  document.getElementById("login-2fa").value = "";
  txCache = [];
}

// OTOMATIS OFFLINE SAAT TAB DITUTUP
window.addEventListener('beforeunload', () => {
  if (presenceChannel) {
    sb.removeChannel(presenceChannel);
  }
});

// ─────────────────────────────────────────────────────
//  SIDEBAR / NAV / UI CHROME
// ─────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

function switchPage(page, el) {
  document
    .querySelectorAll(".page-section")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  (el || document.querySelector(`[data-page="${page}"]`))?.classList.add(
    "active",
  );
  const names = {
    dashboard: "Dashboard",
    transactions: "Transaction Management",
    banks: "Bank Management",
    reports: "Reports",
    chat: "Internal Chat",
  };
  document.getElementById("topbar-page-name").textContent = names[page] || page;
  if (page === "history") {
    loadHistory();
    // loadLiveMini();
    // subscribeHistoryRealtime();
  }
  if (page === "dashboard") {
    loadDashboardStats();
  }
  if (page === "banks") {
    loadBanks(); // <--- PASTIKAN REFRESH SAAT DIBUKA
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement)
    document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

// ─────────────────────────────────────────────────────
//  TOAST NOTIFICATION
// ─────────────────────────────────────────────────────
let noticeTimer = null;
function showNotice(msg, type = "success") {
  const el = document.getElementById("sys-notice");
  const txt = document.getElementById("sys-notice-text");
  el.className = "sys-notice show " + type;
  txt.textContent = msg;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

// ─────────────────────────────────────────────────────
//  UNIFIED MODAL SYSTEM
// ─────────────────────────────────────────────────────
const MODAL_MAP = {
  confirm: {
    modalId: "modal-confirm",
    textareaId: "confirm-textarea",
    okId: "confirm-btn-ok",
    cancelId: "confirm-btn-cancel",
    hintId: "confirm-hint",
  },
  reject: {
    modalId: "modal-reject",
    textareaId: "reject-textarea",
    okId: "reject-btn-ok",
    cancelId: "reject-btn-cancel",
    hintId: "reject-hint",
  },
  checknum: {
    modalId: "modal-checknum",
    textareaId: "checknum-textarea",
    okId: "checknum-btn-ok",
    cancelId: "checknum-btn-cancel",
    hintId: "checknum-hint",
  },
  checkname: {
    modalId: "modal-checkname",
    textareaId: "checkname-textarea",
    okId: "checkname-btn-ok",
    cancelId: "checkname-btn-cancel",
    hintId: "checkname-hint",
  },
};

function handleModalInput(key) {
  const cfg = MODAL_MAP[key];
  if (!cfg) return;
  const ta = document.getElementById(cfg.textareaId);
  const okBtn = document.getElementById(cfg.okId);
  const cnBtn = document.getElementById(cfg.cancelId);
  const hint = document.getElementById(cfg.hintId);
  const filled = ta.value.trim().length > 0;
  okBtn.disabled = !filled;
  cnBtn.disabled = !filled;
  ta.classList.toggle("has-value", filled);
  if (hint) {
    hint.textContent = filled ? "— ready" : "— type to enable buttons";
    hint.classList.toggle("active", filled);
  }
}

function resetModal(key) {
  const cfg = MODAL_MAP[key];
  if (!cfg) return;
  const ta = document.getElementById(cfg.textareaId);
  const okBtn = document.getElementById(cfg.okId);
  const cnBtn = document.getElementById(cfg.cancelId);
  const hint = document.getElementById(cfg.hintId);
  ta.value = "";
  ta.classList.remove("has-value");
  okBtn.disabled = true;
  cnBtn.disabled = true;
  if (hint) {
    hint.textContent = "— type to enable buttons";
    hint.classList.remove("active");
  }
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  if (id === "modal-confirm" || id === "modal-reject") {
    handleAutoUnclaim(id);
  }
}

async function handleAutoUnclaim(id) {
  const uid = id === "modal-confirm" ? confirmTargetId : rejectTargetId;
  if (!uid) return;

  const { data: latest } = await sb.from('transactions').select('status, assigned_to').eq('id', uid).single();
  if (latest && latest.status === 'Pending' && latest.assigned_to === currentUser) {
    await sb.from('transactions').update({ assigned_to: null }).eq('id', uid);
    if (id === "modal-confirm") confirmTargetId = null;
    if (id === "modal-reject") rejectTargetId = null;
    loadTransactions();
  }
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay"))
    closeModal(e.target.id);
});

// ─────────────────────────────────────────────────────
//  ACTION: CONFIRM CLIENT DATA
// ─────────────────────────────────────────────────────
async function openConfirm(uid) {
  // 🔍 1. FRESH DB CHECK: Ambil status terbaru dari database
  const { data: latest, error } = await sb.from('transactions').select('*').eq('id', uid).single();
  
  if (error || !latest) {
    showNotice("Data tidak ditemukan!", "error");
    return;
  }

  // 🛡️ 2. CHECK STATUS: Jika sudah diproses orang lain, hentikan
  if (latest.status !== 'Pending') {
    showError(`Oops! Transaksi ini sudah <b>${latest.status}</b> oleh <b>${latest.assigned_to || 'admin lain'}</b>.`);
    loadTransactions();
    return;
  }

  // 👤 3. CHECK ASSIGNMENT: Jika sudah diambil orang lain, hentikan
  if (latest.assigned_to && latest.assigned_to !== currentUser) {
    showError(`Gagal! Data ini sedang diproses oleh <b>${latest.assigned_to}</b>.`);
    loadTransactions();
    return;
  }

  // 📝 4. ATOMIC CLAIM: Tandai data jika belum ada yang ambil
  if (!latest.assigned_to) {
    const { error: claimErr } = await sb.from('transactions')
      .update({ assigned_to: currentUser })
      .eq('id', uid)
      .is('assigned_to', null); // Hanya update jika masih kosong di DB
    
    if (claimErr) {
      showError("Gagal mengambil data, mungkin baru saja diambil admin lain.");
      loadTransactions();
      return;
    }
    latest.assigned_to = currentUser;
  }

  confirmTargetId = uid;
  resetModal("confirm");

  document.getElementById("confirm-info").innerHTML = `
    <div style="font-weight:700; color:#1e3a5f; margin-bottom:5px">${latest.transaction_id}</div>
    <div style="font-size:12px; color:#64748b">Claimed by: <b>${latest.assigned_to}</b></div>
  `;

  openModal("modal-confirm");
  requestAnimationFrame(() => document.getElementById("confirm-textarea").focus());
}

async function doConfirmClient() {
  const uid = confirmTargetId;
  const note = document.getElementById("confirm-textarea").value.trim();

  if (!note) return;
  confirmTargetId = null; // Prevent handleAutoUnclaim from clearing successful work
  closeModal("modal-confirm");

  // 🛡️ 1. ATOMIC UPDATE (Pintu Terakhir): Only update if still Pending
  const { data: updated, error: updateErr } = await sb
    .from("transactions")
    .update({ 
      status: "Completed", 
      completed_time: new Date().toISOString(),
      assigned_to: currentUser // Re-ensure correct actor in history
    })
    .eq("id", uid)
    .eq("status", "Pending") // Kunci: Hanya jika masih Pending
    .select();

  if (updateErr || !updated || updated.length === 0) {
    // RACE CONDITION DETECTED!
    const { data: latest } = await sb.from('transactions').select('status, assigned_to').eq('id', uid).single();
    showError(`Gagal! Transaksi ini baru saja <b>${latest?.status || 'selesai'}</b> oleh <b>${latest?.assigned_to || 'admin lain'}</b>.`);
    loadTransactions();
    return;
  }

  // 📜 2. LOGGING: Hanya tulis log jika update di atas BERHASIL
  await sb.from("transaction_logs").insert({
    transaction_id: uid,
    action: "Confirmed",
    note: note,
    actor: currentUser,
  });

  showNotice("Transaction confirmed successfully!", "success");
  loadTransactions();
}

// ─────────────────────────────────────────────────────
//  ACTION: REJECT
// ─────────────────────────────────────────────────────
async function openReject(uid) {
  // 🔍 1. FRESH DB CHECK
  const { data: latest, error } = await sb.from('transactions').select('*').eq('id', uid).single();
  
  if (error || !latest) {
    showNotice("Data tidak ditemukan!", "error");
    return;
  }

  // 🛡️ 2. CHECK STATUS
  if (latest.status !== 'Pending') {
    showError(`Gagal! Transaksi sudah <b>${latest.status}</b> oleh ${latest.assigned_to || 'admin lain'}`);
    loadTransactions();
    return;
  }

  // 👤 3. CHECK ASSIGNMENT
  if (latest.assigned_to && latest.assigned_to !== currentUser) {
    showError(`Oops! Data ini sedang dikerjakan oelh <b>${latest.assigned_to}</b>`);
    loadTransactions();
    return;
  }

  // 📝 4. ATOMIC CLAIM
  if (!latest.assigned_to) {
    const { error: claimErr } = await sb.from('transactions')
      .update({ assigned_to: currentUser })
      .eq('id', uid)
      .is('assigned_to', null);
    
    if (claimErr) {
      showError("Gagal mengambil data, mungkin barusan diambil orang lain.");
      loadTransactions();
      return;
    }
    latest.assigned_to = currentUser;
  }

  rejectTargetId = uid;
  resetModal("reject");

  document.getElementById("reject-info").innerHTML = `
    <div style="font-weight:700; color:#450a0a; margin-bottom:5px">${latest.transaction_id}</div>
    <div style="font-size:12px; color:#991b1b">Claimed by: <b>${latest.assigned_to}</b></div>
  `;

  openModal("modal-reject");
  requestAnimationFrame(() => document.getElementById("reject-textarea").focus());
}

async function confirmReject() {
  const uid = rejectTargetId;
  const note = document.getElementById("reject-textarea").value.trim();

  if (!note) return;
  rejectTargetId = null; // Clear to prevent unclaim on success
  closeModal("modal-reject");

  // 🛡️ ATOMIC UPDATE
  const { data: updated, error: updateErr } = await sb
    .from("transactions")
    .update({ 
      status: "Failed", 
      assigned_to: currentUser,
      completed_time: new Date().toISOString() 
    })
    .eq("id", uid)
    .eq("status", "Pending")
    .select();

  if (updateErr || !updated || updated.length === 0) {
    const { data: latest } = await sb.from('transactions').select('status, assigned_to').eq('id', uid).single();
    showError(`Gagal Reject! Transaksi sudah <b>${latest?.status || 'selesai'}</b> oleh <b>${latest?.assigned_to || 'admin lain'}</b>.`);
    loadTransactions();
    return;
  }

  await sb.from("transaction_logs").insert({
    transaction_id: uid,
    action: "Rejected",
    note: note,
    actor: currentUser,
  });

  showNotice("Transaction rejected.", "error");
  loadTransactions();
}

// ─────────────────────────────────────────────────────
//  ACTION: CHECK ACCOUNT NUMBER
// ─────────────────────────────────────────────────────
function openCheckNum(uid) {
  const tx = findTx(uid);
  if (!tx) return;
  checkTargetId = uid;
  resetModal("checknum");
  document.getElementById("checknum-info").innerHTML = `
    <div class="modal-info-row"><span class="modal-info-label">Transaction Account No.</span><span class="modal-info-val" style="font-family:monospace">${tx.account_number || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">Account Name</span><span class="modal-info-val">${tx.account_name || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">Bank</span><span class="modal-info-val">${tx.bank_name || "—"}</span></div>
    <div class="modal-info-row" style="background:#fffbeb;border-radius:4px;padding:4px 6px;margin-top:4px">
      <span class="modal-info-label" style="color:#92400e">📋 Paste the account number from proof below to verify</span>
    </div>`;
  openModal("modal-checknum");
  setTimeout(() => document.getElementById("checknum-textarea").focus(), 220);
}

async function doCheckNum() {
  const uid = checkTargetId;
  const note = document.getElementById("checknum-textarea").value.trim();

  if (!note) return;
  closeModal("modal-checknum");

  // FRESH DB CHECK
  const { data: latest } = await sb.from('transactions').select('status, assigned_to, account_number').eq('id', uid).single();
  
  if (latest && latest.status !== 'Pending') {
    showError(`Gagal Cek! Transaksi sudah <b>${latest.status}</b> oleh <b>${latest.assigned_to}</b>.`);
    loadTransactions();
    return;
  }

  const match = note === (latest.account_number || "");
  
  showCheckResult(
    "🔢 Account Number Verification",
    "Transaction No.",
    latest.account_number || "—",
    "Input No.",
    note,
    match,
  );
}

// ─────────────────────────────────────────────────────
//  ACTION: CHECK ACCOUNT NAME
// ─────────────────────────────────────────────────────
function openCheckName(uid) {
  const tx = findTx(uid);
  if (!tx) return;
  checkNameTargetId = uid;
  resetModal("checkname");
  document.getElementById("checkname-info").innerHTML = `
    <div class="modal-info-row"><span class="modal-info-label">Transaction Account Name</span><span class="modal-info-val">${tx.account_name || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">Account No.</span><span class="modal-info-val" style="font-family:monospace">${tx.account_number || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">Bank</span><span class="modal-info-val">${tx.bank_name || "—"}</span></div>
    <div class="modal-info-row" style="background:#eff6ff;border-radius:4px;padding:4px 6px;margin-top:4px">
      <span class="modal-info-label" style="color:#1d4ed8">📋 Paste the account name from proof below to verify</span>
    </div>`;
  openModal("modal-checkname");
  setTimeout(() => document.getElementById("checkname-textarea").focus(), 220);
}

async function doCheckName() {
  const uid = checkNameTargetId;
  const note = document.getElementById("checkname-textarea").value.trim();

  if (!note) return;
  closeModal("modal-checkname");

  // 🔍 1. FRESH DB CHECK
  const { data: latest, error } = await sb.from('transactions').select('status, assigned_to, account_name').eq('id', uid).single();
  
  if (error || (latest && latest.status !== 'Pending')) {
    showError(`Gagal Cek! Transaksi sudah <b>${latest?.status || 'selesai'}</b> oleh <b>${latest?.assigned_to || 'admin lain'}</b>.`);
    loadTransactions();
    return;
  }

  const match = note.toUpperCase() === (latest.account_name || "").toUpperCase();
  
  showCheckResult(
    "👤 Account Name Verification",
    "Transaction Name",
    latest.account_name || "—",
    "Input Name",
    note,
    match,
  );
}

// ─────────────────────────────────────────────────────
//  SHARED CHECK RESULT DISPLAY
// ─────────────────────────────────────────────────────
function showCheckResult(title, labelA, valA, labelB, valB, match) {
  document.getElementById("result-modal-title").textContent = title;
  const icon = document.getElementById("result-modal-icon");
  icon.textContent = match ? "✓" : "✗";
  icon.style.background = match ? "#ecfdf5" : "#fef2f2";
  icon.style.color = match ? "#15803d" : "#dc2626";
  document.getElementById("result-body").innerHTML = `
    <div class="check-result">
      <div class="check-row">
        <div class="check-col"><label>${labelA}</label><div class="check-val">${valA}</div></div>
        <div class="check-col"><label>${labelB}</label><div class="check-val">${valB}</div></div>
      </div>
      <div class="match-indicator ${match ? "match-yes" : "match-no"}">
        ${match ? "✓ &nbsp; MATCH" : "✗ &nbsp; NOT MATCH"}
      </div>
    </div>`;
  openModal("modal-result");
}

// ─────────────────────────────────────────────────────
//  DETAIL MODAL  (view-only, no textarea)
// ─────────────────────────────────────────────────────
function openDetail(uid) {
  const tx = findTx(uid);
  if (!tx) return;
  document.getElementById("detail-body").innerHTML = `
    <table class="detail-table">
      <tr><th>Transaction ID</th><td style="font-family:monospace;font-size:10px">${tx.transaction_id || uid}</td></tr>
      <tr><th>Order ID</th><td style="font-family:monospace;font-size:10px">${tx.order_id || "—"}</td></tr>
      <tr><th>Account Number</th><td style="font-family:monospace">${tx.account_number || "—"}</td></tr>
      <tr><th>Account Name</th><td><strong>${tx.account_name || "—"}</strong></td></tr>
      <tr><th>Amount</th><td><strong style="color:#1a7dc4;font-size:14px">${fmtAmount(tx.amount)}</strong></td></tr>
      <tr><th>Bank</th><td>${tx.bank_name || "—"} <span style="color:#9ca3af">(${shortBank(tx.bank_name)})</span></td></tr>
      <tr><th>Status</th><td>${statusBadge(tx.status)}</td></tr>
      <tr><th>Source</th><td>${tx.source ? `<span class="badge badge-source">${tx.source}</span>` : "—"}</td></tr>
      <tr><th>Created At</th><td>${tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}</td></tr>
      <tr><th>Process Time</th><td>${
        tx.process_time
          ? new Date(tx.process_time)
              .toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              })
              .toLocaleString()
          : "—"
      }</td></tr>
      <tr><th>Completed At</th><td>${tx.completed_time ? new Date(tx.completed_time).toLocaleString() : "—"}</td></tr>
    </table>`;
  openModal("modal-detail");
}

// ─────────────────────────────────────────────────────
//  ERROR MODAL (REPLACED BY IMPROVED VERSION)
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────
//  BANK GRID  (static display — not from Supabase)
// ─────────────────────────────────────────────────────
// const BANK_DISPLAY = [
//   { id: "vcb", name: "Vietcombank", color: "#006a4e", bg: "#e6f4f1" },
//   { id: "tcb", name: "Techcombank", color: "#d62828", bg: "#fef2f2" },
//   { id: "mb", name: "MB Bank", color: "#1034a6", bg: "#eff6ff" },
//   { id: "acb", name: "ACB", color: "#0033a0", bg: "#eff6ff" },
//   { id: "bidv", name: "BIDV", color: "#005bac", bg: "#e0f2fe" },
//   { id: "vpb", name: "VPBank", color: "#007a4d", bg: "#ecfdf5" },
// ];


// function buildBankGrid() {
//   document.getElementById("bank-grid").innerHTML = BANK_DISPLAY.map(
//     (b) => `
//     <div class="bank-card" id="bank-card-${b.id}">
//       <div class="bank-card-logo" style="background:${b.bg}">
//         <span style="font-size:22px;font-weight:900;color:${b.color}">${b.id.toUpperCase()}</span>
//       </div>
//       <div class="bank-card-body">
//         <div class="bank-card-name">${b.name}</div>
//         <button class="bank-select-btn" id="bank-btn-${b.id}" onclick="selectBank('${b.id}')">Lựa chọn</button>
//       </div>
//     </div>`,
//   ).join("");
// }

const BANK_LOGO = {
  Vietcombank: "assets/banks/vcb.png",
  Techcombank: "assets/banks/tcb.png",
  "MB Bank": "assets/banks/mb.png",
  BIDV: "assets/banks/bidv.png",
  ACB: "assets/banks/acb.png",
  VPBank: "assets/banks/vpb.png",
  VietinBank: "assets/banks/vtb.png",
  OCB: "assets/banks/ocb.png",
  MSB: "assets/banks/msb.png",
  LPBank: "assets/banks/lpb.png",
  Sacombank: "assets/banks/scb.png",
  SHB: "assets/banks/shb.png",
  TPBank: "assets/banks/tpb.png",
};

// HISTORY

async function loadHistory() {
  const tbody = document.getElementById("history-tbody");
  if (tbody) {
    tbody.innerHTML = Array.from({ length: 8 }).map(() => `<tr style="opacity:0.45; animation: pulse 1.5s infinite;">${Array.from({ length: 8 }).map(() => `<td><div style="height:14px;background:#e5e7eb;border-radius:4px;width:${Math.floor(60 + Math.random() * 30)}%"></div></td>`).join("")}</tr>`).join("");
  }

  const from = (historyPage - 1) * HISTORY_LIMIT;
  const to = from + HISTORY_LIMIT - 1;

  const keyword =
    document.getElementById("history-search")?.value.toLowerCase() || "";

  let query = sb
    .from("transactions")
    .select("*", { count: "exact" })
    .in("status", ["Completed", "Failed"]);

  // ✅ FILTER PINDAH KE DATABASE
  if (keyword) {
    query = query.ilike("assigned_to", `%${keyword}%`);
  }

  const { data, error, count } = await query
    .order("completed_time", { ascending: false })
    .range(from, to);

  if (error) {
    console.error(error);
    return;
  }

  historyTotal = count || 0;

  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#999">No data</td></tr>`;
    return;
  }

  let html = "";

  data.forEach((tx) => {
    const proofUrl = getProofUrl(tx);

    html += `
      <tr>
        <td>${tx.transaction_id}</td>
        <td>${tx.account_name}</td>
        <td>${tx.bank_name}</td>
        <td>${fmtAmount(tx.amount)}</td>
        <td>${statusBadge(tx.status)}</td>
        <td>${fmtTime(tx.completed_time)}</td>
        <td style="font-weight:600">${tx.assigned_to || "-"}</td>
        <td>
          <a href="${proofUrl}" target="_blank">
            <button class="abtn abtn-proof">Proof</button>
          </a>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // ✅ TOTAL BENER (bukan filtered.length)
  document.getElementById("history-summary").innerText =
    `Total ${historyTotal} transaksi`;

  buildHistoryPagination();
}

function buildHistoryPagination() {
  const totalPages = Math.ceil(historyTotal / HISTORY_LIMIT);
  const el = document.getElementById("history-pagination");

  let html = "";

  const maxVisible = 5;
  let start = Math.max(1, historyPage - 2);
  let end = Math.min(totalPages, start + maxVisible - 1);

  // adjust kalau mentok kanan
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }

  // ⬅️ PREV
  html += `
    <button onclick="goHistoryPage(${historyPage - 1})"
      ${historyPage === 1 ? "disabled" : ""}
      class="pgbtn">
      ‹
    </button>
  `;

  // ⏺️ PAGE NUMBERS
  for (let i = start; i <= end; i++) {
    html += `
      <button onclick="goHistoryPage(${i})"
        class="pgbtn ${i === historyPage ? "active" : ""}">
        ${i}
      </button>
    `;
  }

  // ➡️ NEXT
  html += `
    <button onclick="goHistoryPage(${historyPage + 1})"
      ${historyPage === totalPages ? "disabled" : ""}
      class="pgbtn">
      ›
    </button>
  `;

  el.innerHTML = html;
}

function goHistoryPage(p) {
  historyPage = p;
  loadHistory();
}

// ─────────────────────────────────────────────────────
//  LOAD BANKS FROM SUPABASE (if you want dynamic loading instead of static BANK_DISPLAY)
// ─────────────────────────────────────────────────────

async function loadBanks() {
  const el = document.getElementById("bank-grid");
  if (!el) return;

  console.log("📥 FETCHING BANKS FROM SUPABASE...");
  const { data, error } = await sb.from("banks").select("*").order("name");

  if (error) {
    console.error("❌ FAILED TO FETCH BANKS:", error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log("ℹ️ NO BANKS FOUND IN DB.");
    el.innerHTML = `<div style="text-align:center; padding: 20px; color:#999; grid-column: 1 / -1;">No bank data found.</div>`;
    return;
  }

  // 👇 FILTER: Sembunyikan 'SYSTEM_BOT' dari tampilan kartu
  const displayBanks = data.filter(b => b.account_number !== 'SYSTEM_BOT');
  console.log("📦 DISPLAYING BANKS:", displayBanks.length);

  el.innerHTML = displayBanks
    .map(
      (b) => {
        const logo = BANK_LOGO[b.name] || "";
        const logoHtml = logo ? `<img src="${logo}" class="bank-logo" />` : `<div class="bank-logo" style="background:#eee;border-radius:50%"></div>`;
        return `
    <div class="bank-card" onclick="selectBank('${b.name}')">
      ${logoHtml}
      <div class="bank-info">
        <span class="bank-name">${b.name}</span>
        <span class="bank-number">${b.account_number || "—"}</span>
      </div>
    </div>
  `;
      }
    )
    .join("");
}



sb.channel("banks-live")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "banks",
    },
    () => {
      console.log("BANK UPDATED");
      loadBanks();
    },
  )
  .subscribe();



// ─────────────────────────────────────────────────────
//  BANK LOGO URLS (if you want to display logos based on bank name)
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().slice(0, 10);
  const from = document.getElementById("f-date-from");
  const to = document.getElementById("f-date-to");
  if (from) from.value = today;
  if (to) to.value = today;
  // initLastTime();
});

async function loadAdminStats() {
  const { data, error } = await sb
    .from("transaction_logs")
    .select("actor, action");

  if (error) return;

  const stats = {};

  data.forEach((log) => {
    if (!stats[log.actor]) {
      stats[log.actor] = { confirm: 0, reject: 0 };
    }

    if (log.action === "Confirmed") stats[log.actor].confirm++;
    if (log.action === "Rejected") stats[log.actor].reject++;
  });

  console.log("ADMIN STATS:", stats);
}

function openDetailFromHistory(tx) {
  document.getElementById("detail-body").innerHTML = `
    <table class="detail-table">
      <tr><th>Transaction ID</th><td>${tx.transaction_id || "—"}</td></tr>
      <tr><th>Order ID</th><td>${tx.order_id || "—"}</td></tr>
      <tr><th>Account Number</th><td>${tx.account_number || "—"}</td></tr>
      <tr><th>Account Name</th><td><strong>${tx.account_name || "—"}</strong></td></tr>
      <tr><th>Amount</th><td><strong>${fmtAmount(tx.amount)}</strong></td></tr>
      <tr><th>Bank</th><td>${tx.bank_name || "—"}</td></tr>
      <tr><th>Status</th><td>${statusBadge(tx.status)}</td></tr>
      <tr><th>Created</th><td>${fmtTime(tx.created_at)}</td></tr>
      <tr><th>Process Time</th><td>${fmtTime(tx.process_time)}</td></tr>
      <tr><th>Completed</th><td>${fmtTime(tx.completed_time)}</td></tr>
    </table>
  `;

  openModal("modal-detail");
}

// ai generate data klien

function generateSmartTransaction() {
  const firstNames = [
    "Nguyen",
    "Tran",
    "Le",
    "Pham",
    "Hoang",
    "Phan",
    "Vu",
    "Dang",
  ];
  const middleNames = ["Van", "Thi", "Duc", "Minh", "Huu", "Ngoc"];
  const lastNames = [
    "Anh",
    "Binh",
    "Chau",
    "Dung",
    "Giang",
    "Hanh",
    "Khanh",
    "Linh",
    "Nam",
    "Phong",
  ];

  const banks = [
    "Vietcombank",
    "Techcombank",
    "MB Bank",
    "ACB",
    "BIDV",
    "VPBank",
    "VietinBank",
    "OCB",
    "MSB",
    "LPBank",
    "Sacombank",
    "SHB",
    "TPBank",
    "Eximbank",
  ];

  let name =
    firstNames[Math.floor(Math.random() * firstNames.length)] +
    " " +
    middleNames[Math.floor(Math.random() * middleNames.length)] +
    " " +
    lastNames[Math.floor(Math.random() * lastNames.length)];

  const bank = banks[Math.floor(Math.random() * banks.length)];

  let accNum = "0" + Math.floor(100000000 + Math.random() * 900000000);
  
  // Normal amount: multiples of 50,000 (e.g. 50k, 100k, 250k)
  let amount = (Math.floor(Math.random() * 50) + 1) * 50000; 

  // 🔥 SIFAT MANUSIA (4% peluang adanya Human Error - sangat jarang)
  if (Math.random() < 0.04) {
    const errType = Math.random();
    if (errType < 0.33) {
      // Error 1: Rekening kurang/kelebihan digit (misal cuma 5 angka)
      accNum = "0" + Math.floor(1000 + Math.random() * 9000);
    } else if (errType < 0.66) {
      // Error 2: Typo nama (huruf kecil semua, atau salah eja/typo dempet)
      name = name.toLowerCase().replace(" ", "");
    } else {
      // Error 3: Nominal typo (misal transfer 50.003, atau kurang nol jadi 5.000)
      if (Math.random() < 0.5) {
        amount += Math.floor(Math.random() * 99) + 1; // jadi 50034
      } else {
        amount = Math.floor(amount / 10); // kurang 0, misal 500k jadi 50k
      }
    }
  }

  // Sinkronisasi dengan jam asli dunia nyata agar tidak tertinggal (Drift)
  const nowReal = Date.now();
  if (lastTime < nowReal) lastTime = nowReal;

  const cfg = getTrafficConfig();

  const insertDelay =
    cfg.insertDelay[0] +
    Math.random() * (cfg.insertDelay[1] - cfg.insertDelay[0]);

  lastTime += insertDelay;

  const created = new Date(lastTime);

  // process delay mengikuti jam
  const processDelay =
    cfg.processDelay[0] +
    Math.random() * (cfg.processDelay[1] - cfg.processDelay[0]);

  // ⏱️ lanjut dari lastTime (bukan created lagi)
  lastTime += processDelay;

  const process = new Date(lastTime);

  const tx = {
    transaction_id: "TX" + Date.now(),
    order_id: "ORD" + Math.floor(Math.random() * 1000000),
    account_number: accNum,
    account_name: name,
    bank_name: bank,
    amount: amount,
    status: "Pending",

    created_at: created.toISOString(),
    process_time: process.toISOString(),
  };

  return tx;
}

async function autoInsertTransaction() {
  const tx = generateSmartTransaction();

  console.log("INSERT DATA:", tx);

  const { error } = await sb.from("transactions").insert(tx);

  if (error) {
    console.error("❌ INSERT ERROR:", error);
  } else {
    console.log("✅ DATA MASUK");
    // Refresh UI if on relevant page
    if (currentPage === 1 && !isSearching) {
      loadTransactions();
    }
    loadDashboardStats(); // update the counter
  }
}

// ─────────────────────────────────────────────────────
//  REPORT SYSTEM  — Corporate Edition
// ─────────────────────────────────────────────────────
let _reportExcelData = { title: "", headers: [], rows: [] }; // used by exportReportExcel()

function openReportModal(icon, title, html) {
  document.getElementById("report-modal-icon").textContent = icon;
  document.getElementById("report-modal-title").textContent = title;
  document.getElementById("report-modal-body").innerHTML = html;
  openModal("modal-report");
}

/** Corporate-grade HTML table renderer */
function reportTable(headers, rawRows, { storeForExport = true } = {}) {
  if (!rawRows.length) return `<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No data available.</div>`;

  // strip HTML tags for Excel
  const stripHtml = (s) => String(s).replace(/<[^>]*>/g, "").trim();

  if (storeForExport) {
    _reportExcelData.headers = headers;
    _reportExcelData.rows    = rawRows.map(r => r.map(stripHtml));
  }

  const thStyle = `
    padding: 13px 18px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #fff;
    background: #1e3a5f;
    white-space: nowrap;
  `;

  const ths = headers.map(h => `<th style="${thStyle}">${h}</th>`).join("");

  const trs = rawRows.map((r, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f4f7fb";
    const tdStyle = `
      padding: 12px 18px;
      border-bottom: 1px solid #e8edf4;
      font-size: 12.5px;
      color: #1e293b;
      background: ${bg};
      vertical-align: middle;
    `;
    return `<tr style="transition:background .15s" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='${bg}'">`
      + r.map(c => `<td style="${tdStyle}">${c}</td>`).join("")
      + `</tr>`;
  }).join("");

  return `
    <div style="border-radius:10px;overflow:hidden;border:1.5px solid #d1dbe8;box-shadow:0 2px 12px rgba(30,58,95,.07)">
      <table style="width:100%;border-collapse:collapse;font-family:'Inter',sans-serif">
        <thead><tr>${ths}</tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
}

/** Stat card strip above table */
function reportStatStrip(stats) {
  const colors = ["#1d4ed8","#059669","#d97706","#dc2626","#7c3aed","#0891b2"];
  return `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">` +
    stats.map(([label, value], i) => `
      <div style="flex:1;min-width:110px;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;box-shadow:0 1px 4px rgba(0,0,0,.04)">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${label}</div>
        <div style="font-size:18px;font-weight:800;color:${colors[i % colors.length]}">${value}</div>
      </div>`).join("") + `</div>`;
}

/** Date-stamped report header */
function reportHeader(title, subtitle) {
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e2e8f0">
      <div>
        <div style="font-size:15px;font-weight:800;color:#1e293b">${title}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px">${subtitle}</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#94a3b8">
        <div>PayAdmin Financial System</div>
        <div style="font-weight:600;color:#64748b">Generated: ${now} WIB</div>
      </div>
    </div>`;
}

/** Export current report data to .xlsx */
function exportReportExcel() {
  const { title, headers, rows } = _reportExcelData;
  if (!headers.length) { showNotice("No data to export", "error"); return; }

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // column width auto
  ws["!cols"] = headers.map((_, i) => ({
    wch: Math.max(headers[i].length, ...rows.map(r => String(r[i] || "").length)) + 4
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));

  const filename = `PayAdmin_${title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  showNotice("Excel file downloaded!", "success");
}

// ─── 1. Transaction Summary ───────────────────────────
async function reportTransactionSummary() {
  _reportExcelData.title = "Transaction Summary";
  openReportModal("📈", "Transaction Summary", `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`);

  const { data } = await sb.from("transactions").select("status, created_at");
  if (!data) return;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo  = new Date(now - 7 * 86400000).toISOString();
  const monthAgo = new Date(now - 30 * 86400000).toISOString();

  const cnt = (list, status) => status ? list.filter(t => t.status === status).length : list.length;

  const todayData = data.filter(t => t.created_at.slice(0,10) === todayStr);
  const weekData  = data.filter(t => t.created_at >= weekAgo);
  const monthData = data.filter(t => t.created_at >= monthAgo);

  const badge = (n, color) => `<span style="display:inline-block;min-width:36px;text-align:center;padding:3px 10px;border-radius:20px;background:${color}18;color:${color};font-weight:700;font-size:12px">${n}</span>`;

  const periods = [
    ["Today",      todayData],
    ["This Week",  weekData],
    ["This Month", monthData],
    ["All Time",   data],
  ];

  const htmlRows = periods.map(([label, list]) => [
    `<b style="color:#1e3a5f">${label}</b>`,
    badge(cnt(list), "#1d4ed8"),
    badge(cnt(list,"Completed"), "#059669"),
    badge(cnt(list,"Processing"), "#0891b2"),
    badge(cnt(list,"Pending"), "#d97706"),
    badge(cnt(list,"Failed"), "#dc2626"),
  ]);

  const excelRows = periods.map(([label, list]) => [label, cnt(list), cnt(list,"Completed"), cnt(list,"Processing"), cnt(list,"Pending"), cnt(list,"Failed")]);
  _reportExcelData = { title: "Transaction Summary", headers: ["Period","Total","Completed","Processing","Pending","Failed"], rows: excelRows };

  const strip = reportStatStrip([
    ["Total All Time", data.length],
    ["Completed", cnt(data,"Completed")],
    ["Pending", cnt(data,"Pending")],
    ["Failed", cnt(data,"Failed")],
  ]);
  const table = reportTable(["Period","Total","Completed","Processing","Pending","Failed"], htmlRows, { storeForExport: false });

  openReportModal("📈", "Transaction Summary",
    reportHeader("Transaction Summary Report", "Overview of all transactions across time periods") + strip + table);
}

// ─── 2. Revenue Report ────────────────────────────────
async function reportRevenue() {
  _reportExcelData.title = "Revenue Report";
  openReportModal("💰", "Revenue Report", `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`);

  const { data } = await sb.from("transactions").select("bank_name, amount, status");
  if (!data) return;

  const byBank = {};
  data.forEach(t => {
    const k = t.bank_name || "Unknown";
    if (!byBank[k]) byBank[k] = { count: 0, total: 0, completed: 0, failed: 0 };
    byBank[k].count++;
    byBank[k].total += Number(t.amount) || 0;
    if (t.status === "Completed") byBank[k].completed += Number(t.amount) || 0;
    if (t.status === "Failed")    byBank[k].failed++;
  });

  const sorted = Object.entries(byBank).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = sorted.reduce((s, [,v]) => s + v.total, 0);

  const fmt = n => Number(n).toLocaleString("vi-VN");

  const htmlRows = sorted.map(([bank, v], i) => [
    `<span style="font-weight:700;color:#1e3a5f">#${i+1} ${bank}</span>`,
    v.count,
    `<span style="font-weight:700">${fmt(v.total)} VND</span>`,
    `<span style="color:#059669;font-weight:600">${fmt(v.completed)} VND</span>`,
    `<span style="color:#dc2626">${v.failed}</span>`,
    `<span style="color:#0891b2">${v.total ? ((v.completed/v.total)*100).toFixed(1) : 0}%</span>`,
  ]);

  htmlRows.push([
    `<b style="color:#1e3a5f">GRAND TOTAL</b>`,
    `<b>${data.length}</b>`,
    `<b style="color:#1d4ed8">${fmt(grandTotal)} VND</b>`,
    "", "", ""
  ]);

  const excelRows = sorted.map(([bank, v]) => [bank, v.count, v.total, v.completed, v.failed]);
  _reportExcelData = { title: "Revenue Report", headers: ["Bank","Transactions","Total (VND)","Completed (VND)","Failed Count"], rows: excelRows };

  const strip = reportStatStrip([
    ["Grand Total", fmt(grandTotal) + " VND"],
    ["Banks Active", sorted.length],
    ["Transactions", data.length],
  ]);
  const table = reportTable(["Bank","Count","Total Volume","Completed Volume","Failed","Completion %"], htmlRows, { storeForExport: false });

  openReportModal("💰", "Revenue Report",
    reportHeader("Revenue Report", "Total processed volume breakdown by bank") + strip + table);
}

// ─── 3. Bank Performance ─────────────────────────────
async function reportBankPerformance() {
  _reportExcelData.title = "Bank Performance";
  openReportModal("🏦", "Bank Performance", `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`);

  const { data } = await sb.from("transactions").select("bank_name, status");
  if (!data) return;

  const byBank = {};
  data.forEach(t => {
    const k = t.bank_name || "Unknown";
    if (!byBank[k]) byBank[k] = { total: 0, completed: 0, failed: 0, pending: 0 };
    byBank[k].total++;
    if (t.status === "Completed") byBank[k].completed++;
    else if (t.status === "Failed") byBank[k].failed++;
    else byBank[k].pending++;
  });

  const sorted = Object.entries(byBank).sort((a, b) => b[1].total - a[1].total);

  const htmlRows = sorted.map(([bank, v]) => {
    const rate = v.total ? ((v.completed / v.total) * 100) : 0;
    const [color, grade] = rate >= 70 ? ["#059669","Good"] : rate >= 40 ? ["#d97706","Average"] : ["#dc2626","Poor"];
    const bar = `<div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;max-width:100px;background:#f1f5f9;border-radius:4px;height:8px">
        <div style="width:${Math.round(rate)}%;background:${color};height:100%;border-radius:4px"></div>
      </div>
      <span style="font-weight:700;color:${color};font-size:12px">${rate.toFixed(1)}%</span>
      <span style="font-size:10px;color:${color};background:${color}15;padding:1px 8px;border-radius:10px;font-weight:600">${grade}</span>
    </div>`;
    return [bank, v.total, `<span style="color:#059669;font-weight:600">${v.completed}</span>`,
      `<span style="color:#dc2626;font-weight:600">${v.failed}</span>`,
      `<span style="color:#d97706">${v.pending}</span>`, bar];
  });

  const excelRows = sorted.map(([bank, v]) => {
    const rate = v.total ? ((v.completed / v.total) * 100).toFixed(1) : "0.0";
    return [bank, v.total, v.completed, v.failed, v.pending, rate + "%"];
  });
  _reportExcelData = { title: "Bank Performance", headers: ["Bank","Total","Completed","Failed","Pending","Success Rate"], rows: excelRows };

  const best = sorted.reduce((b, a) => {
    const ra = a[1].total ? a[1].completed / a[1].total : 0;
    const rb = b[1].total ? b[1].completed / b[1].total : 0;
    return ra > rb ? a : b;
  }, sorted[0]);
  const strip = reportStatStrip([
    ["Banks", sorted.length],
    ["Total Processed", data.length],
    ["Best Bank", best ? best[0] : "—"],
    ["Best Rate", best ? ((best[1].completed/best[1].total)*100).toFixed(1)+"%" : "—"],
  ]);
  const table = reportTable(["Bank","Total","Completed","Failed","Pending","Success Rate"], htmlRows, { storeForExport: false });

  openReportModal("🏦", "Bank Performance",
    reportHeader("Bank Performance Report", "Success rate and status breakdown per bank") + strip + table);
}

// ─── 4. Failed Transactions ──────────────────────────
async function reportFailedTransactions() {
  _reportExcelData.title = "Failed Transactions";
  openReportModal("❌", "Failed Transactions", `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`);

  const { data } = await sb.from("transactions")
    .select("transaction_id, account_name, account_number, bank_name, amount, completed_time, assigned_to")
    .eq("status", "Failed")
    .order("completed_time", { ascending: false })
    .limit(100);
  if (!data) return;

  const fmt = n => Number(n).toLocaleString("vi-VN");

  const htmlRows = data.map((t, i) => [
    `<span style="color:#94a3b8;font-size:10px">${i+1}</span>`,
    `<span style="font-family:monospace;font-size:10px;color:#475569">${t.transaction_id?.slice(0,18)}…</span>`,
    `<b style="color:#1e293b">${t.account_name || "—"}</b>`,
    `<span style="font-family:monospace;font-size:10px">${t.account_number || "—"}</span>`,
    t.bank_name || "—",
    `<span style="font-weight:700;color:#dc2626">${fmt(t.amount)} VND</span>`,
    t.assigned_to ? `<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${t.assigned_to}</span>` : "—",
    t.completed_time ? new Date(t.completed_time).toLocaleString("id-ID") : "—",
  ]);

  const excelRows = data.map(t => [
    t.transaction_id, t.account_name, t.account_number, t.bank_name, t.amount,
    t.assigned_to, t.completed_time ? new Date(t.completed_time).toLocaleString("id-ID") : "",
  ]);
  _reportExcelData = { title: "Failed Transactions",
    headers: ["TX ID","Account Name","Account No","Bank","Amount (VND)","Admin","Rejected At"],
    rows: excelRows };

  const totalFailed = data.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const strip = reportStatStrip([
    ["Failed Records", data.length],
    ["Total Rejected (VND)", fmt(totalFailed)],
  ]);
  const table = reportTable(["#","Transaction ID","Account","Acc. No","Bank","Amount","Admin","Rejected At"], htmlRows, { storeForExport: false });

  openReportModal("❌", `Failed Transactions — ${data.length} Records`,
    reportHeader("Failed Transaction Report", "All rejected and failed transactions") + strip + table);
}

// ─── 5. Account Report ───────────────────────────────
async function reportTopAccounts() {
  _reportExcelData.title = "Account Report";
  openReportModal("👤", "Account Report", `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`);

  const { data } = await sb.from("transactions").select("account_name, account_number, bank_name, amount, status");
  if (!data) return;

  const byAcc = {};
  data.forEach(t => {
    const key = t.account_number || t.account_name;
    if (!byAcc[key]) byAcc[key] = { name: t.account_name, bank: t.bank_name, total: 0, amount: 0, completed: 0, failed: 0 };
    byAcc[key].total++;
    byAcc[key].amount += Number(t.amount) || 0;
    if (t.status === "Completed") byAcc[key].completed++;
    if (t.status === "Failed")    byAcc[key].failed++;
  });

  const sorted = Object.entries(byAcc).sort((a, b) => b[1].amount - a[1].amount).slice(0, 25);
  const fmt = n => Number(n).toLocaleString("vi-VN");
  const medals = ["🥇","🥈","🥉"];

  const htmlRows = sorted.map(([num, v], i) => [
    `<b style="color:#1e3a5f">${medals[i] || `#${i+1}`}</b>`,
    `<b style="color:#1e293b">${v.name}</b>`,
    `<span style="font-family:monospace;font-size:10px;color:#64748b">${num}</span>`,
    v.bank,
    v.total,
    `<b style="color:#1d4ed8">${fmt(v.amount)} VND</b>`,
    `<span style="color:#059669;font-weight:600">${v.completed}</span>`,
    `<span style="color:#dc2626">${v.failed}</span>`,
  ]);

  const excelRows = sorted.map(([num, v], i) => [`#${i+1}`, v.name, num, v.bank, v.total, v.amount, v.completed, v.failed]);
  _reportExcelData = { title: "Account Report",
    headers: ["Rank","Name","Account No","Bank","Transactions","Total (VND)","Completed","Failed"],
    rows: excelRows };

  const totalAmount = sorted.reduce((s, [,v]) => s + v.amount, 0);
  const strip = reportStatStrip([
    ["Unique Accounts", Object.keys(byAcc).length],
    ["Top 25 Volume (VND)", fmt(totalAmount)],
    ["Top Account", sorted[0]?.[1].name || "—"],
  ]);
  const table = reportTable(["Rank","Name","Account No","Bank","Total Tx","Volume","Completed","Failed"], htmlRows, { storeForExport: false });

  openReportModal("👤", "Top 25 Accounts by Volume",
    reportHeader("Account Report", "Top 25 accounts ranked by total transaction volume") + strip + table);
}

// ─── 6. Time Analysis ────────────────────────────────
async function reportTimeAnalysis() {
  _reportExcelData.title = "Time Analysis";
  openReportModal("📅", "Time Analysis", `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`);

  const { data } = await sb.from("transactions").select("created_at, status").not("created_at","is",null);
  if (!data) return;

  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, completed: 0, failed: 0 }));
  data.forEach(t => {
    const d = new Date(t.created_at);
    d.setHours(d.getHours() + 7);
    byHour[d.getHours()].count++;
    if (t.status === "Completed") byHour[d.getHours()].completed++;
    if (t.status === "Failed")    byHour[d.getHours()].failed++;
  });

  const max = Math.max(...byHour.map(b => b.count)) || 1;
  const peak = byHour.reduce((a, b) => b.count > a.count ? b : a, byHour[0]);

  const htmlRows = byHour.map(b => {
    const pct = Math.round((b.count / max) * 100);
    const label = b.hour.toString().padStart(2, "0") + ":00";
    const busy = b.hour >= 8 && b.hour <= 17;
    const barColor = b.count === peak.count ? "#7c3aed" : busy ? "#1d4ed8" : "#94a3b8";
    const bar = `<div style="display:flex;align-items:center;gap:8px">
      <div style="width:140px;background:#f1f5f9;border-radius:4px;height:10px;flex-shrink:0">
        <div style="width:${pct}%;background:${barColor};height:100%;border-radius:4px"></div>
      </div>
      <span style="font-size:11px;font-weight:700;color:${barColor}">${b.count}</span>
    </div>`;
    return [
      `<b style="color:${busy?"#1d4ed8":"#64748b"}">${label}</b>`,
      busy ? `<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">Business</span>`
           : `<span style="color:#94a3b8;font-size:10px">Off-hours</span>`,
      bar,
      `<span style="color:#059669">${b.completed}</span>`,
      `<span style="color:#dc2626">${b.failed}</span>`,
    ];
  });

  const excelRows = byHour.map(b => [
    b.hour.toString().padStart(2,"0")+":00",
    b.hour >= 8 && b.hour <= 17 ? "Business" : "Off-hours",
    b.count, b.completed, b.failed
  ]);
  _reportExcelData = { title: "Time Analysis",
    headers: ["Hour (WIB)","Session","Transactions","Completed","Failed"],
    rows: excelRows };

  const strip = reportStatStrip([
    ["Peak Hour", peak.hour.toString().padStart(2,"0")+":00"],
    ["Peak Count", peak.count],
    ["Total Transactions", data.length],
    ["Business Hours Total", byHour.filter(b => b.hour >= 8 && b.hour <= 17).reduce((s,b) => s+b.count, 0)],
  ]);
  const table = reportTable(["Hour (WIB)","Session","Volume","Completed","Failed"], htmlRows, { storeForExport: false });

  openReportModal("📅", "Transaction Time Distribution",
    reportHeader("Time Analysis Report", "Hourly transaction distribution (WIB, UTC+7)") + strip + table);
}

// run bot

async function runBot() {
  while (true) {
    // ⏱️ delay random 5–15 detik
    const delay = 5000 + Math.random() * 10000;
    await new Promise((r) => setTimeout(r, delay));

    await processBot();
  }
}

async function processBot() {
  // 1. generate transaksi
  const tx = generateSmartTransaction();

  const { data, error } = await sb
    .from("transactions")
    .insert(tx)
    .select()
    .single();

  if (error) return;

  console.log("BOT: create", data.transaction_id);

  // ⏱️ delay sebelum assign
  await new Promise((r) => setTimeout(r, 3000 + Math.random() * 7000));

  // 2. assign worker
  const worker = WORKERS[Math.floor(Math.random() * WORKERS.length)];

  lastTime += 5000 + Math.random() * 10000;

  await sb
    .from("transactions")
    .update({
      assigned_to: worker,
      status: "Processing",
      process_time: new Date(lastTime).toISOString(),
    })
    .eq("id", data.id);

  console.log("BOT: assigned to", worker);

  // ⏱️ delay sebelum complete
  await new Promise((r) => setTimeout(r, 3000 + Math.random() * 7000));

  lastTime += 10000 + Math.random() * 20000;

  // 3. complete transaksi
  // COMPLETE
  await sb
    .from("transactions")
    .update({
      status: "Completed",
      completed_time: new Date(lastTime).toISOString(),
    })
    .eq("id", data.id);

  console.log("BOT: completed", data.transaction_id);

  // runBot();
}

  // refresh history
  function refreshHistory() {
    loadHistory();
    showNotice("History refreshed", "success");
  }

  // live transaction history

  async function loadLiveMini() {
    const { data, error } = await sb
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) return;

    const tbody = document.getElementById("live-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    data.forEach((tx) => {
      tbody.innerHTML += `
      <tr style="font-size:11px">
        <td>${tx.account_name}</td>
        <td>${tx.bank_name}</td>
        <td>${fmtAmount(tx.amount)}</td>
        <td>${tx.status}</td>
      </tr>
    `;
    });
  }
  //------------------------------------------------------------------------------

  function subscribeHistoryRealtime() {
    sb.channel("history-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
        },
        () => {
          loadHistory();
        },
      )
      .subscribe();
  }

  async function loadDashboardStats() {
    const { data, error } = await sb.from("transactions").select("status");

    if (error) {
      console.error(error);
      return;
    }

    let total = data.length;
    let pending = 0;
    let completed = 0;
    let failed = 0;

    data.forEach((tx) => {
      const s = (tx.status || "").toLowerCase().trim();

      if (s === "pending" || s === "processing") pending++;
      if (s === "completed") completed++;
      if (s === "failed") failed++;
    });

    // update UI (Safe ID-based approach)
    document.getElementById("stat-total-tx").textContent = total;
    document.getElementById("stat-pending-tx").textContent = pending;
    document.getElementById("stat-completed-tx").textContent = completed;
    document.getElementById("stat-failed-tx").textContent = failed;
  }

  // auto live update

  function subscribeAppRealtime() {
    sb.channel("app-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
        },
        () => {
          // Selalu update stats dashboard di background tanpa delay
          loadDashboardStats();

          // Hanya render ulang data jika user sedang melihat tabel bersangkutan
          const activeSect = document.querySelector(".page-section.active");
          if (activeSect?.id === "page-transactions") {
            loadTransactions();
          } else if (activeSect?.id === "page-history") {
            loadHistory();
          }
        },
      )
      .subscribe();
  }

  // refresh dashboard


  function refreshTableOnly() {
    console.log("REFRESH DIKLIK");
    loadTransactions();
  }

  // inisialisasi lastTime untuk bot

// ─────────────────────────────────────────────────────
//  BOT ENGINE CONTROLLER (GLOBAL SYNC)
// ─────────────────────────────────────────────────────
async function toggleBotEngine() {
  const btn = document.getElementById('bot-toggle-btn');
  
  if (!isBotRunning) {
    // STARTING
    const { data: existing } = await sb.from('banks').select('account_number').eq('account_number', 'SYSTEM_BOT').single();
    
    let error;
    if (existing) {
      const res = await sb.from('banks').update({ name: 'RUNNING: ' + currentUser }).eq('account_number', 'SYSTEM_BOT');
      error = res.error;
    } else {
      const res = await sb.from('banks').insert({ account_number: 'SYSTEM_BOT', name: 'RUNNING: ' + currentUser });
      error = res.error;
    }

    if (error) { showError("Failed to start bot: " + error.message); return; }
    
    isBotRunning = true;
    botHost = currentUser;
    showNotice("AI Engine Started!", "success");
    startBotAutomationLoop(); // Start the loop immediately
  } else {
    // STOPPING
    if (botHost !== currentUser && currentUser !== 'admin') {
      showError("Only " + botHost + " can stop this engine!");
      return;
    }

    await sb.from('banks').update({ name: 'OFFLINE' }).eq('account_number', 'SYSTEM_BOT');
    isBotRunning = false;
    botHost = null;
    showNotice("AI Engine Stopped", "error");
  }
  syncBotUI();
}

function syncBotUI() {
  const statusText = document.getElementById('bot-status-text');
  const indicator = document.getElementById('bot-indicator');
  const btn = document.getElementById('bot-toggle-btn');

  if (isBotRunning) {
    statusText.innerText = `RUNNING (${botHost})`;
    statusText.style.color = '#059669';
    indicator.style.background = '#059669';
    indicator.style.boxShadow = '0 0 8px #059669';
    btn.innerText = (botHost === currentUser) ? 'STOP ENGINE' : 'ENGINE BUSY';
    btn.style.background = (botHost === currentUser) ? '#ef4444' : '#94a3b8';
    btn.disabled = (botHost !== currentUser && currentUser !== 'admin');
  } else {
    statusText.innerText = 'OFFLINE';
    statusText.style.color = '#64748b';
    indicator.style.background = '#94a3b8';
    indicator.style.boxShadow = 'none';
    btn.innerText = 'START ENGINE';
    btn.style.background = '#64748b';
    btn.disabled = false;
  }
}

// Background sync for the Bot UI every 5 seconds
setInterval(async () => {
  const { data } = await sb.from('banks').select('*').eq('account_number', 'SYSTEM_BOT').single();
  if (data) {
    const wasRunning = isBotRunning;
    isBotRunning = data.name.startsWith('RUNNING');
    botHost = isBotRunning ? data.name.split(': ')[1] : null;
    
    // If it was OFF but now ON, start local loop if I am the host
    if (!wasRunning && isBotRunning && botHost === currentUser) {
      startBotAutomationLoop();
    }
  } else {
    isBotRunning = false;
    botHost = null;
  }
  syncBotUI();
}, 5000);

let _botLoopStarted = false;
function startBotAutomationLoop() {
  if (_botLoopStarted) return;
  _botLoopStarted = true;

  async function loop() {
    if (!isBotRunning || botHost !== currentUser) {
      _botLoopStarted = false;
      return;
    }

    const cfg = getTrafficConfig();
    const delay = cfg.insertDelay[0] + Math.random() * (cfg.insertDelay[1] - cfg.insertDelay[0]);
    await new Promise(r => setTimeout(r, delay));

    if (isBotRunning && botHost === currentUser) {
      await autoInsertTransaction();
      setTimeout(loop, delay); // Run next tick
    } else {
      console.log("🤖 Loop stopped. Status:", isBotRunning, "Host:", botHost);
      _botLoopStarted = false;
    }
  }
  loop();
}

// ─────────────────────────────────────────────────────
//  PREMIUM ERROR MODAL
// ─────────────────────────────────────────────────────
function showError(msg) {
  const html = `
    <div style="text-align:center;padding:20px 0">
      <div style="width:80px;height:80px;background:#fef2f2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;border:4px solid #fee2e2">
        <span style="font-size:40px;color:#dc2626">✖</span>
      </div>
      <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin-bottom:10px">Ouch! Conflict Detected</h2>
      <div style="font-size:14px;color:#64748b;line-height:1.6;padding:0 20px">${msg}</div>
      <button onclick="closeModal('modal-report')" style="margin-top:25px;background:#dc2626;color:white;border:none;padding:10px 30px;border-radius:6px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(220,38,38,0.2)">Understood</button>
    </div>
  `;
  
  const iconEl = document.getElementById("report-modal-icon");
  const titleEl = document.getElementById("report-modal-title");
  const bodyEl = document.getElementById("report-modal-body");
  
  if (iconEl) iconEl.textContent = "⚠️";
  if (titleEl) titleEl.textContent = "System Alert";
  if (bodyEl) bodyEl.innerHTML = html;
  
  openModal("modal-report");
}

function initPresence() {
  if (presenceChannel) sb.removeChannel(presenceChannel);

  presenceChannel = sb.channel('presence-admins', {
    config: { presence: { key: currentUser } }
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      updatePresenceUI(state);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          user: currentUser,
          online_at: new Date().toISOString(),
        });
      }
    });
}

function updatePresenceUI(state) {
  const listEl = document.getElementById('admin-presence-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const onlineUsers = Object.keys(state);
  const uniqueUsers = [...new Set(onlineUsers)];

  uniqueUsers.forEach(user => {
    const displayName = user.split('@')[0];
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:11px; color:#166534; font-weight:600;';
    div.innerHTML = `
      <span style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></span>
      <span>${displayName}</span>
    `;
    listEl.appendChild(div);
  });

  if (uniqueUsers.length === 0) {
    listEl.innerHTML = '<div style="font-size:10px; color:#9ca3af;">No other admins online</div>';
  }
}

function toggleFilterPanel() {
  const panel = document.querySelector(".filter-panel");
  if (panel) {
    panel.classList.toggle("collapsed");
  }
}
