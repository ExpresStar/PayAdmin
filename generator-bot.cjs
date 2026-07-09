// ============================================================
// generator-bot.cjs — Standalone Transaction Generator for Termux/PM2
// Menggantikan startBotAutomationLoop() di script.js (browser-based)
// Bisa jalan 24/7 tanpa browser / laptop
// ============================================================

"use strict";

const { createClient } = require("@supabase/supabase-js");
const { randomUUID, randomBytes } = require("crypto");

// ─────────────────────────────────────────────────────────────
//  KONFIGURASI SUPABASE
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdXF3ZnBuenlsb3NxZm1tdWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODY4ODYsImV4cCI6MjA4OTU2Mjg4Nn0.mOum9c_e5w9SqiKLzVb1ZihmtAaUtqMJOulyPLmbC-c";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────
//  TRAFFIC CONFIG — 7-zone WIB schedule (sama dengan script.js)
// ─────────────────────────────────────────────────────────────

function getWIBHour() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  return wib.getHours();
}

function getTrafficConfig() {
  const h = getWIBHour();

  // Ramai: 08-12, 13-18, 20-05
  const isRamai =
    (h >= 8 && h < 12) ||
    (h >= 13 && h < 18) ||
    (h >= 20 || h < 5);

  if (isRamai) {
    return {
      insertDelay: [1200, 2400], // 1.2s - 2.4s antar transaksi baru
      processDelay: [4000, 9000],
    };
  } else {
    return {
      insertDelay: [4500, 8000], // 4.5s - 8s antar transaksi baru
      processDelay: [10000, 18000],
    };
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

function randomUUIDLike() {
  try {
    return randomUUID();
  } catch (_) {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return Math.floor(v).toString(16);
  }) + "-" + Date.now().toString(36);
}

function randomDigits(len) {
  const out = [];
  try {
    const arr = randomBytes(len);
    for (let i = 0; i < arr.length; i++) out.push(String(arr[i] % 10));
    return out.join("");
  } catch (_) {}
  for (let i = 0; i < len; i++) out.push(String(Math.floor(Math.random() * 10)));
  return out.join("");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────
//  UNIQUENESS CHECK
// ─────────────────────────────────────────────────────────────

async function txValueExists(field, value) {
  const { data, error } = await sb
    .from("transactions")
    .select("id")
    .eq(field, value)
    .limit(1);
  if (error) return false;
  return !!(data && data.length);
}

// ─────────────────────────────────────────────────────────────
//  TRANSACTION GENERATOR (sama persis dengan script.js)
// ─────────────────────────────────────────────────────────────

let lastTime = Date.now();
let lastProcessTime = Date.now();

function generateSmartTransaction(pendingCount) {
  pendingCount = pendingCount || 0;

  const firstNames = [
    "Nguyen", "Tran", "Le", "Pham", "Hoang", "Phan", "Vu", "Dang",
    "Bui", "Do", "Dao", "Huynh", "Ngo", "Vo", "Mai", "Ly",
    "Truong", "Dinh", "Ta", "Kieu", "Trinh", "Giau",
  ];

  const middleNames = [
    "Van", "Thi", "Duc", "Minh", "Huu", "Ngoc", "Anh", "Bao",
    "Binh", "Chau", "Duy", "Gia", "Giang", "Hai", "Ha", "Hanh",
    "Hien", "Khanh", "Khoa", "Lam", "Linh", "Long", "Loi", "Manh",
    "Man", "Nam", "Nhat", "Ngoc", "Phuc", "Phuong", "Quang", "Quyen",
    "Quynh", "San", "Son", "Thao", "Thang", "Thien", "Thinh", "Tien",
    "Tuan", "Tuyen", "Uyen", "Vy", "Xuan", "Yen",
  ];

  const lastNames = [
    "Anh", "Binh", "Chau", "Dung", "Giang", "Hanh", "Khanh", "Linh",
    "Nam", "Phong", "Phuc", "Quang", "Quyen", "Quynh", "Son", "Tam",
    "Thao", "Tien", "Tuan", "Tuyen", "Uyen", "Vy", "Xuan", "Yen",
    "Bao", "Cong", "Duy", "Duc", "Hai", "Hieu", "Hiep", "Hien",
    "Hoa", "Huong", "Hung", "Khoa", "Khang", "Khanh", "Khanh", "Lam",
    "Long", "Manh", "Minh", "My", "Ngoc", "Nhan", "Nguyen", "Oanh",
    "Phuong", "Phuong", "Quoc", "Quoc", "San", "Thinh", "Thinh",
    "Thu", "Trang", "Trieu",
  ];

  const banks = [
    "Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV",
    "VPBank", "VietinBank", "OCB", "MSB", "LPBank",
    "Sacombank", "SHB", "TPBank", "Eximbank",
  ];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const name = pick(firstNames) + " " + pick(middleNames) + " " + pick(lastNames);
  const bank = pick(banks);
  const accNum = "0" + randomDigits(9);
  const amount = (Math.floor(Math.random() * 50) + 1) * 50000;

  const nowReal = Date.now();
  if (lastTime < nowReal) lastTime = nowReal;

  const cfg = getTrafficConfig();
  const insertDelay = cfg.insertDelay[0] + Math.random() * (cfg.insertDelay[1] - cfg.insertDelay[0]);
  lastTime += insertDelay;
  const created = new Date(lastTime);

  let processDelay = cfg.processDelay[0] + Math.random() * (cfg.processDelay[1] - cfg.processDelay[0]);

  // Jarak process_time berdasarkan jumlah nota pending
  if (pendingCount < 50) {
    processDelay += 60000 + Math.random() * 240000; // 1-5 menit
  } else if (pendingCount < 90) {
    processDelay += 60000 + Math.random() * 120000; // 1-3 menit
  } else if (pendingCount < 100) {
    processDelay += 20000 + Math.random() * 30000;  // 20-50 detik
  } else {
    processDelay += Math.random() * 5000;            // banjir: sangat cepat
  }

  let targetProcess = lastTime + processDelay;

  if (lastProcessTime < lastTime) {
    lastProcessTime = lastTime;
  }

  // Ensure process_time strictly sequential
  if (targetProcess <= lastProcessTime) {
    targetProcess = lastProcessTime + 1000 + (Math.random() * 3000);
  }

  lastProcessTime = targetProcess;
  const processTime = new Date(targetProcess);

  return {
    transaction_id: "TX" + randomUUIDLike().replace(/-/g, "").slice(0, 16).toUpperCase(),
    order_id: "ORD" + randomDigits(8),
    account_number: accNum,
    account_name: name,
    bank_name: bank,
    amount: amount,
    status: "Pending",
    created_at: created.toISOString(),
    process_time: processTime.toISOString(),
  };
}

async function generateSmartTransactionUnique(pendingCount = 0, maxTries = 25) {
  for (let i = 0; i < maxTries; i++) {
    const tx = generateSmartTransaction(pendingCount);
    tx.account_name = (tx.account_name || "").replace(/\s+/g, " ").trim();

    const [idExists, numExists, nameExists] = await Promise.all([
      txValueExists("transaction_id", tx.transaction_id),
      txValueExists("account_number", tx.account_number),
      txValueExists("account_name", tx.account_name),
    ]);

    if (!idExists && !numExists && !nameExists) return tx;
  }

  // Fallback: force unique
  const tx = generateSmartTransaction(pendingCount);
  const safeSuffix = randomDigits(4);
  tx.account_name = `${(tx.account_name || "Client").replace(/\s+/g, " ").trim()} ${safeSuffix}`;
  tx.transaction_id = "TX" + randomUUIDLike().replace(/-/g, "").slice(0, 16).toUpperCase();
  tx.account_number = "0" + randomDigits(9);
  return tx;
}

// ─────────────────────────────────────────────────────────────
//  AUTO INSERT — masukkan transaksi baru ke DB
// ─────────────────────────────────────────────────────────────

async function autoInsertTransaction() {
  const { count, error: countErr } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("status", "Pending");

  const pendingCount = countErr ? 0 : (count || 0);

  const tx = await generateSmartTransactionUnique(pendingCount);

  const { error } = await sb.from("transactions").insert(tx);

  if (error) {
    console.error("❌ INSERT ERROR:", error.message);
  } else {
    console.log(`✅ TX ${tx.transaction_id} | ${tx.account_name} | ${tx.bank_name} | ${tx.amount}`);
  }
}

// ─────────────────────────────────────────────────────────────
//  BOT STATUS — sync dengan DB (banks table SYSTEM_BOT row)
// ─────────────────────────────────────────────────────────────

let isBotRunning = true; // default: jalan terus

async function checkBotStatus() {
  try {
    const { data, error } = await sb
      .from("banks")
      .select("name")
      .ilike("name", "RUNNING:%")
      .limit(1);

    if (error) return;

    // Kalau ada row "RUNNING:xxx" berarti bot sedang jalan di browser
    // Generator di Termux tetap jalan (parallel)
    // Kalau row "OFFLINE", berarti tidak ada browser yang nyala — kita yang ambil alih

    if (data && data.length > 0) {
      // Ada browser yang nyala — kita tetap jalan tapi lebih lambat
      // agar tidak double-insert terlalu banyak
      isBotRunning = true;
    } else {
      isBotRunning = true;
    }
  } catch (err) {
    // silent
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Generator Bot — 933PAY");
  console.log("  Jalan di Termux/PM2 tanpa browser");
  console.log("═══════════════════════════════════════════");

  let loopCount = 0;

  while (true) {
    if (!isBotRunning) {
      await sleep(10000);
      await checkBotStatus();
      continue;
    }

    loopCount++;
    const cfg = getTrafficConfig();
    const delay = cfg.insertDelay[0] + Math.random() * (cfg.insertDelay[1] - cfg.insertDelay[0]);

    try {
      await autoInsertTransaction();
    } catch (err) {
      console.error("❌ Loop error (lanjut):", err.message);
    }

    // Check bot status dari DB setiap 100 loop
    if (loopCount % 100 === 0) {
      await checkBotStatus();
    }

    await sleep(delay);
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
