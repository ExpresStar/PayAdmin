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

// ─────────────────────────────────────────────────────
//  2FA — TOTP (Google Authenticator)
//  WAJIB SAMA PERSIS dengan setup-2fa.html dan chat.js.
//  Secret Base32, 32 karakter (20 byte) — standar RFC 6238.
// ─────────────────────────────────────────────────────
const MASTER_SECRET = "PAYADMINVIETNAM2SECRETKEYFORTOTP";

// Decode Base32 secret -> byte array (toleran terhadap spasi & padding)
function base32ToBytes(secretB32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0;
  const bytes = [];
  for (const ch of String(secretB32).toUpperCase().replace(/[\s=]+/g, "")) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return bytes;
}

// Hitung TOTP 6-digit untuk sebuah timestamp (detik). Pakai Web Crypto API.
async function computeTOTP(secretB32, timestepSeconds) {
  const keyBytes = base32ToBytes(secretB32);
  const T = Math.floor(timestepSeconds / 30);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(4, T >>> 0, false);

  const key = await crypto.subtle.importKey(
    "raw", new Uint8Array(keyBytes),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));

  const offset = sig[19] & 0xf;
  const otp = ((sig[offset] & 0x7f) << 24 |
               sig[offset + 1] << 16 |
               sig[offset + 2] << 8 |
               sig[offset + 3]) % 1000000;
  return String(otp).padStart(6, "0");
}

// Verifikasi kode 6-digit dari user.
// Toleransi plus/minus 2 window agar kode tetap valid saat mendekati pergantian 30 detik
// dan tetap tahan jika jam HP/browser selisih beberapa detik.
async function verifyTOTP(code) {
  const input = String(code || "").replace(/\D/g, "");
  if (input.length !== 6) return false;

  const now = Math.floor(Date.now() / 1000);
  const offsets = [-60, -30, 0, 30, 60];
  const tokens = await Promise.all(
    offsets.map((offset) => computeTOTP(MASTER_SECRET, now + offset)),
  );

  return tokens.includes(input);
}

// ─────────────────────────────────────────────────────
//  WORKER BOT ROSTER + SHIFT CONFIG
//  Bot bekerja shift berbeda, saling berebutan ambil TX tertua
// ─────────────────────────────────────────────────────
const WORKERS = ["yaer98", "xiaoting99", "anan88"];

const WORKER_SHIFTS = {
  xiaoting99: { start: 8,  end: 16 }, // Shift pagi  08:00 – 16:00 WIB
  yaer98:     { start: 12, end: 20 }, // Shift siang 12:00 – 20:00 WIB
  anan88:     { start: 20, end: 4  }, // Shift malam 20:00 – 04:00 WIB (midnight wrap)
};

function isWorkerOnShift(botName) {
  const shift = WORKER_SHIFTS[botName];
  if (!shift) return true; // unknown bot → always on
  const h = new Date().getHours(); // browser local (WIB)
  const { start, end } = shift;
  if (start < end) return h >= start && h < end;       // normal range (e.g. 8-16)
  return h >= start || h < end;                        // midnight-wrap (e.g. 20-04)
}

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
let adminEmailMap = {}; // Cache email → username mapping

// Load admin usernames dari Supabase untuk display di history
async function loadAdminCache() {
  try {
    const { data } = await sb.from("admins").select("auth_email, username");
    if (data) {
      adminEmailMap = {};
      data.forEach((a) => {
        adminEmailMap[String(a.auth_email).toLowerCase()] = String(
          a.username,
        ).toLowerCase();
      });
    }
  } catch (e) {
    console.warn("Admin cache load failed:", e);
  }
}

function getAdminUsername(email) {
  const normalized = String(email || "").toLowerCase().trim();
  return adminEmailMap[normalized] || normalized.split("@")[0] || "System";
}

// function jam

function getCurrentHour() {
  const now = new Date();
  return now.getHours(); // Browser Anda sudah WIB, tidak perlu +7 lagi
}

function getTrafficConfig() {
  const h = new Date().getHours(); // local time (assumed WIB on client)

  // Dinamis: jam ramai lebih cepat, jam sepi lebih lambat
  if (h >= 8 && h < 22) {
    // Peak hours: 08:00-21:59
    return {
      insertDelay: [1200, 2400], // 1.2s - 2.4s antar transaksi baru
      processDelay: [4000, 9000], // 4s - 9s untuk alur proses
    };
  } else if ((h >= 6 && h < 8) || (h >= 22 && h < 24)) {
    // Shoulder hours: 06:00-07:59 & 22:00-23:59
    return {
      insertDelay: [2500, 4200],
      processDelay: [7000, 14000],
    };
  } else {
    // Quiet hours: 00:00-05:59
    return {
      insertDelay: [4500, 8000],
      processDelay: [10000, 18000],
    };
  }
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
    Sacombank: "SCB",
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
    `<tr><td colspan="14" style="text-align:center;padding:30px;color:#9ca3af;font-size:12px">${msg || "未找到交易记录。"}</td></tr>`;
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
      hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  let pName = tx.account_name || "UNKNOWN";
  let pBank = tx.bank_name || "Vietcombank";
  let pPhone = tx.account_number || "—";
  let pAmount = tx.amount || 0;

  // Deterministic random based on transaction_id
  const h = Math.abs(hashString(tx.transaction_id || ""));
  const appBanks = [
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
  ];
  const appBank = tx.app_bank || tx.source_bank || tx.sender_bank || appBanks[h % appBanks.length];

  // 1/250 chance (~15 menit sekali dengan asumi 1 transaksi per 3-4 detik)
  if (h % 250 === 0 || h % 250 === 1) {
    const errType = h % 3; // Hanya 3 tipe error: Nama, Nominal, Bank

    if (errType === 0) {
      // 1. Nama Tidak Sesuai (Pake nama singkatan / salah nama lengkap)
      pName =
        pName.split(" ")[0] +
        " " +
        ["Smith", "Wong", "Putra", "Aditya", "Nguyen"][h % 5];
    } else if (errType === 1) {
      // 2. Nominal Transfer Kurang/Lebih di Struk (Misal: 50.000 jadi 500.000 atau nominal random)
      if (h % 2 === 0) {
        pAmount = pAmount + ((h % 5) + 1) * 25000;
      } else {
        pAmount = Math.floor(pAmount / 10);
      }
    } else {
      // 3. Bank Tujuan di Struk Salah
      const banks = [
        "Vietcombank",
        "Techcombank",
        "MB Bank",
        "ACB",
        "VPBank",
        "Sacombank",
      ];
      // Pilih bank yang TIDAK sama dengan bank asli
      pBank =
        banks[h % banks.length] !== pBank
          ? banks[h % banks.length]
          : banks[((h % banks.length) + 1) % banks.length];
    }
  }

  const qName = encodeURIComponent(pName);
  const qBank = encodeURIComponent(pBank);
  const qAppBank = encodeURIComponent(appBank);
  const qPhone = encodeURIComponent(pPhone);
  const qAmount = encodeURIComponent(pAmount);
  const qCreated = encodeURIComponent(tx.created_at || "");
  const qLogo = encodeURIComponent(BANK_LOGO[pBank] || "");

  return `proof.html?id=${encodeURIComponent(tx.transaction_id)}&name=${qName}&bank=${qBank}&appBank=${qAppBank}&phone=${qPhone}&amount=${qAmount}&created=${qCreated}&logo=${qLogo}`;
}

// ─────────────────────────────────────────────────────
//  BOT HELPERS — proof mismatch + reject screenshot
// ─────────────────────────────────────────────────────
function normalizeNameForCompare(s) {
  // Make "human" string compare more tolerant (spaces/diacritics/case)
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getProofFieldsFromTx(tx) {
  const proofUrl = getProofUrl(tx);
  const qs = proofUrl.split("?")[1] || "";
  const params = new URLSearchParams(qs);
  return {
    name: params.get("name") || "",
    bank: params.get("bank") || "",
    amount: Number(params.get("amount") || 0),
  };
}

function getTxMismatch(tx) {
  const proof = getProofFieldsFromTx(tx);

  const txAmount = Number(tx.amount || 0);
  const wrongNominal = Number(proof.amount || 0) !== txAmount;
  const wrongName =
    normalizeNameForCompare(proof.name) !==
    normalizeNameForCompare(tx.account_name || "");
  const wrongBank = String(proof.bank || "") !== String(tx.bank_name || "");

  const anyWrong = wrongNominal || wrongName || wrongBank;

  return {
    proof,
    wrongNominal,
    wrongName,
    wrongBank,
    anyWrong,
    note: [
      wrongNominal ? "Nominal" : null,
      wrongName ? "Name" : null,
      wrongBank ? "Bank" : null,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function renderRejectScreenshotCanvas(tx, mismatch, botName) {
  // Dimensi mirip screenshot tabel di website
  const W = 1100;
  const H = 160;
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // ── Outer background (warna bg aplikasi PayAdmin) ──────────────────────
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, W, H);

  // ── Table header row (abu-abu seperti thead di index.html) ─────────────
  const HDR_H = 32;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, HDR_H);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HDR_H); ctx.lineTo(W, HDR_H);
  ctx.stroke();

  // Header labels
  const HDR_FONT = "700 10px -apple-system, Roboto, Arial, sans-serif";
  ctx.font = HDR_FONT;
  ctx.fillStyle = "#6b7280";
  const COLS = [
    { label: "交易编号",   x:  18 },
    { label: "订单编号",   x: 195 },
    { label: "账户号码",   x: 340 },
    { label: "金额",       x: 480 },
    { label: "账户姓名",   x: 610 },
    { label: "银行",       x: 740 },
    { label: "状态",       x: 810 },
    { label: "创建时间",   x: 900 },
    { label: "处理时间",   x: 1010 },
  ];
  COLS.forEach(c => ctx.fillText(c.label, c.x, HDR_H - 10));

  // ── Data row (putih, dengan border bawah) ─────────────────────────────
  const ROW_Y  = HDR_H;
  const ROW_H  = H - HDR_H;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, ROW_Y, W, ROW_H);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 1); ctx.lineTo(W, H - 1);
  ctx.stroke();

  // Helper: garis di tengah row
  const midY = ROW_Y + ROW_H / 2;

  // Checkbox placeholder
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 4, midY - 6, 12, 12, 2);
  ctx.stroke();

  // ── Kolom TX ID ────────────────────────────────────────────────────────
  const txId   = String(tx.transaction_id || "");
  const txIdA  = txId.slice(0, 16);
  const txIdB  = txId.slice(16);
  ctx.font = "600 11px ui-monospace, Consolas, monospace";
  ctx.fillStyle = mismatch.wrongNominal ? "#dc2626" : "#3b82f6"; // biru kalau OK
  ctx.fillText(txIdA, COLS[0].x, midY - 5);
  ctx.font = "500 9px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(txIdB, COLS[0].x, midY + 8);

  // ── Kolom Order ID ─────────────────────────────────────────────────────
  const ordId  = String(tx.order_id || "");
  ctx.font = "400 10px -apple-system, Roboto, Arial, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(ordId.slice(0, 14), COLS[1].x, midY - 3);
  if (ordId.length > 14) {
    ctx.font = "400 9px -apple-system, Roboto, Arial, sans-serif";
    ctx.fillText(ordId.slice(14), COLS[1].x, midY + 9);
  }

  // ── Kolom Acc Number ───────────────────────────────────────────────────
  ctx.font = "400 11px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#374151";
  ctx.fillText(String(tx.account_number || ""), COLS[2].x, midY + 3);

  // ── Kolom Amount ───────────────────────────────────────────────────────
  ctx.font = "700 12px -apple-system, Roboto, Arial, sans-serif";
  ctx.fillStyle = mismatch.wrongNominal ? "#dc2626" : "#1d4ed8";
  const amtText = fmtAmount(tx.amount || 0);
  ctx.fillText(amtText, COLS[3].x, midY + 3);

  // ── Kolom Account Name ─────────────────────────────────────────────────
  ctx.font = "600 11px -apple-system, Roboto, Arial, sans-serif";
  ctx.fillStyle = mismatch.wrongName ? "#dc2626" : "#6366f1"; // indigo kalau OK
  ctx.fillText(String(tx.account_name || ""), COLS[4].x, midY + 3);

  // ── Kolom Bank (badge) ─────────────────────────────────────────────────
  const bankShortText = shortBank(tx.bank_name || "");
  const BADGE_BG  = mismatch.wrongBank ? "#fef2f2" : "#f0f9ff";
  const BADGE_BDR = mismatch.wrongBank ? "#fca5a5" : "#bae6fd";
  const BADGE_TXT = mismatch.wrongBank ? "#dc2626" : "#0369a1";
  const bw = ctx.measureText(bankShortText).width + 14;
  ctx.fillStyle = BADGE_BG;
  drawRoundedRect(ctx, COLS[5].x, midY - 9, bw, 17, 3);
  ctx.fill();
  ctx.strokeStyle = BADGE_BDR;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = BADGE_TXT;
  ctx.font = "700 10px -apple-system, Roboto, Arial, sans-serif";
  ctx.fillText(bankShortText, COLS[5].x + 7, midY + 3);

  // ── Kolom Status (badge "Pending") ─────────────────────────────────────
  const statusText = String(tx.status || "Pending");
  ctx.font = "700 10px -apple-system, Roboto, Arial, sans-serif";
  const sw = ctx.measureText(statusText).width + 16;
  ctx.fillStyle = "#fffbeb";
  drawRoundedRect(ctx, COLS[6].x, midY - 9, sw, 17, 8);
  ctx.fill();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#b45309";
  ctx.fillText(statusText, COLS[6].x + 8, midY + 3);

  // ── Kolom Created / Process Time ───────────────────────────────────────
  function fmtDateShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    d.setHours(d.getHours() + 7);
    const ymd = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
    const hms = d.toTimeString().slice(0,8);
    return { ymd, hms };
  }
  const cr = fmtDateShort(tx.created_at);
  ctx.font = "400 9px -apple-system, Roboto, Arial, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(cr.ymd, COLS[7].x, midY - 3);
  ctx.fillText(cr.hms, COLS[7].x, midY + 9);

  const pt = fmtDateShort(tx.process_time || tx.created_at);
  ctx.fillText(pt.ymd, COLS[8].x, midY - 3);
  ctx.fillText(pt.hms, COLS[8].x, midY + 9);

  // ── Wrong overlay highlight: garis merah tipis di kiri row ─────────────
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(0, ROW_Y, 3, ROW_H);

  return canvas;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error("canvas.toBlob failed"));
        else resolve(blob);
      }, "image/png");
    } catch (e) {
      // Fallback for older browsers
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const byteString = atob(dataUrl.split(",")[1]);
        const mimeString = dataUrl.split(",")[0].split(":")[1].split(";")[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++)
          ia[i] = byteString.charCodeAt(i);
        resolve(new Blob([ab], { type: mimeString }));
      } catch (err) {
        reject(err);
      }
    }
  });
}

async function uploadCanvasAsChatImage(canvas, fileName) {
  const blob = await canvasToPngBlob(canvas);
  const filePath = `chat_images/${fileName}`;

  const { error: uploadError } = await sb.storage
    .from("chat_images")
    .upload(filePath, blob);
  if (uploadError) throw uploadError;

  const { data } = sb.storage.from("chat_images").getPublicUrl(filePath);
  return data.publicUrl;
}

async function insertChatMessage({ room, username, type, message }) {
  // Primary: with room column (if exists)
  try {
    const { error } = await sb
      .from("messages")
      .insert([{ room, username, type, message }]);
    if (error) throw error;
    return;
  } catch (err) {
    // Fallback: without room
    const { error: err2 } = await sb
      .from("messages")
      .insert([{ username, type, message }]);
    if (err2) throw err2;
  }
}

async function botSendRejectSequence(
  botName,
  tx,
  mismatch,
  slowMultiplier = 1,
) {
  // 1) Screenshot tabel row — canvas yang mirip tampilan tabel asli
  const canvas = renderRejectScreenshotCanvas(tx, mismatch, botName);
  const fileName = `reject-bot-${tx.id}-${Date.now()}.png`;
  const imageUrl = await uploadCanvasAsChatImage(canvas, fileName);

  // Caption = TX ID (seperti yang terlihat di screenshot)
  await insertChatMessage({
    room: "reject",
    username: botName,
    type: "image",
    message: `${imageUrl}|--CAPTION--|${tx.transaction_id || tx.id}`,
  });

  await new Promise((r) =>
    setTimeout(r, (700 + Math.random() * 900) * slowMultiplier),
  );

  // 2) Copy-paste semua kolom dalam satu baris (persis seperti copy teks dari tabel)
  const txId   = String(tx.transaction_id || "");
  const txIdA  = txId.slice(0, 16);
  const txIdB  = txId.slice(16);
  const copyLine = [
    txIdA,
    txIdB,
    String(tx.order_id      || ""),
    String(tx.account_number || ""),
    fmtAmount(tx.amount || 0),
    String(tx.account_name  || ""),
    shortBank(tx.bank_name  || ""),
    String(tx.status        || "Pending"),
  ].filter(Boolean).join(" ");

  await insertChatMessage({
    room: "reject",
    username: botName,
    type: "user",
    message: copyLine,
  });

  await new Promise((r) =>
    setTimeout(r, (600 + Math.random() * 800) * slowMultiplier),
  );

  // 3) Kode error singkat (.bil / .name / .bank) — sama seperti format lama
  const errCode = mismatch.wrongNominal ? ".bil"
    : mismatch.wrongName  ? ".name"
    : mismatch.wrongBank  ? ".bank"
    : ".reject";

  await insertChatMessage({
    room: "reject",
    username: botName,
    type: "user",
    message: errCode,
  });
}

let _botWorkTickRunning = false;

const AUTO_APPROVE_BOT_NAME = "System";
const AUTO_APPROVE_MIN_AMOUNT = 50000;
const AUTO_APPROVE_MAX_AMOUNT = 999999;
const AUTO_APPROVE_AFTER_MINUTES = 15;

let _systemAutoApproveRunning = false;

async function systemAutoApproveTick() {
  if (_systemAutoApproveRunning) return;
  _systemAutoApproveRunning = true;

  try {
    const cutoffIso = new Date(
      Date.now() - AUTO_APPROVE_AFTER_MINUTES * 60 * 1000,
    ).toISOString();
    const nowIso = new Date().toISOString();

    const { data: pendingBatch, error } = await sb
      .from("transactions")
      .select("id,transaction_id,amount,created_at,status,assigned_to")
      .eq("status", "Pending")
      .is("assigned_to", null)
      .gte("amount", AUTO_APPROVE_MIN_AMOUNT)
      .lte("amount", AUTO_APPROVE_MAX_AMOUNT)
      .lte("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[systemAutoApproveTick]", error);
      return;
    }

    if (!pendingBatch || pendingBatch.length === 0) return;

    let approvedCount = 0;

    for (const tx of pendingBatch) {
      const { data: updated, error: updateError } = await sb
        .from("transactions")
        .update({
          assigned_to: AUTO_APPROVE_BOT_NAME,
          status: "Completed",
          process_time: nowIso,
          completed_time: nowIso,
        })
        .eq("id", tx.id)
        .eq("status", "Pending")
        .is("assigned_to", null)
        .select("id");

      if (updateError || !updated || updated.length === 0) continue;

      approvedCount++;

      await sb.from("transaction_logs").insert({
        transaction_id: tx.id,
        action: "Confirmed",
        note: `Auto approved by System after ${AUTO_APPROVE_AFTER_MINUTES} minutes`,
        actor: AUTO_APPROVE_BOT_NAME,
      });
    }

    if (approvedCount > 0) {
      console.log(`[System] Auto approved ${approvedCount} transaction(s).`);
      loadTransactions();
      loadDashboardStats();
    }
  } finally {
    _systemAutoApproveRunning = false;
  }
}

async function botProcessPendingTick() {
  if (!WORKERS.length) return; // bot disabled
  if (_botWorkTickRunning) return;
  _botWorkTickRunning = true;

  try {
    // pick the oldest pending item to process next
    const todayStr = getLocalDate();
    const startOfToday = new Date(todayStr + "T00:00:00").toISOString();

    const { data: pendingBatch } = await sb
      .from("transactions")
      .select(
        "id,status,transaction_id,account_number,account_name,bank_name,amount,created_at",
      )
      .eq("status", "Pending")
      .is("assigned_to", null)
      .gte("created_at", startOfToday) // Hanya transaksi hari ini agar sinkron dengan dashboard default
      // oldest first
      .order("created_at", { ascending: true })
      // process one at a time to avoid over-speed
      .limit(1);

    if (!pendingBatch || pendingBatch.length === 0) return;

    const nowIso = new Date().toISOString();

    for (const tx of pendingBatch) {
      const botName = WORKERS[Math.floor(Math.random() * WORKERS.length)];
      const mismatch = getTxMismatch(tx);
      const isReject = mismatch.anyWrong;

      const updateData = isReject
        ? { assigned_to: botName, status: "Failed", completed_time: nowIso }
        : {
            assigned_to: botName,
            status: "Completed",
            completed_time: nowIso,
            process_time: nowIso,
          };

      const { data: updated, error } = await sb
        .from("transactions")
        .update(updateData)
        .eq("id", tx.id)
        .eq("status", "Pending")
        .is("assigned_to", null)
        .select();

      if (error || !updated || updated.length === 0) continue;

      // slow down per transaction to feel human
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));

      await sb.from("transaction_logs").insert({
        transaction_id: tx.id,
        action: isReject ? "Rejected" : "Confirmed",
        note: isReject
          ? `Auto reject by bot: ${mismatch.note || "Mismatch"}`
          : "Auto confirm by bot",
        actor: botName,
      });

      if (isReject) {
        // Send evidence to chat reject room
        await botSendRejectSequence(
          botName,
          targetMismatchAnyPatch(tx),
          mismatch,
          1,
        );
      }
      // Worker room tetap bot-free — tidak ada pesan ke room "worker"
    }
  } finally {
    _botWorkTickRunning = false;
  }
}

function targetMismatchAnyPatch(tx) {
  // Ensure tx has fields needed by renderer (some queries might omit them)
  return tx;
}

// ─────────────────────────────────────────────────────
//  WORKER BOT SYSTEM — Competitive Claim, Shift-Aware
// ─────────────────────────────────────────────────────

let _workerBotsStarted = false;

function startWorkerBots() {
  if (_workerBotsStarted) return;
  _workerBotsStarted = true;
  console.log("[WorkerBot] Starting", WORKERS.length, "bots with shift schedules:",
    WORKERS.map(n => `${n}(${WORKER_SHIFTS[n]?.start}:00–${WORKER_SHIFTS[n]?.end}:00)`).join(", "));

  WORKERS.forEach((botName, idx) => {
    // Stagger start: tiap bot mulai di waktu berbeda agar tidak serentak
    const staggerMs = idx * (2000 + Math.random() * 4000);
    setTimeout(() => workerBotLoop(botName), staggerMs);
  });
}

async function workerBotOneTick(botName) {
  // Guard: hanya bekerja kalau shift sedang aktif
  if (!isWorkerOnShift(botName)) {
    const shift = WORKER_SHIFTS[botName];
    console.log(`[WorkerBot][${botName}] Off-shift (shift ${shift?.start}:00–${shift?.end}:00) — idle`);
    return;
  }

  try {
    // 1. Ambil transaksi Pending TERTUA yang belum diklaim siapapun (Hanya dari hari ini)
    const todayStr = getLocalDate();
    const startOfToday = new Date(todayStr + "T00:00:00").toISOString();

    const { data: pendingList, error } = await sb
      .from("transactions")
      .select("id,transaction_id,order_id,account_number,account_name,bank_name,amount,created_at,status")
      .eq("status", "Pending")
      .is("assigned_to", null)
      .gte("created_at", startOfToday) // Hanya transaksi hari ini agar sinkron dengan dashboard default
      .order("created_at", { ascending: true }) // tertua pertama
      .limit(5); // ambil 5 untuk mengurangi collision dan memberi ruang bagi bot/human lain

    if (error) { console.error(`[WorkerBot][${botName}] fetch error:`, error.message); return; }
    if (!pendingList || pendingList.length === 0) return; // tidak ada TX

    // Pilih random dari 3 teratas untuk variasi (agar tidak semua bot rebut TX yang sama persis)
    const tx = pendingList[Math.floor(Math.random() * pendingList.length)];
    
    // 2. Simulasi waktu reaksi manusia untuk membaca/melihat nota baru di layar
    // Bot menunggu 6–15 detik sebelum mencoba klik/klaim.
    // Selama waktu tunggu ini, pekerja manusia bisa mengklik/proses duluan.
    const reactionDelayMs = 6000 + Math.random() * 9000;
    await new Promise(r => setTimeout(r, reactionDelayMs));

    const nowIso = new Date().toISOString();

    // 3. Optimistic claim — yang menang adalah yang pertama UPDATE
    const { data: claimed, error: claimErr } = await sb
      .from("transactions")
      .update({ assigned_to: botName, process_time: nowIso })
      .eq("id", tx.id)
      .eq("status", "Pending")
      .is("assigned_to", null)
      .select("id");

    if (claimErr || !claimed || claimed.length === 0) {
      // Bot lain / manusia sudah ambil duluan — coba lagi di tick berikutnya
      console.log(`[WorkerBot][${botName}] TX ${tx.transaction_id} sudah diklaim bot/human lain`);
      return;
    }

    console.log(`[WorkerBot][${botName}] ✓ Claimed ${tx.transaction_id}`);

    // 4. Simulasi waktu mengecek detail struk bukti transfer (baca & cek)
    const checkDelayMs = 4000 + Math.random() * 5000;
    await new Promise(r => setTimeout(r, checkDelayMs));

    // 5. Cek mismatch proof vs data tabel
    const mismatch = getTxMismatch(tx);
    const isReject  = mismatch.anyWrong;

    if (isReject) {
      // ─ REJECT: data tidak cocok dengan bukti transfer
      console.log(`[WorkerBot][${botName}] ✗ Mismatch on ${tx.transaction_id}: ${mismatch.note}`);

      await sb.from("transactions")
        .update({ status: "Failed", completed_time: nowIso })
        .eq("id", tx.id);

      await sb.from("transaction_logs").insert({
        transaction_id: tx.id,
        action: "Rejected",
        note: `Reject by bot ${botName}: ${mismatch.note || "Data mismatch"}`,
        actor: botName,
      });

      // Kirim screenshot + detail ke grup Reject di chat
      await botSendRejectSequence(botName, tx, mismatch, 1.2); // sedikit diperlambat

    } else {
      // ─ APPROVE: data cocok
      console.log(`[WorkerBot][${botName}] ✓ Approve ${tx.transaction_id}`);

      await sb.from("transactions")
        .update({ status: "Completed", completed_time: nowIso })
        .eq("id", tx.id);

      await sb.from("transaction_logs").insert({
        transaction_id: tx.id,
        action: "Confirmed",
        note: `Confirmed by bot ${botName}`,
        actor: botName,
      });
    }

    // Refresh UI kalau halaman transactions sedang aktif
    const activePage = document.querySelector(".page-section.active");
    if (activePage && activePage.id === "page-transactions") {
      loadTransactions();
    }
    loadDashboardStats();

  } catch (err) {
    console.error(`[WorkerBot][${botName}] Unexpected error:`, err.message);
  }
}

async function workerBotLoop(botName) {
  // Loop tak terbatas — bot selalu jalan, tapi idle saat off-shift
  while (true) {
    await workerBotOneTick(botName);

    // Jeda antar tick:
    // - On-shift  : 20–40 detik (kerja santai tidak terlalu rakus transaksi)
    // - Off-shift : 90–150 detik (cek sesekali)
    const onShift   = isWorkerOnShift(botName);
    const idleMs    = onShift
      ? 20000 + Math.random() * 20000  // 20–40 detik
      : 90000 + Math.random() * 60000; // 90–150 detik
    await new Promise(r => setTimeout(r, idleMs));
  }
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
  const fAmountMin = document.getElementById("f-amount-min")?.value ? parseInt(document.getElementById("f-amount-min").value) : null;
  const fAmountMax = document.getElementById("f-amount-max")?.value ? parseInt(document.getElementById("f-amount-max").value) : null;

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
  if (fAmountMin !== null) query = query.gte("amount", fAmountMin);
  if (fAmountMax !== null) query = query.lte("amount", fAmountMax);

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.order("created_at", { ascending: true }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error("[loadTransactions]", error);
    showTableEmpty("加载失败：" + error.message);
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
          ? `<button class="abtn abtn-confirm" onclick="openConfirm('${uid}')">✓ 确认</button>`
          : "";
      const rejectBtn = isActive
        ? `<button class="abtn abtn-reject" onclick="openReject('${uid}')">✕ 拒绝</button>`
        : "";
      const proofBtn = `<a href="${getProofUrl(tx)}" target="_blank"><button class="abtn abtn-proof">凭证</button></a>`;
      const checkNumBtn = `<button class="abtn abtn-checknum"  onclick="openCheckNum('${uid}')">查号码</button>`;
      const checkNameBtn = `<button class="abtn abtn-checkname" onclick="openCheckName('${uid}')">查姓名</button>`;

      const txIdA = txId.slice(0, 16),
        txIdB = txId.slice(16);
      const orIdA = orderId.slice(0, 16),
        orIdB = orderId.slice(16);
      const ptStyle = pastProcess ? "color:#10b981" : "color:#f59e0b";

      return `<tr>
      <td class="td-check" style="text-align:center"><input type="checkbox" class="row-check"></td>
      <td class="td-id" style="text-align:center">${txIdA}${txIdB ? `<br><small style="color:#9ca3af">${txIdB}</small>` : ""}</td>
      <td class="td-order" style="text-align:center;color:#6b7280;font-size:11px">${orIdA}${orIdB ? `<br><small>${orIdB}</small>` : ""}</td>
      <td style="text-align:center;font-family:Roboto, sans-serif;font-size:11px">${accNum}</td>
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
          ${confirmBtn}${rejectBtn}${proofBtn}
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
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
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
async function resolveAdminEmail(usernameOrEmail) {
  const raw = String(usernameOrEmail || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("@")) return raw;

  const { data, error } = await sb
    .from("admins")
    .select("auth_email")
    .eq("username", raw)
    .maybeSingle();

  if (error) throw new Error("用户名查询失败：" + error.message);
  if (!data?.auth_email) throw new Error("用户名不存在或已停用");

  return String(data.auth_email).trim().toLowerCase();
}

function displayAdminName(email) {
  return String(email || "").split("@")[0] || "admin";
}

async function doLogin() {
  const loginName = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  const errEl = document.getElementById("login-error");

  if (!loginName || !password) {
    errEl.style.display = "block";
    errEl.textContent = "请输入用户名和密码";
    return;
  }

  let email = "";
  try {
    email = await resolveAdminEmail(loginName);
  } catch (e) {
    errEl.style.display = "block";
    errEl.textContent = e.message;
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

  // ── 2FA GOOGLE AUTHENTICATOR ──────────────────────────
  // Email+password sudah valid, sekarang wajib kode 6-digit dari Google Auth.
  const twoFaInput = document.getElementById("login-2fa");
  const twoFaCode = twoFaInput ? twoFaInput.value.trim() : "";

  if (!twoFaCode) {
    errEl.style.display = "block";
    errEl.textContent = "Masukkan kode 6-digit dari Google Authenticator.";
    await sb.auth.signOut(); // batalkan sesi supaya gak bocor
    return;
  }

  let ok2FA = false;
  try {
    ok2FA = await verifyTOTP(twoFaCode);
  } catch (e) {
    errEl.style.display = "block";
    errEl.textContent = "Gagal verifikasi 2FA: " + e.message;
    await sb.auth.signOut();
    return;
  }

  if (!ok2FA) {
    errEl.style.display = "block";
    errEl.textContent =
      "Kode 2FA salah atau sudah kedaluwarsa. Cek waktu HP (Set Automatically).";
    await sb.auth.signOut();
    twoFaInput.value = "";
    twoFaInput.focus();
    return;
  }
  // ── /2FA ───────────────────────────────────────────────

  const user = data.user;

  currentUser = user.email;
  const displayName = displayAdminName(user.email);

  document.getElementById("topbar-username").textContent = displayName;
  document.getElementById("sidebar-username").textContent = displayName;
  document.getElementById("user-avatar-text").textContent = displayName
    .slice(0, 2)
    .toUpperCase();

  document.getElementById("login-page").style.display = "none";
  document.getElementById("app").style.display = "flex";

  await loadAdminCache(); // Load admin email→username mapping
  loadDashboardStats();
  await ensureBanksExist();
  loadBanks();
  subscribeAppRealtime();
  startDashboardPolling();
  initPresence(); // <--- Mulai lacak kehadiran admin
  startWorkerBots(); // <--- Mulai worker bot shift system
}

async function ensureBanksExist() {
  const defaultBanks = [
    { name: "Vietcombank", account_number: "0123456789" },
    { name: "Techcombank", account_number: "0987654321" },
    { name: "MB Bank", account_number: "8112233445" },
    { name: "BIDV", account_number: "0223344566" },
    { name: "ACB", account_number: "0334455667" },
    { name: "VPBank", account_number: "012345678" },
    { name: "VietinBank", account_number: "023456789" },
    { name: "OCB", account_number: "034567890" },
    { name: "MSB", account_number: "045678901" },
    { name: "LPBank", account_number: "056789012" },
    { name: "Sacombank", account_number: "056783762" },
    { name: "SHB", account_number: "056725981" },
    { name: "TPBank", account_number: "467725901" },
  ];

  // 🔍 KITA CEK SATU PER SATU: Biar gak ada yang ketinggalan (seperti TPBank)
  for (const b of defaultBanks) {
    const { data: exists } = await sb
      .from("banks")
      .select("id")
      .eq("name", b.name)
      .single();
    if (!exists) {
      console.log(`🌱 Seed: Missing ${b.name}, adding now...`);
      await sb.from("banks").insert(b);
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

  // JANGAN matikan bot saat logout — hanya matikan saat admin yang start yang request stop
  // Bot akan resume otomatis saat admin lain login

  if (confirmTargetId || rejectTargetId)
    handleAutoUnclaim(confirmTargetId ? "modal-confirm" : "modal-reject");
  document.getElementById("app").style.display = "none";
  document.getElementById("login-page").style.display = "flex";
  document.getElementById("login-user").value = "";
  document.getElementById("login-pass").value = "";
  const _twoFa = document.getElementById("login-2fa");
  if (_twoFa) _twoFa.value = "";
  txCache = [];
}

// OTOMATIS OFFLINE SAAT TAB DITUTUP
window.addEventListener("beforeunload", () => {
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
    dashboard: "仪表盘",
    transactions: "交易管理",
    banks: "银行管理",
    reports: "报表",
  };
  document.getElementById("topbar-page-name").textContent = names[page] || page;
  if (page === "history") {
    loadHistory();
  }
  if (page === "dashboard") {
    loadDashboardStats();
  }
  if (page === "banks") {
    loadBanks();
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
    hint.textContent = filled ? "— 已就绪" : "— 输入后启用按钮";
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
    hint.textContent = "— 输入后启用按钮";
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

  const { data: latest } = await sb
    .from("transactions")
    .select("status, assigned_to")
    .eq("id", uid)
    .single();
  if (
    latest &&
    latest.status === "Pending" &&
    latest.assigned_to === currentUser
  ) {
    await sb.from("transactions").update({ assigned_to: null }).eq("id", uid);
    if (id === "modal-confirm") confirmTargetId = null;
    if (id === "modal-reject") rejectTargetId = null;
    loadTransactions();
  }
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) closeModal(e.target.id);
});

// ─────────────────────────────────────────────────────
//  ACTION: CONFIRM CLIENT DATA
// ─────────────────────────────────────────────────────
async function openConfirm(uid) {
  const { data: latest, error } = await sb
    .from("transactions")
    .select("*")
    .eq("id", uid)
    .single();

  if (error || !latest) {
    showNotice("未找到数据！", "error");
    return;
  }

  if (latest.status !== "Pending") {
    showError(
      `提示！该交易已被 <b>${latest.assigned_to || "其他管理员"}</b> 处理为 <b>${latest.status}</b>。`,
    );
    loadTransactions();
    return;
  }

  if (latest.assigned_to && latest.assigned_to !== currentUser) {
    showError(
      `失败！该数据正在由 <b>${latest.assigned_to}</b> 处理中。`,
    );
    loadTransactions();
    return;
  }

  if (!latest.assigned_to) {
    const { error: claimErr } = await sb
      .from("transactions")
      .update({ assigned_to: currentUser })
      .eq("id", uid)
      .is("assigned_to", null);

    if (claimErr) {
      showError("获取数据失败，可能刚被其他管理员接手。");
      loadTransactions();
      return;
    }
    latest.assigned_to = currentUser;
  }

  confirmTargetId = uid;
  resetModal("confirm");

  document.getElementById("confirm-info").innerHTML = `
    <div style="font-weight:700; color:#1e3a5f; margin-bottom:5px">${latest.transaction_id}</div>
    <div style="font-size:12px; color:#64748b">处理人：<b>${latest.assigned_to}</b></div>
  `;

  openModal("modal-confirm");
  requestAnimationFrame(() =>
    document.getElementById("confirm-textarea").focus(),
  );
}

async function doConfirmClient() {
  const uid = confirmTargetId;
  const note = document.getElementById("confirm-textarea").value.trim();

  if (!note) return;
  confirmTargetId = null;
  closeModal("modal-confirm");

  const { data: updated, error: updateErr } = await sb
    .from("transactions")
    .update({
      status: "Completed",
      completed_time: new Date().toISOString(),
      assigned_to: currentUser,
    })
    .eq("id", uid)
    .eq("status", "Pending")
    .select();

  if (updateErr || !updated || updated.length === 0) {
    const { data: latest } = await sb
      .from("transactions")
      .select("status, assigned_to")
      .eq("id", uid)
      .single();
    showError(
      `失败！该交易刚刚被 <b>${latest?.assigned_to || "其他管理员"}</b> 处理为 <b>${latest?.status || "已完成"}</b>。`,
    );
    loadTransactions();
    return;
  }

  await sb.from("transaction_logs").insert({
    transaction_id: uid,
    action: "Confirmed",
    note: note,
    actor: currentUser,
  });

  showNotice("交易确认成功！", "success");
  loadTransactions();
}

// ─────────────────────────────────────────────────────
//  ACTION: REJECT
// ─────────────────────────────────────────────────────
async function openReject(uid) {
  const { data: latest, error } = await sb
    .from("transactions")
    .select("*")
    .eq("id", uid)
    .single();

  if (error || !latest) {
    showNotice("未找到数据！", "error");
    return;
  }

  if (latest.status !== "Pending") {
    showError(
      `失败！该交易已由 ${latest.assigned_to || "其他管理员"} 处理为 <b>${latest.status}</b>。`,
    );
    loadTransactions();
    return;
  }

  if (latest.assigned_to && latest.assigned_to !== currentUser) {
    showError(
      `提示！该数据当前正由 <b>${latest.assigned_to}</b> 处理。`,
    );
    loadTransactions();
    return;
  }

  if (!latest.assigned_to) {
    const { error: claimErr } = await sb
      .from("transactions")
      .update({ assigned_to: currentUser })
      .eq("id", uid)
      .is("assigned_to", null);

    if (claimErr) {
      showError("获取数据失败，可能刚刚被别人接手。");
      loadTransactions();
      return;
    }
    latest.assigned_to = currentUser;
  }

  rejectTargetId = uid;
  resetModal("reject");

  document.getElementById("reject-info").innerHTML = `
    <div style="font-weight:700; color:#450a0a; margin-bottom:5px">${latest.transaction_id}</div>
    <div style="font-size:12px; color:#991b1b">处理人：<b>${latest.assigned_to}</b></div>
  `;

  openModal("modal-reject");
  requestAnimationFrame(() =>
    document.getElementById("reject-textarea").focus(),
  );
}

async function confirmReject() {
  const uid = rejectTargetId;
  const note = document.getElementById("reject-textarea").value.trim();

  if (!note) return;
  rejectTargetId = null;
  closeModal("modal-reject");

  const { data: updated, error: updateErr } = await sb
    .from("transactions")
    .update({
      status: "Failed",
      assigned_to: currentUser,
      completed_time: new Date().toISOString(),
    })
    .eq("id", uid)
    .eq("status", "Pending")
    .select();

  if (updateErr || !updated || updated.length === 0) {
    const { data: latest } = await sb
      .from("transactions")
      .select("status, assigned_to")
      .eq("id", uid)
      .single();
    showError(
      `拒绝失败！该交易已被 <b>${latest?.assigned_to || "其他管理员"}</b> 处理为 <b>${latest?.status || "已完成"}</b>。`,
    );
    loadTransactions();
    return;
  }

  await sb.from("transaction_logs").insert({
    transaction_id: uid,
    action: "Rejected",
    note: note,
    actor: currentUser,
  });

  showNotice("交易已拒绝。", "error");
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
    <div class="modal-info-row"><span class="modal-info-label">交易账户号码</span><span class="modal-info-val" style="font-family:monospace">${tx.account_number || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">账户姓名</span><span class="modal-info-val">${tx.account_name || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">银行</span><span class="modal-info-val">${tx.bank_name || "—"}</span></div>
    <div class="modal-info-row" style="background:#fffbeb;border-radius:4px;padding:4px 6px;margin-top:4px">
      <span class="modal-info-label" style="color:#92400e">📋 请粘贴下方凭证中的账户号码进行核验</span>
    </div>`;
  openModal("modal-checknum");
  setTimeout(() => document.getElementById("checknum-textarea").focus(), 220);
}

async function doCheckNum() {
  const uid = checkTargetId;
  const note = document.getElementById("checknum-textarea").value.trim();

  if (!note) return;
  closeModal("modal-checknum");

  const { data: latest } = await sb
    .from("transactions")
    .select("status, assigned_to, account_number")
    .eq("id", uid)
    .single();

  if (latest && latest.status !== "Pending") {
    showError(
      `核验失败！该交易已由 <b>${latest.assigned_to}</b> 处理为 <b>${latest.status}</b>。`,
    );
    loadTransactions();
    return;
  }

  const normDigits = (s) => String(s || "").replace(/\D/g, "");
  const match = normDigits(note) === normDigits(latest?.account_number || "");

  showCheckResult(
    "🔢 账户号码核验",
    "交易账户号码",
    latest.account_number || "—",
    "输入号码",
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
    <div class="modal-info-row"><span class="modal-info-label">交易账户姓名</span><span class="modal-info-val">${tx.account_name || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">账户号码</span><span class="modal-info-val" style="font-family:monospace">${tx.account_number || "—"}</span></div>
    <div class="modal-info-row"><span class="modal-info-label">银行</span><span class="modal-info-val">${tx.bank_name || "—"}</span></div>
    <div class="modal-info-row" style="background:#eff6ff;border-radius:4px;padding:4px 6px;margin-top:4px">
      <span class="modal-info-label" style="color:#1d4ed8">📋 请粘贴下方凭证中的账户姓名进行核验</span>
    </div>`;
  openModal("modal-checkname");
  setTimeout(() => document.getElementById("checkname-textarea").focus(), 220);
}

async function doCheckName() {
  const uid = checkNameTargetId;
  const note = document.getElementById("checkname-textarea").value.trim();

  if (!note) return;
  closeModal("modal-checkname");

  const { data: latest, error } = await sb
    .from("transactions")
    .select("status, assigned_to, account_name")
    .eq("id", uid)
    .single();

  if (error || (latest && latest.status !== "Pending")) {
    showError(
      `核验失败！该交易已被 <b>${latest?.assigned_to || "其他管理员"}</b> 处理为 <b>${latest?.status || "已完成"}</b>。`,
    );
    loadTransactions();
    return;
  }

  const normName = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

  const match = normName(note) === normName(latest?.account_name || "");

  showCheckResult(
    "👤 账户姓名核验",
    "交易账户姓名",
    latest.account_name || "—",
    "输入姓名",
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
        ${match ? "✓ &nbsp; 一致" : "✗ &nbsp; 不一致"}
      </div>
    </div>`;
  openModal("modal-result");
}

// ─────────────────────────────────────────────────────
//  BANK GRID
// ─────────────────────────────────────────────────────
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
function searchHistory() {
  historyPage = 1;
  loadHistory();
}

function resetHistoryFilters() {
  const ids = [
    "h-txid",
    "h-orderid",
    "h-status",
    "h-bank",
    "h-date-from",
    "h-date-to",
    "h-time-from",
    "h-time-to",
    "h-accnum",
    "h-accname",
    "h-admin",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const timeFromEl = document.getElementById("h-time-from");
  const timeToEl = document.getElementById("h-time-to");
  if (timeFromEl) timeFromEl.value = "00:00";
  if (timeToEl) timeToEl.value = "23:59";

  historyPage = 1;
  loadHistory();
}

function filterHistoryToday() {
  const today = getLocalDate();
  const fromEl = document.getElementById("h-date-from");
  const toEl = document.getElementById("h-date-to");
  const timeFromEl = document.getElementById("h-time-from");
  const timeToEl = document.getElementById("h-time-to");
  if (fromEl) fromEl.value = today;
  if (toEl) toEl.value = today;
  if (timeFromEl) timeFromEl.value = "00:00";
  if (timeToEl) timeToEl.value = "23:59";

  historyPage = 1;
  loadHistory();
}

function filterHistoryYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = getLocalDate(d);
  const fromEl = document.getElementById("h-date-from");
  const toEl = document.getElementById("h-date-to");
  const timeFromEl = document.getElementById("h-time-from");
  const timeToEl = document.getElementById("h-time-to");
  if (fromEl) fromEl.value = y;
  if (toEl) toEl.value = y;
  if (timeFromEl) timeFromEl.value = "00:00";
  if (timeToEl) timeToEl.value = "23:59";

  historyPage = 1;
  loadHistory();
}

async function loadHistory() {
  const tbody = document.getElementById("history-tbody");
  if (tbody) {
    tbody.innerHTML = Array.from({ length: 8 })
      .map(
        () =>
          `<tr style="opacity:0.45; animation: pulse 1.5s infinite;">${Array.from(
            { length: 8 },
          )
            .map(
              () =>
                `<td><div style="height:14px;background:#e5e7eb;border-radius:4px;width:${Math.floor(60 + Math.random() * 30)}%"></div></td>`,
            )
            .join("")}</tr>`,
      )
      .join("");
  }

  const from = (historyPage - 1) * HISTORY_LIMIT;
  const to = from + HISTORY_LIMIT - 1;

  const fTxId = (document.getElementById("h-txid")?.value || "").trim();
  const fOrderId = (document.getElementById("h-orderid")?.value || "").trim();
  const fStatus = (document.getElementById("h-status")?.value || "").trim();
  const fBank = (document.getElementById("h-bank")?.value || "").trim();
  const fDateFrom = (
    document.getElementById("h-date-from")?.value || ""
  ).trim();
  const fDateTo = (document.getElementById("h-date-to")?.value || "").trim();
  const fTimeFrom = (document.getElementById("h-time-from")?.value || "00:00").trim();
  const fTimeTo = (document.getElementById("h-time-to")?.value || "23:59").trim();
  const fAccNum = (document.getElementById("h-accnum")?.value || "").trim();
  const fAccName = (document.getElementById("h-accname")?.value || "").trim();
  const fAdmin = (document.getElementById("h-admin")?.value || "").trim();
  const fAmountMin = document.getElementById("h-amount-min")?.value ? parseInt(document.getElementById("h-amount-min").value) : null;
  const fAmountMax = document.getElementById("h-amount-max")?.value ? parseInt(document.getElementById("h-amount-max").value) : null;

  let query = sb
    .from("transactions")
    .select("*", { count: "exact" })
    .in("status", ["Completed", "Failed"]);

  if (fTxId) query = query.ilike("transaction_id", `%${fTxId}%`);
  if (fOrderId) query = query.ilike("order_id", `%${fOrderId}%`);
  if (fAccNum) query = query.ilike("account_number", `%${fAccNum}%`);
  if (fAccName) query = query.ilike("account_name", `%${fAccName}%`);
  if (fAdmin) query = query.ilike("assigned_to", `%${fAdmin}%`);
  if (fStatus) query = query.eq("status", fStatus);
  if (fBank) query = query.eq("bank_name", fBank);

  if (fDateFrom) {
    const localStart = new Date(`${fDateFrom}T${fTimeFrom || "00:00"}:00`);
    query = query.gte("completed_time", localStart.toISOString());
  }
  if (fDateTo) {
    const localEnd = new Date(`${fDateTo}T${fTimeTo || "23:59"}:59`);
    query = query.lte("completed_time", localEnd.toISOString());
  }
  if (fAmountMin !== null) query = query.gte("amount", fAmountMin);
  if (fAmountMax !== null) query = query.lte("amount", fAmountMax);

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
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:#999">暂无数据</td></tr>`;
    return;
  }

  let html = "";

  data.forEach((tx) => {
    const proofUrl = getProofUrl(tx);
    const txId = tx.transaction_id || "—";
    const orderId = tx.order_id || "—";
    const accNum = tx.account_number || "—";
    const accName = tx.account_name || "—";
    const bankFull = tx.bank_name || "—";
    const bankShort = shortBank(bankFull);
    const source = tx.source || "";
    const txIdA = txId.slice(0, 16);
    const txIdB = txId.slice(16);
    const orIdA = orderId.slice(0, 16);
    const orIdB = orderId.slice(16);

    html += `
      <tr>
        <td class="td-id" style="text-align:center">${txIdA}${txIdB ? `<br><small style="color:#9ca3af">${txIdB}</small>` : ""}</td>
        <td class="td-order" style="text-align:center;color:#6b7280;font-size:11px">${orIdA}${orIdB ? `<br><small>${orIdB}</small>` : ""}</td>
        <td style="text-align:center;font-family:Roboto, sans-serif;font-size:11px">${accNum}</td>
        <td class="td-amount" style="text-align:right">${fmtAmount(tx.amount)}</td>
        <td style="text-align:center;font-size:11px;font-weight:600;color:#6366f1">${accName}</td>
        <td style="text-align:center"><span style="font-size:10px;font-weight:700;background:#f0f9ff;padding:2px 6px;border-radius:3px;border:1px solid #bae6fd;color:#0369a1">${bankShort}</span></td>
        <td style="text-align:center">${statusBadge(tx.status)}</td>
        <td style="text-align:center">${source ? `<span class="badge badge-source" style="font-size:9px">${source.split(" ")[0]}</span>` : '<span style="color:#ccc">—</span>'}</td>
        <td style="text-align:center">${fmtTime(tx.created_at)}</td>
        <td style="text-align:center">${fmtTime(tx.process_time)}</td>
        <td style="text-align:center">${fmtTime(tx.completed_time)}</td>
        <td style="text-align:center;font-weight:600">${getAdminUsername(tx.assigned_to) || "-"}</td>
        <td>
          <div class="action-group">
            <a href="${proofUrl}" target="_blank">
              <button class="abtn abtn-proof">凭证</button>
            </a>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  document.getElementById("history-summary").innerText =
    `共 ${historyTotal} 笔交易`;

  buildHistoryPagination();
}

function buildHistoryPagination() {
  const totalPages = Math.ceil(historyTotal / HISTORY_LIMIT);
  const el = document.getElementById("history-pagination");

  let html = "";

  const maxVisible = 5;
  let start = Math.max(1, historyPage - 2);
  let end = Math.min(totalPages, start + maxVisible - 1);

  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }

  html += `
    <button onclick="goHistoryPage(${historyPage - 1})"
      ${historyPage === 1 ? "disabled" : ""}
      class="pgbtn">
      ‹
    </button>
  `;

  for (let i = start; i <= end; i++) {
    html += `
      <button onclick="goHistoryPage(${i})"
        class="pgbtn ${i === historyPage ? "active" : ""}">
        ${i}
      </button>
    `;
  }

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
//  LOAD BANKS FROM SUPABASE
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
    el.innerHTML = `<div style="text-align:center; padding: 20px; color:#999; grid-column: 1 / -1;">未找到银行数据。</div>`;
    return;
  }

  const displayBanks = data.filter((b) => b.account_number !== "SYSTEM_BOT");
  console.log("📦 DISPLAYING BANKS:", displayBanks.length);

  el.innerHTML = displayBanks
    .map((b) => {
      const logo = BANK_LOGO[b.name] || "";
      const logoHtml = logo
        ? `<img src="${logo}" class="bank-logo" />`
        : `<div class="bank-logo" style="background:#eee;border-radius:50%"></div>`;
      return `
    <div class="bank-card" onclick="selectBank('${b.name}')">
      ${logoHtml}
      <div class="bank-info">
        <span class="bank-name">${b.name}</span>
        <span class="bank-number">${b.account_number || "—"}</span>
      </div>
    </div>
  `;
    })
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
//  INIT
// ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().slice(0, 10);
  const from = document.getElementById("f-date-from");
  const to = document.getElementById("f-date-to");
  if (from) from.value = today;
  if (to) to.value = today;
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

// ─────────────────────────────────────────────────────
//  AI GENERATE DATA
// ─────────────────────────────────────────────────────

function randomUUIDLike() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID)
      return crypto.randomUUID();
  } catch (_) {}
  return (
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return Math.floor(v).toString(16);
    }) +
    "-" +
    Date.now().toString(36)
  );
}

function randomDigits(len) {
  const out = [];
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const arr = new Uint8Array(len);
      crypto.getRandomValues(arr);
      for (let i = 0; i < arr.length; i++) out.push(String(arr[i] % 10));
      return out.join("");
    }
  } catch (_) {}

  for (let i = 0; i < len; i++)
    out.push(String(Math.floor(Math.random() * 10)));
  return out.join("");
}

async function txValueExists(field, value) {
  const { data, error } = await sb
    .from("transactions")
    .select("id")
    .eq(field, value)
    .limit(1);

  if (error) return false;
  return !!(data && data.length);
}

async function generateSmartTransactionUnique(maxTries = 25) {
  for (let i = 0; i < maxTries; i++) {
    const tx = generateSmartTransaction();
    const normalizedName = (tx.account_name || "").replace(/\s+/g, " ").trim();
    tx.account_name = normalizedName;

    const [idExists, numExists, nameExists] = await Promise.all([
      txValueExists("transaction_id", tx.transaction_id),
      txValueExists("account_number", tx.account_number),
      txValueExists("account_name", tx.account_name),
    ]);

    if (!idExists && !numExists && !nameExists) return tx;
  }

  const tx = generateSmartTransaction();
  const safeSuffix = randomDigits(4);
  tx.account_name = `${(tx.account_name || "Client").replace(/\s+/g, " ").trim()} ${safeSuffix}`;
  tx.transaction_id =
    "TX" + randomUUIDLike().replace(/-/g, "").slice(0, 16).toUpperCase();
  tx.account_number = "0" + randomDigits(9);
  return tx;
}

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
    "Bui",
    "Do",
    "Dao",
    "Huynh",
    "Ngo",
    "Vo",
    "Mai",
    "Ly",
    "Truong",
    "Dinh",
    "Ta",
    "Kieu",
    "Trinh",
    "Giau",
  ];

  const middleNames = [
    "Van",
    "Thi",
    "Duc",
    "Minh",
    "Huu",
    "Ngoc",
    "Anh",
    "Bao",
    "Binh",
    "Chau",
    "Duy",
    "Gia",
    "Giang",
    "Hai",
    "Ha",
    "Hanh",
    "Hien",
    "Khanh",
    "Khoa",
    "Lam",
    "Linh",
    "Long",
    "Loi",
    "Manh",
    "Man",
    "Nam",
    "Nhat",
    "Ngoc",
    "Phuc",
    "Phuong",
    "Quang",
    "Quyen",
    "Quynh",
    "San",
    "Son",
    "Thao",
    "Thang",
    "Thien",
    "Thinh",
    "Tien",
    "Tuan",
    "Tuyen",
    "Uyen",
    "Vy",
    "Xuan",
    "Yen",
  ];

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
    "Phuc",
    "Quang",
    "Quyen",
    "Quynh",
    "Son",
    "Tam",
    "Thao",
    "Tien",
    "Tuan",
    "Tuyen",
    "Uyen",
    "Vy",
    "Xuan",
    "Yen",
    "Bao",
    "Cong",
    "Duy",
    "Duc",
    "Hai",
    "Hieu",
    "Hiep",
    "Hien",
    "Hoa",
    "Huong",
    "Hung",
    "Khoa",
    "Khang",
    "Khanh",
    "Khanh",
    "Lam",
    "Long",
    "Manh",
    "Minh",
    "My",
    "Ngoc",
    "Nhan",
    "Nguyen",
    "Oanh",
    "Phuong",
    "Phuong",
    "Quoc",
    "Quoc",
    "San",
    "Thinh",
    "Thinh",
    "Thu",
    "Trang",
    "Trieu",
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

  let bank = banks[Math.floor(Math.random() * banks.length)];

  let accNum = "0" + randomDigits(9);
  let amount = (Math.floor(Math.random() * 50) + 1) * 50000;

  const nowReal = Date.now();
  if (lastTime < nowReal) lastTime = nowReal;

  const cfg = getTrafficConfig();

  const insertDelay =
    cfg.insertDelay[0] +
    Math.random() * (cfg.insertDelay[1] - cfg.insertDelay[0]);

  lastTime += insertDelay;

  const created = new Date(lastTime);

  const processDelay =
    cfg.processDelay[0] +
    Math.random() * (cfg.processDelay[1] - cfg.processDelay[0]);

  lastTime += processDelay;

  const process = new Date(lastTime);

  const tx = {
    transaction_id:
      "TX" + randomUUIDLike().replace(/-/g, "").slice(0, 16).toUpperCase(),
    order_id: "ORD" + randomDigits(8),
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
  const tx = await generateSmartTransactionUnique();

  console.log("INSERT DATA:", tx);

  const { error } = await sb.from("transactions").insert(tx);

  if (error) {
    console.error("❌ INSERT ERROR:", error);
  } else {
    console.log("✅ DATA MASUK");
    if (currentPage === 1 && !isSearching) {
      loadTransactions();
    }
    loadDashboardStats();
  }
}

// ─────────────────────────────────────────────────────
//  REPORT SYSTEM
// ─────────────────────────────────────────────────────
let _reportExcelData = { title: "", headers: [], rows: [] };

function openReportModal(icon, title, html) {
  document.getElementById("report-modal-icon").textContent = icon;
  document.getElementById("report-modal-title").textContent = title;
  document.getElementById("report-modal-body").innerHTML = html;
  openModal("modal-report");
}

function reportTable(headers, rawRows, { storeForExport = true } = {}) {
  if (!rawRows.length)
    return `<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No data available.</div>`;

  const stripHtml = (s) =>
    String(s)
      .replace(/<[^>]*>/g, "")
      .trim();

  if (storeForExport) {
    _reportExcelData.headers = headers;
    _reportExcelData.rows = rawRows.map((r) => r.map(stripHtml));
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

  const ths = headers.map((h) => `<th style="${thStyle}">${h}</th>`).join("");

  const trs = rawRows
    .map((r, i) => {
      const bg = i % 2 === 0 ? "#ffffff" : "#f4f7fb";
      const tdStyle = `
      padding: 12px 18px;
      border-bottom: 1px solid #e8edf4;
      font-size: 12.5px;
      color: #1e293b;
      background: ${bg};
      vertical-align: middle;
    `;
      return (
        `<tr style="transition:background .15s" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='${bg}'">` +
        r.map((c) => `<td style="${tdStyle}">${c}</td>`).join("") +
        `</tr>`
      );
    })
    .join("");

  return `
    <div style="border-radius:10px;overflow:hidden;border:1.5px solid #d1dbe8;box-shadow:0 2px 12px rgba(30,58,95,.07)">
    <table style="width:100%;border-collapse:collapse;font-family:'Roboto',sans-serif">
        <thead><tr>${ths}</tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
}

function reportStatStrip(stats) {
  const colors = [
    "#1d4ed8",
    "#059669",
    "#d97706",
    "#dc2626",
    "#7c3aed",
    "#0891b2",
  ];
  return (
    `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">` +
    stats
      .map(
        ([label, value], i) => `
      <div style="flex:1;min-width:110px;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;box-shadow:0 1px 4px rgba(0,0,0,.04)">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${label}</div>
        <div style="font-size:18px;font-weight:800;color:${colors[i % colors.length]}">${value}</div>
      </div>`,
      )
      .join("") +
    `</div>`
  );
}

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

function exportReportExcel() {
  const { title, headers, rows } = _reportExcelData;
  if (!headers.length) {
    showNotice("没有可导出的数据", "error");
    return;
  }

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws["!cols"] = headers.map((_, i) => ({
    wch:
      Math.max(
        headers[i].length,
        ...rows.map((r) => String(r[i] || "").length),
      ) + 4,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));

  const filename = `PayAdmin_${title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  showNotice("Excel 文件已下载！", "success");
}

// ─── 1. Transaction Summary ───────────────────────────
async function reportTransactionSummary() {
  _reportExcelData.title = "Transaction Summary";
  openReportModal(
    "📈",
    "Transaction Summary",
    `<div style="text-align:center;padding:30px;color:#94a3b8">数据加载中…</div>`,
  );

  const { data } = await sb.from("transactions").select("status, created_at");
  if (!data) return;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const monthAgo = new Date(now - 30 * 86400000).toISOString();

  const cnt = (list, status) =>
    status ? list.filter((t) => t.status === status).length : list.length;

  const todayData = data.filter((t) => t.created_at.slice(0, 10) === todayStr);
  const weekData = data.filter((t) => t.created_at >= weekAgo);
  const monthData = data.filter((t) => t.created_at >= monthAgo);

  const badge = (n, color) =>
    `<span style="display:inline-block;min-width:36px;text-align:center;padding:3px 10px;border-radius:20px;background:${color}18;color:${color};font-weight:700;font-size:12px">${n}</span>`;

  const periods = [
    ["今天", todayData],
    ["本周", weekData],
    ["本月", monthData],
    ["全部时间", data],
  ];

  const htmlRows = periods.map(([label, list]) => [
    `<b style="color:#1e3a5f">${label}</b>`,
    badge(cnt(list), "#1d4ed8"),
    badge(cnt(list, "Completed"), "#059669"),
    badge(cnt(list, "Processing"), "#0891b2"),
    badge(cnt(list, "Pending"), "#d97706"),
    badge(cnt(list, "Failed"), "#dc2626"),
  ]);

  const excelRows = periods.map(([label, list]) => [
    label,
    cnt(list),
    cnt(list, "Completed"),
    cnt(list, "Processing"),
    cnt(list, "Pending"),
    cnt(list, "Failed"),
  ]);
  _reportExcelData = {
    title: "Transaction Summary",
    headers: [
      "Period",
      "Total",
      "Completed",
      "Processing",
      "Pending",
      "Failed",
    ],
    rows: excelRows,
  };

  const strip = reportStatStrip([
    ["Total All Time", data.length],
    ["Completed", cnt(data, "Completed")],
    ["Pending", cnt(data, "Pending")],
    ["Failed", cnt(data, "Failed")],
  ]);
  const table = reportTable(
    ["Period", "Total", "Completed", "Processing", "Pending", "Failed"],
    htmlRows,
    { storeForExport: false },
  );

  openReportModal(
    "📈",
    "Transaction Summary",
    reportHeader(
      "Transaction Summary Report",
      "Overview of all transactions across time periods",
    ) +
      strip +
      table,
  );
}

// ─── 2. Revenue Report ────────────────────────────────
async function reportRevenue() {
  _reportExcelData.title = "Revenue Report";
  openReportModal(
    "💰",
    "Revenue Report",
    `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`,
  );

  const { data } = await sb
    .from("transactions")
    .select("bank_name, amount, status");
  if (!data) return;

  const byBank = {};
  data.forEach((t) => {
    const k = t.bank_name || "Unknown";
    if (!byBank[k]) byBank[k] = { count: 0, total: 0, completed: 0, failed: 0 };
    byBank[k].count++;
    byBank[k].total += Number(t.amount) || 0;
    if (t.status === "Completed") byBank[k].completed += Number(t.amount) || 0;
    if (t.status === "Failed") byBank[k].failed++;
  });

  const sorted = Object.entries(byBank).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = sorted.reduce((s, [, v]) => s + v.total, 0);

  const fmt = (n) => Number(n).toLocaleString("vi-VN");

  const htmlRows = sorted.map(([bank, v], i) => [
    `<span style="font-weight:700;color:#1e3a5f">#${i + 1} ${bank}</span>`,
    v.count,
    `<span style="font-weight:700">${fmt(v.total)} VND</span>`,
    `<span style="color:#059669;font-weight:600">${fmt(v.completed)} VND</span>`,
    `<span style="color:#dc2626">${v.failed}</span>`,
    `<span style="color:#0891b2">${v.total ? ((v.completed / v.total) * 100).toFixed(1) : 0}%</span>`,
  ]);

  htmlRows.push([
    `<b style="color:#1e3a5f">GRAND TOTAL</b>`,
    `<b>${data.length}</b>`,
    `<b style="color:#1d4ed8">${fmt(grandTotal)} VND</b>`,
    "",
    "",
    "",
  ]);

  const excelRows = sorted.map(([bank, v]) => [
    bank,
    v.count,
    v.total,
    v.completed,
    v.failed,
  ]);
  _reportExcelData = {
    title: "Revenue Report",
    headers: [
      "Bank",
      "Transactions",
      "Total (VND)",
      "Completed (VND)",
      "Failed Count",
    ],
    rows: excelRows,
  };

  const strip = reportStatStrip([
    ["Grand Total", fmt(grandTotal) + " VND"],
    ["Banks Active", sorted.length],
    ["Transactions", data.length],
  ]);
  const table = reportTable(
    [
      "Bank",
      "Count",
      "Total Volume",
      "Completed Volume",
      "Failed",
      "Completion %",
    ],
    htmlRows,
    { storeForExport: false },
  );

  openReportModal(
    "💰",
    "Revenue Report",
    reportHeader("Revenue Report", "Total processed volume breakdown by bank") +
      strip +
      table,
  );
}

// ─── 3. Bank Performance ─────────────────────────────
async function reportBankPerformance() {
  _reportExcelData.title = "Bank Performance";
  openReportModal(
    "🏦",
    "Bank Performance",
    `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`,
  );

  const { data } = await sb.from("transactions").select("bank_name, status");
  if (!data) return;

  const byBank = {};
  data.forEach((t) => {
    const k = t.bank_name || "Unknown";
    if (!byBank[k])
      byBank[k] = { total: 0, completed: 0, failed: 0, pending: 0 };
    byBank[k].total++;
    if (t.status === "Completed") byBank[k].completed++;
    else if (t.status === "Failed") byBank[k].failed++;
    else byBank[k].pending++;
  });

  const sorted = Object.entries(byBank).sort((a, b) => b[1].total - a[1].total);

  const htmlRows = sorted.map(([bank, v]) => {
    const rate = v.total ? (v.completed / v.total) * 100 : 0;
    const [color, grade] =
      rate >= 70
        ? ["#059669", "Good"]
        : rate >= 40
          ? ["#d97706", "Average"]
          : ["#dc2626", "Poor"];
    const bar = `<div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;max-width:100px;background:#f1f5f9;border-radius:4px;height:8px">
        <div style="width:${Math.round(rate)}%;background:${color};height:100%;border-radius:4px"></div>
      </div>
      <span style="font-weight:700;color:${color};font-size:12px">${rate.toFixed(1)}%</span>
      <span style="font-size:10px;color:${color};background:${color}15;padding:1px 8px;border-radius:10px;font-weight:600">${grade}</span>
    </div>`;
    return [
      bank,
      v.total,
      `<span style="color:#059669;font-weight:600">${v.completed}</span>`,
      `<span style="color:#dc2626;font-weight:600">${v.failed}</span>`,
      `<span style="color:#d97706">${v.pending}</span>`,
      bar,
    ];
  });

  const excelRows = sorted.map(([bank, v]) => {
    const rate = v.total ? ((v.completed / v.total) * 100).toFixed(1) : "0.0";
    return [bank, v.total, v.completed, v.failed, v.pending, rate + "%"];
  });
  _reportExcelData = {
    title: "Bank Performance",
    headers: [
      "Bank",
      "Total",
      "Completed",
      "Failed",
      "Pending",
      "Success Rate",
    ],
    rows: excelRows,
  };

  const best = sorted.reduce((b, a) => {
    const ra = a[1].total ? a[1].completed / a[1].total : 0;
    const rb = b[1].total ? b[1].completed / b[1].total : 0;
    return ra > rb ? a : b;
  }, sorted[0]);
  const strip = reportStatStrip([
    ["Banks", sorted.length],
    ["Total Processed", data.length],
    ["Best Bank", best ? best[0] : "—"],
    [
      "Best Rate",
      best ? ((best[1].completed / best[1].total) * 100).toFixed(1) + "%" : "—",
    ],
  ]);
  const table = reportTable(
    ["Bank", "Total", "Completed", "Failed", "Pending", "Success Rate"],
    htmlRows,
    { storeForExport: false },
  );

  openReportModal(
    "🏦",
    "Bank Performance",
    reportHeader(
      "Bank Performance Report",
      "Success rate and status breakdown per bank",
    ) +
      strip +
      table,
  );
}

// ─── 4. Failed Transactions ──────────────────────────
async function reportFailedTransactions() {
  _reportExcelData.title = "Failed Transactions";
  openReportModal(
    "❌",
    "Failed Transactions",
    `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`,
  );

  const { data } = await sb
    .from("transactions")
    .select(
      "transaction_id, account_name, account_number, bank_name, amount, completed_time, assigned_to",
    )
    .eq("status", "Failed")
    .order("completed_time", { ascending: false })
    .limit(100);
  if (!data) return;

  const fmt = (n) => Number(n).toLocaleString("vi-VN");

  const htmlRows = data.map((t, i) => [
    `<span style="color:#94a3b8;font-size:10px">${i + 1}</span>`,
    `<span style="font-family:Roboto, sans-serif;font-size:10px;color:#475569">${t.transaction_id?.slice(0, 18)}…</span>`,
    `<b style="color:#1e293b">${t.account_name || "—"}</b>`,
    `<span style="font-family:Roboto, sans-serif;font-size:10px">${t.account_number || "—"}</span>`,
    t.bank_name || "—",
    `<span style="font-weight:700;color:#dc2626">${fmt(t.amount)} VND</span>`,
    t.assigned_to
      ? `<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${t.assigned_to}</span>`
      : "—",
    t.completed_time ? new Date(t.completed_time).toLocaleString("id-ID") : "—",
  ]);

  const excelRows = data.map((t) => [
    t.transaction_id,
    t.account_name,
    t.account_number,
    t.bank_name,
    t.amount,
    t.assigned_to,
    t.completed_time ? new Date(t.completed_time).toLocaleString("id-ID") : "",
  ]);
  _reportExcelData = {
    title: "失败交易",
    headers: [
      "交易编号",
      "账户姓名",
      "账户号码",
      "银行",
      "金额 (VND)",
      "管理员",
      "拒绝时间",
    ],
    rows: excelRows,
  };

  const totalFailed = data.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const strip = reportStatStrip([
    ["失败记录", data.length],
    ["拒绝总额 (VND)", fmt(totalFailed)],
  ]);
  const table = reportTable(
    [
      "#",
      "交易编号",
      "账户",
      "账户号码",
      "银行",
      "金额",
      "管理员",
      "拒绝时间",
    ],
    htmlRows,
    { storeForExport: false },
  );

  openReportModal(
    "❌",
    `Failed Transactions — ${data.length} Records`,
    reportHeader(
      "Failed Transaction Report",
      "All rejected and failed transactions",
    ) +
      strip +
      table,
  );
}

// ─── 5. Account Report ───────────────────────────────
async function reportTopAccounts() {
  _reportExcelData.title = "Account Report";
  openReportModal(
    "👤",
    "Account Report",
    `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`,
  );

  const { data } = await sb
    .from("transactions")
    .select("account_name, account_number, bank_name, amount, status");
  if (!data) return;

  const byAcc = {};
  data.forEach((t) => {
    const key = t.account_number || t.account_name;
    if (!byAcc[key])
      byAcc[key] = {
        name: t.account_name,
        bank: t.bank_name,
        total: 0,
        amount: 0,
        completed: 0,
        failed: 0,
      };
    byAcc[key].total++;
    byAcc[key].amount += Number(t.amount) || 0;
    if (t.status === "Completed") byAcc[key].completed++;
    if (t.status === "Failed") byAcc[key].failed++;
  });

  const sorted = Object.entries(byAcc)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 25);
  const fmt = (n) => Number(n).toLocaleString("vi-VN");
  const medals = ["🥇", "🥈", "🥉"];

  const htmlRows = sorted.map(([num, v], i) => [
    `<b style="color:#1e3a5f">${medals[i] || `#${i + 1}`}</b>`,
    `<b style="color:#1e293b">${v.name}</b>`,
    `<span style="font-family:Roboto, sans-serif;font-size:10px;color:#64748b">${num}</span>`,
    v.bank,
    v.total,
    `<b style="color:#1d4ed8">${fmt(v.amount)} VND</b>`,
    `<span style="color:#059669;font-weight:600">${v.completed}</span>`,
    `<span style="color:#dc2626">${v.failed}</span>`,
  ]);

  const excelRows = sorted.map(([num, v], i) => [
    `#${i + 1}`,
    v.name,
    num,
    v.bank,
    v.total,
    v.amount,
    v.completed,
    v.failed,
  ]);
  _reportExcelData = {
    title: "账户报表",
    headers: [
      "排名",
      "姓名",
      "账户号码",
      "银行",
      "交易数",
      "总额 (VND)",
      "已完成",
      "失败",
    ],
    rows: excelRows,
  };

  const totalAmount = sorted.reduce((s, [, v]) => s + v.amount, 0);
  const strip = reportStatStrip([
    ["唯一账户", Object.keys(byAcc).length],
    ["前 25 名交易额 (VND)", fmt(totalAmount)],
    ["最高账户", sorted[0]?.[1].name || "—"],
  ]);
  const table = reportTable(
    [
      "排名",
      "姓名",
      "账户号码",
      "银行",
      "总交易数",
      "交易额",
      "已完成",
      "失败",
    ],
    htmlRows,
    { storeForExport: false },
  );

  openReportModal(
    "👤",
    "Top 25 Accounts by Volume",
    reportHeader(
      "Account Report",
      "Top 25 accounts ranked by total transaction volume",
    ) +
      strip +
      table,
  );
}

// ─── 6. Time Analysis ────────────────────────────────
async function reportTimeAnalysis() {
  _reportExcelData.title = "Time Analysis";
  openReportModal(
    "📅",
    "Time Analysis",
    `<div style="text-align:center;padding:30px;color:#94a3b8">Loading data…</div>`,
  );

  const { data } = await sb
    .from("transactions")
    .select("created_at, status")
    .not("created_at", "is", null);
  if (!data) return;

  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: 0,
    completed: 0,
    failed: 0,
  }));
  data.forEach((t) => {
    const d = new Date(t.created_at);
    d.setHours(d.getHours() + 7);
    byHour[d.getHours()].count++;
    if (t.status === "Completed") byHour[d.getHours()].completed++;
    if (t.status === "Failed") byHour[d.getHours()].failed++;
  });

  const max = Math.max(...byHour.map((b) => b.count)) || 1;
  const peak = byHour.reduce((a, b) => (b.count > a.count ? b : a), byHour[0]);

  const htmlRows = byHour.map((b) => {
    const pct = Math.round((b.count / max) * 100);
    const label = b.hour.toString().padStart(2, "0") + ":00";
    const busy = b.hour >= 8 && b.hour <= 17;
    const barColor =
      b.count === peak.count ? "#7c3aed" : busy ? "#1d4ed8" : "#94a3b8";
    const bar = `<div style="display:flex;align-items:center;gap:8px">
      <div style="width:140px;background:#f1f5f9;border-radius:4px;height:10px;flex-shrink:0">
        <div style="width:${pct}%;background:${barColor};height:100%;border-radius:4px"></div>
      </div>
      <span style="font-size:11px;font-weight:700;color:${barColor}">${b.count}</span>
    </div>`;
    return [
      `<b style="color:${busy ? "#1d4ed8" : "#64748b"}">${label}</b>`,
      busy
        ? `<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">Business</span>`
        : `<span style="color:#94a3b8;font-size:10px">Off-hours</span>`,
      bar,
      `<span style="color:#059669">${b.completed}</span>`,
      `<span style="color:#dc2626">${b.failed}</span>`,
    ];
  });

  const excelRows = byHour.map((b) => [
    b.hour.toString().padStart(2, "0") + ":00",
    b.hour >= 8 && b.hour <= 17 ? "Business" : "Off-hours",
    b.count,
    b.completed,
    b.failed,
  ]);
  _reportExcelData = {
    title: "Time Analysis",
    headers: ["Hour (WIB)", "Session", "Transactions", "Completed", "Failed"],
    rows: excelRows,
  };

  const strip = reportStatStrip([
    ["Peak Hour", peak.hour.toString().padStart(2, "0") + ":00"],
    ["Peak Count", peak.count],
    ["Total Transactions", data.length],
    [
      "Business Hours Total",
      byHour
        .filter((b) => b.hour >= 8 && b.hour <= 17)
        .reduce((s, b) => s + b.count, 0),
    ],
  ]);
  const table = reportTable(
    ["Hour (WIB)", "Session", "Volume", "Completed", "Failed"],
    htmlRows,
    { storeForExport: false },
  );

  openReportModal(
    "📅",
    "Transaction Time Distribution",
    reportHeader(
      "Time Analysis Report",
      "Hourly transaction distribution (WIB, UTC+7)",
    ) +
      strip +
      table,
  );
}

// ─────────────────────────────────────────────────────
//  BOT ENGINE
// ─────────────────────────────────────────────────────

async function runBot() {
  while (true) {
    const delay = 5000 + Math.random() * 10000;
    await new Promise((r) => setTimeout(r, delay));
    await processBot();
  }
}

async function processBot() {
  const tx = await generateSmartTransactionUnique();

  const { data, error } = await sb
    .from("transactions")
    .insert(tx)
    .select()
    .single();

  if (error) return;

  console.log("BOT: create", data.transaction_id);

  await new Promise((r) => setTimeout(r, 3000 + Math.random() * 7000));

  if (!WORKERS.length) {
    console.log("BOT: workers disabled, leave pending");
    return;
  }

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

  await new Promise((r) => setTimeout(r, 3000 + Math.random() * 7000));

  lastTime += 10000 + Math.random() * 20000;

  await sb
    .from("transactions")
    .update({
      status: "Completed",
      completed_time: new Date(lastTime).toISOString(),
    })
    .eq("id", data.id);

  console.log("BOT: completed", data.transaction_id);
}

function refreshHistory() {
  loadHistory();
  showNotice("历史记录已刷新", "success");
}

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

  document.getElementById("stat-total-tx").textContent = total;
  document.getElementById("stat-pending-tx").textContent = pending;
  document.getElementById("stat-completed-tx").textContent = completed;
  document.getElementById("stat-failed-tx").textContent = failed;
}

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
        loadDashboardStats();

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

let _dashPoll;
function startDashboardPolling() {
  if (_dashPoll) clearInterval(_dashPoll);
  _dashPoll = setInterval(() => loadDashboardStats(), 5000);
}

function refreshTableOnly() {
  console.log("REFRESH DIKLIK");
  loadTransactions();
}

// ─────────────────────────────────────────────────────
//  BOT ENGINE CONTROLLER (GLOBAL SYNC)
// ─────────────────────────────────────────────────────
async function toggleBotEngine() {
  const btn = document.getElementById("bot-toggle-btn");

  if (!isBotRunning) {
    // START BOT
    const { data: existing } = await sb
      .from("banks")
      .select("account_number")
      .eq("account_number", "SYSTEM_BOT")
      .single();

    let error;
    if (existing) {
      const res = await sb
        .from("banks")
        .update({ name: "RUNNING: " + currentUser })
        .eq("account_number", "SYSTEM_BOT");
      error = res.error;
    } else {
      const res = await sb
        .from("banks")
        .insert({
          account_number: "SYSTEM_BOT",
          name: "RUNNING: " + currentUser,
        });
      error = res.error;
    }

    if (error) {
      showError("启动引擎失败：" + error.message);
      return;
    }

    isBotRunning = true;
    botHost = currentUser;
    showNotice("AI 引擎已启动！", "success");
    startBotAutomationLoop();
  } else {
    // STOP BOT — hanya botHost (starter) atau admin bisa stop
    if (botHost !== currentUser && currentUser !== "admin") {
      showError("只有 " + botHost + " 可以停止此引擎！");
      return;
    }

    await sb
      .from("banks")
      .update({ name: "OFFLINE" })
      .eq("account_number", "SYSTEM_BOT");
    isBotRunning = false;
    botHost = null;
    showNotice("AI 引擎已停止", "error");
  }
  syncBotUI();
}

function syncBotUI() {
  const statusText = document.getElementById("bot-status-text");
  const indicator = document.getElementById("bot-indicator");
  const btn = document.getElementById("bot-toggle-btn");

  if (isBotRunning) {
    statusText.innerText = `运行中（${botHost}）`;
    statusText.style.color = "#059669";
    indicator.style.background = "#059669";
    indicator.style.boxShadow = "0 0 8px #059669";
    btn.innerText = botHost === currentUser ? "停止引擎" : "引擎忙碌";
    btn.style.background = botHost === currentUser ? "#ef4444" : "#94a3b8";
    btn.disabled = botHost !== currentUser && currentUser !== "admin";
  } else {
    statusText.innerText = "离线";
    statusText.style.color = "#64748b";
    indicator.style.background = "#94a3b8";
    indicator.style.boxShadow = "none";
    btn.innerText = "启动引擎";
    btn.style.background = "#64748b";
    btn.disabled = false;
  }
}

setInterval(async () => {
  const { data } = await sb
    .from("banks")
    .select("*")
    .eq("account_number", "SYSTEM_BOT")
    .single();
  if (data) {
    const wasRunning = isBotRunning;
    isBotRunning = data.name.startsWith("RUNNING");
    botHost = isBotRunning ? data.name.split(": ")[1] : null;

    if (!wasRunning && isBotRunning && botHost === currentUser) {
      startBotAutomationLoop();
    }
  } else {
    isBotRunning = false;
    botHost = null;
  }
  syncBotUI();
}, 5000);

setInterval(systemAutoApproveTick, 5000);

let _botLoopStarted = false;
function startBotAutomationLoop() {
  if (_botLoopStarted) return;
  _botLoopStarted = true;

  async function loop() {
    // Bot hanya berjalan kalau status RUNNING di DB
    // Siapa saja admin yang login bisa maintain loop
    if (!isBotRunning) {
      console.log("🤖 Bot tidak running, stop loop");
      _botLoopStarted = false;
      return;
    }

    const cfg = getTrafficConfig();
    const delay =
      cfg.insertDelay[0] +
      Math.random() * (cfg.insertDelay[1] - cfg.insertDelay[0]);
    await new Promise((r) => setTimeout(r, delay));

    if (isBotRunning) {
      await autoInsertTransaction();
      await botProcessPendingTick();
      setTimeout(loop, delay);
    } else {
      console.log("🤖 Loop stopped. Bot status:", isBotRunning);
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
      <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin-bottom:10px">哎呀！检测到冲突</h2>
      <div style="font-size:14px;color:#64748b;line-height:1.6;padding:0 20px">${msg}</div>
      <button onclick="closeModal('modal-report')" style="margin-top:25px;background:#dc2626;color:white;border:none;padding:10px 30px;border-radius:6px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(220,38,38,0.2)">知道了</button>
    </div>
  `;

  const iconEl = document.getElementById("report-modal-icon");
  const titleEl = document.getElementById("report-modal-title");
  const bodyEl = document.getElementById("report-modal-body");

  if (iconEl) iconEl.textContent = "⚠️";
  if (titleEl) titleEl.textContent = "系统警报";
  if (bodyEl) bodyEl.innerHTML = html;

  openModal("modal-report");
}

function initPresence() {
  if (presenceChannel) sb.removeChannel(presenceChannel);

  presenceChannel = sb.channel("presence-admins", {
    config: { presence: { key: currentUser } },
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      updatePresenceUI(state);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          user: currentUser,
          online_at: new Date().toISOString(),
        });
      }
    });
}

function updatePresenceUI(state) {
  const listEl = document.getElementById("admin-presence-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const onlineUsers = Object.keys(state);
  const uniqueUsers = [...new Set(onlineUsers)];

  uniqueUsers.forEach((user) => {
    const displayName = user.split("@")[0];
    const div = document.createElement("div");
    div.style.cssText =
      "display:flex; align-items:center; gap:8px; font-size:11px; color:#166534; font-weight:600;";
    div.innerHTML = `
      <span style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></span>
      <span>${displayName}</span>
    `;
    listEl.appendChild(div);
  });

  if (uniqueUsers.length === 0) {
    listEl.innerHTML =
      '<div style="font-size:10px; color:#9ca3af;">No other admins online</div>';
  }
}

function toggleFilterPanel() {
  const panel = document.querySelector(".filter-panel");
  if (panel) {
    panel.classList.toggle("collapsed");
  }
}



