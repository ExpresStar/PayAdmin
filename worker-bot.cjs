// ============================================================
// worker-bot.cjs — Standalone WorkerBot for Termux/PM2
// Menggantikan WorkerBot di script.js (browser-based)
// Bisa jalan 24/7 tanpa browser / laptop
// ============================================================

"use strict";

const { createClient } = require("@supabase/supabase-js");

// ─────────────────────────────────────────────────────────────
//  KONFIGURASI SUPABASE
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdXF3ZnBuenlsb3NxZm1tdWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODY4ODYsImV4cCI6MjA4OTU2Mjg4Nn0.mOum9c_e5w9SqiKLzVb1ZihmtAaUtqMJOulyPLmbC-c";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────
//  WORKER ROSTER + SHIFT CONFIG
// ─────────────────────────────────────────────────────────────
let WORKERS = ["yaer98", "xiaoting99", "anan88"];

const WORKER_SHIFTS = {
  xiaoting99: { start: 8,  end: 16 }, // Shift pagi  08:00–16:00 WIB
  yaer98:     { start: 12, end: 20 }, // Shift siang 12:00–20:00 WIB
  anan88:     { start: 20, end: 4  }, // Shift malam 20:00–04:00 WIB
};

// ─────────────────────────────────────────────────────────────
//  HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

function getWIBHour() {
  // Konversi ke WIB (UTC+7) — penting karena server bisa di timezone lain
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  return wib.getHours();
}

function getLocalDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  const y = wib.getFullYear();
  const m = String(wib.getMonth() + 1).padStart(2, "0");
  const d = String(wib.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWorkerOnShift(botName) {
  const shift = WORKER_SHIFTS[botName];
  if (!shift) return true; // unknown bot → always on
  const h = getWIBHour();
  const { start, end } = shift;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end; // midnight wrap
}

function fmtAmount(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("vi-VN") + " VND";
}

function shortBank(name) {
  if (!name) return "—";
  const map = {
    Vietcombank: "VCB", Techcombank: "TCB", "MB Bank": "MB",
    ACB: "ACB", BIDV: "BIDV", VPBank: "VPB", VietinBank: "VTB",
    OCB: "OCB", MSB: "MSB", LPBank: "LPB", Sacombank: "SCB",
    SHB: "SHB", TPBank: "TPB",
  };
  return map[name] || name.slice(0, 4).toUpperCase();
}

// ─────────────────────────────────────────────────────────────
//  MISMATCH DETECTION (sama persis dengan script.js)
// ─────────────────────────────────────────────────────────────

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function normalizeNameForCompare(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const ALL_BANKS = [
  "Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV",
  "VPBank", "VietinBank", "OCB", "MSB", "LPBank", "Sacombank", "SHB", "TPBank",
];

function getProofFields(tx) {
  // Sama persis dengan getProofUrl + getProofFieldsFromTx di script.js
  // Menentukan proof fields secara deterministik dari transaction_id
  let pName = tx.account_name || "UNKNOWN";
  let pBank = tx.bank_name || "Vietcombank";
  let pAmount = tx.amount || 0;

  const h = Math.abs(hashString(tx.transaction_id || ""));

  // 1/250 chance error (sama persis dengan script.js)
  if (h % 250 === 0 || h % 250 === 1) {
    const errType = h % 3;

    if (errType === 0) {
      // Nama tidak sesuai
      pName = pName.split(" ")[0] + " " +
        ["Smith", "Wong", "Putra", "Aditya", "Nguyen"][h % 5];
    } else if (errType === 1) {
      // Nominal salah
      if (h % 2 === 0) {
        pAmount = pAmount + ((h % 5) + 1) * 25000;
      } else {
        pAmount = Math.floor(pAmount / 10);
      }
    } else {
      // Bank salah
      const banks = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "VPBank", "Sacombank"];
      pBank = banks[h % banks.length] !== pBank
        ? banks[h % banks.length]
        : banks[((h % banks.length) + 1) % banks.length];
    }
  }

  return { name: pName, bank: pBank, amount: pAmount };
}

function getTxMismatch(tx) {
  const proof = getProofFields(tx);

  const txAmount = Number(tx.amount || 0);
  const wrongNominal = Number(proof.amount || 0) !== txAmount;
  const wrongName = normalizeNameForCompare(proof.name) !== normalizeNameForCompare(tx.account_name || "");
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
    ].filter(Boolean).join(", "),
  };
}

// ─────────────────────────────────────────────────────────────
//  REJECT SEQUENCE — kirim ke Supabase messages (room: reject)
//  Telegram-bot.cjs akan forward ke Telegram secara otomatis
// ─────────────────────────────────────────────────────────────

let createCanvas;
try {
  const canvasMod = require("canvas");
  createCanvas = canvasMod.createCanvas;
} catch (err) {
  console.warn("[WorkerBot] Canvas module not found, screenshots will be disabled.");
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
  if (!createCanvas) return null;
  const W = 1100;
  const H = 160;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Outer background
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, W, H);

  // Table header row
  const HDR_H = 32;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, HDR_H);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HDR_H); ctx.lineTo(W, HDR_H);
  ctx.stroke();

  // Header labels
  const HDR_FONT = "bold 10px sans-serif";
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

  // Data row
  const ROW_Y  = HDR_H;
  const ROW_H  = H - HDR_H;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, ROW_Y, W, ROW_H);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 1); ctx.lineTo(W, H - 1);
  ctx.stroke();

  const midY = ROW_Y + ROW_H / 2;

  // Checkbox placeholder
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 4, midY - 6, 12, 12, 2);
  ctx.stroke();

  // TX ID
  const txId   = String(tx.transaction_id || "");
  const txIdA  = txId.slice(0, 16);
  const txIdB  = txId.slice(16);
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = mismatch.wrongNominal ? "#dc2626" : "#3b82f6";
  ctx.fillText(txIdA, COLS[0].x, midY - 5);
  ctx.font = "normal 9px monospace";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(txIdB, COLS[0].x, midY + 8);

  // Order ID
  const ordId  = String(tx.order_id || "");
  ctx.font = "normal 10px sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(ordId.slice(0, 14), COLS[1].x, midY - 3);
  if (ordId.length > 14) {
    ctx.font = "normal 9px sans-serif";
    ctx.fillText(ordId.slice(14), COLS[1].x, midY + 9);
  }

  // Acc Number
  ctx.font = "normal 11px monospace";
  ctx.fillStyle = "#374151";
  ctx.fillText(String(tx.account_number || ""), COLS[2].x, midY + 3);

  // Amount
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = mismatch.wrongNominal ? "#dc2626" : "#1d4ed8";
  const amtText = fmtAmount(tx.amount || 0);
  ctx.fillText(amtText, COLS[3].x, midY + 3);

  // Account Name
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = mismatch.wrongName ? "#dc2626" : "#6366f1";
  ctx.fillText(String(tx.account_name || ""), COLS[4].x, midY + 3);

  // Bank (badge)
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
  ctx.font = "bold 10px sans-serif";
  ctx.fillText(bankShortText, COLS[5].x + 7, midY + 3);

  // Status
  const statusText = String(tx.status || "Pending");
  ctx.font = "bold 10px sans-serif";
  const sw = ctx.measureText(statusText).width + 16;
  ctx.fillStyle = "#fffbeb";
  drawRoundedRect(ctx, COLS[6].x, midY - 9, sw, 17, 8);
  ctx.fill();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#b45309";
  ctx.fillText(statusText, COLS[6].x + 8, midY + 3);

  // Time
  function fmtDateShort(iso) {
    if (!iso) return "—";
    const safeIso = String(iso).endsWith('Z') ? iso : iso + 'Z';
    const d = new Date(safeIso);
    const ymd = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' });
    const hms = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false });
    return { ymd, hms };
  }
  const cr = fmtDateShort(tx.created_at);
  ctx.font = "normal 9px sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(cr.ymd, COLS[7].x, midY - 3);
  ctx.fillText(cr.hms, COLS[7].x, midY + 9);

  const pt = fmtDateShort(tx.process_time || tx.created_at);
  ctx.fillText(pt.ymd, COLS[8].x, midY - 3);
  ctx.fillText(pt.hms, COLS[8].x, midY + 9);

  // Highlight bar
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(0, ROW_Y, 3, ROW_H);

  return canvas;
}

async function uploadCanvasAsChatImage(canvas, fileName) {
  const buffer = canvas.toBuffer("image/png");
  const filePath = `chat_images/${fileName}`;

  const { error: uploadError } = await sb.storage
    .from("chat_images")
    .upload(filePath, buffer, { contentType: "image/png" });
  
  if (uploadError) throw uploadError;

  const { data } = sb.storage.from("chat_images").getPublicUrl(filePath);
  return data.publicUrl;
}

async function botSendRejectMessage(botName, tx, mismatch) {
  const statusMap = {
    Pending: "待处理", Processing: "处理中",
    Completed: "已完成", Failed: "已拒绝", Expired: "已过期",
  };
  const txStatus = statusMap[tx.status] || "待处理";

  const msgText =
    `╭────────────────────────╮\n` +
    `         933PAY\n` +
    `╰────────────────────────╯\n\n` +
    `【存款订单】\n\n` +
    `订单号 │ ${tx.transaction_id || tx.id}\n` +
    `金额   │ ${fmtAmount(tx.amount || 0)} VND\n\n` +
    `银行   │ ${shortBank(tx.bank_name || "")}\n` +
    `姓名   │ ${tx.account_name || ""}\n` +
    `账号   │ ${tx.account_number || ""}\n\n` +
    `状态   │ ${txStatus}\n\n` +
    `────────────────────────\n\n` +
    `.bank   .name   .bil`;

  const captionHtml = `<pre>${msgText}</pre>`;

  await sleep(700 + Math.random() * 900);

  try {
    const canvas = renderRejectScreenshotCanvas(tx, mismatch, botName);
    const fileName = `reject-bot-${tx.id}-${Date.now()}.png`;
    const imageUrl = await uploadCanvasAsChatImage(canvas, fileName);

    await sb.from("messages").insert([{
      room: "reject",
      username: botName,
      type: "image",
      message: `${imageUrl}|--CAPTION--|${captionHtml}`,
    }]);

    console.log(`  [Reject] Sent reject screenshot to chat for TX ${tx.transaction_id}`);
  } catch (err) {
    console.error(`  [Reject] Failed to send screenshot: ${err.message}, sending text fallback`);
    await sb.from("messages").insert([{
      room: "reject",
      username: botName,
      type: "bot",
      message: captionHtml,
    }]);
  }
}

// ─────────────────────────────────────────────────────────────
//  WORKER BOT ONE TICK — proses satu transaksi
// ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function workerBotOneTick(botName) {
  // Guard: hanya bekerja kalau shift sedang aktif
  if (!isWorkerOnShift(botName)) {
    const shift = WORKER_SHIFTS[botName];
    // Silent log saat off-shift (jangan spam)
    return { backlog: 0, processed: false };
  }

  try {
    // 1. Ambil transaksi Pending TERTUA yang belum diklaim
    const todayStr = getLocalDate();
    const startOfToday = new Date(todayStr + "T00:00:00").toISOString();

    const { data: pendingList, error } = await sb
      .from("transactions")
      .select("id,transaction_id,order_id,account_number,account_name,bank_name,amount,created_at,process_time,status")
      .eq("status", "Pending")
      .is("assigned_to", null)
      .gte("created_at", startOfToday)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error(`[WorkerBot][${botName}] fetch error:`, error.message);
      return { backlog: 0, processed: false };
    }
    if (!pendingList || pendingList.length === 0) return { backlog: 0, processed: false };

    // Filter: hanya transaksi yang process_time sudah terlewat
    const nowMs = Date.now();
    const validList = pendingList.filter(tx => {
      if (!tx.process_time) return true;
      const ptStr = tx.process_time.endsWith("Z") ? tx.process_time : tx.process_time + "Z";
      const pt = new Date(ptStr);
      return nowMs >= pt.getTime();
    });

    if (validList.length === 0) {
      return { backlog: 0, processed: false };
    }

    // Pilih random dari top 5 yang sudah matang
    const topValid = validList.slice(0, 5);
    const tx = topValid[Math.floor(Math.random() * topValid.length)];

    // 2. Simulasi waktu reaksi manusia
    let reactionDelayMs = 2000 + Math.random() * 3000;
    let checkDelayMs = 4000 + Math.random() * 5000;

    // Jika banyak antrean, bot lebih cepat tapi kadang "ngalah"
    if (validList.length >= 3) {
      if (Math.random() < 0.4) {
        console.log(`[WorkerBot][${botName}] Antrean panjang, ngalah dulu...`);
        return { backlog: validList.length, processed: false };
      }
      reactionDelayMs = 800 + Math.random() * 1200;
      checkDelayMs = 1200 + Math.random() * 1500;
      console.log(`[WorkerBot][${botName}] Mode cepat (Backlog: ${validList.length})`);
    }

    await sleep(reactionDelayMs);

    const nowIso = new Date().toISOString();

    // 3. Optimistic claim
    const { data: claimed, error: claimErr } = await sb
      .from("transactions")
      .update({ assigned_to: botName, process_time: nowIso })
      .eq("id", tx.id)
      .eq("status", "Pending")
      .is("assigned_to", null)
      .select("id");

    if (claimErr || !claimed || claimed.length === 0) {
      console.log(`[WorkerBot][${botName}] TX ${tx.transaction_id} sudah diklaim orang lain`);
      return { backlog: validList.length, processed: false };
    }

    console.log(`[WorkerBot][${botName}] ✓ Claimed ${tx.transaction_id}`);

    // 4. Simulasi waktu cek struk
    await sleep(checkDelayMs);

    // 5. Cek mismatch
    const mismatch = getTxMismatch(tx);
    const isReject = mismatch.anyWrong;

    if (isReject) {
      // ─ REJECT
      console.log(`[WorkerBot][${botName}] ✗ Mismatch ${tx.transaction_id}: ${mismatch.note}`);

      await sb.from("transactions")
        .update({ status: "Failed", completed_time: nowIso })
        .eq("id", tx.id);

      await sb.from("transaction_logs").insert({
        transaction_id: tx.id,
        action: "Rejected",
        note: `Reject by bot ${botName}: ${mismatch.note || "Data mismatch"}`,
        actor: botName,
      });

      // Kirim pesan reject ke chat (telegram-bot.cjs akan forward)
      await botSendRejectMessage(botName, tx, mismatch);

    } else {
      // ─ APPROVE
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

    return { backlog: validList.length, processed: true };

  } catch (err) {
    console.error(`[WorkerBot][${botName}] Error:`, err.message);
    return { backlog: 0, processed: false };
  }
}

// ─────────────────────────────────────────────────────────────
//  WORKER BOT LOOP — infinite loop per bot
// ─────────────────────────────────────────────────────────────

async function workerBotLoop(botName) {
  console.log(`[WorkerBot][${botName}] Loop started`);

  while (true) {
    const result = await workerBotOneTick(botName);
    const onShift = isWorkerOnShift(botName);

    let idleMs;

    if (!onShift) {
      // Off-shift: cek setiap 90-150 detik
      idleMs = 90000 + Math.random() * 60000;
    } else {
      const backlog = result?.backlog || 0;

      if (backlog >= 3) {
        // Banyak antrean: 0.5-1.5 detik
        idleMs = 500 + Math.random() * 1000;
      } else if (backlog > 0) {
        // Antrean sedang: 2-5 detik
        idleMs = 2000 + Math.random() * 3000;
      } else {
        // Kosong: 8-15 detik
        idleMs = 8000 + Math.random() * 7000;
      }
    }

    await sleep(idleMs);
  }
}

// ─────────────────────────────────────────────────────────────
//  CLEANUP STUCK CLAIMS — bersihkan klaim yang terlalu lama
// ─────────────────────────────────────────────────────────────

async function cleanupStuckClaims() {
  try {
    const cutoff = new Date(Date.now() - 15000).toISOString();
    await sb
      .from("transactions")
      .update({ assigned_to: null, process_time: null })
      .eq("status", "Pending")
      .neq("assigned_to", null)
      .neq("process_time", null)
      .lt("process_time", cutoff);
  } catch (err) {
    // silent
  }
}

// ─────────────────────────────────────────────────────────────
//  DYNAMIC WORKER ROSTER — load dari DB setiap 60 detik
// ─────────────────────────────────────────────────────────────

async function loadWorkerRoster() {
  try {
    const { data, error } = await sb
      .from("workers")
      .select("username, shift")
      .eq("active", true);

    if (error || !data || data.length === 0) return;

    const newWorkers = data.map(w => w.username);

    // Update shift mapping
    for (const w of data) {
      if (!WORKER_SHIFTS[w.username]) {
        // Default shift mapping berdasarkan DB field
        const shiftMap = {
          pagi:  { start: 8,  end: 16 },
          siang: { start: 8,  end: 16 }, // siang treated as pagi
          malam: { start: 20, end: 4  },
        };
        WORKER_SHIFTS[w.username] = shiftMap[w.shift] || { start: 8, end: 20 };
      }
    }

    // Detect new workers
    const added = newWorkers.filter(n => !WORKERS.includes(n));
    if (added.length > 0) {
      console.log(`[Roster] New workers detected: ${added.join(", ")}`);
      // Start loops for new workers
      added.forEach((botName, idx) => {
        const staggerMs = idx * (2000 + Math.random() * 4000);
        setTimeout(() => workerBotLoop(botName), staggerMs);
      });
    }

    WORKERS = newWorkers;
  } catch (err) {
    console.error("[Roster] Error:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN — startup
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  WorkerBot Standalone — 933PAY");
  console.log("  Jalan di Termux/PM2 tanpa browser");
  console.log("═══════════════════════════════════════════");

  // Load roster dari DB dulu
  await loadWorkerRoster();

  console.log(`[WorkerBot] Starting ${WORKERS.length} bots:`);
  console.log(WORKERS.map(n =>
    `  ${n} (${WORKER_SHIFTS[n]?.start}:00–${WORKER_SHIFTS[n]?.end}:00)`
  ).join("\n"));

  // Start semua worker bot loops (staggered)
  WORKERS.forEach((botName, idx) => {
    const staggerMs = idx * (2000 + Math.random() * 4000);
    setTimeout(() => workerBotLoop(botName), staggerMs);
  });

  // Cleanup stuck claims setiap 10 detik
  setInterval(cleanupStuckClaims, 10000);

  // Refresh roster dari DB setiap 60 detik
  setInterval(loadWorkerRoster, 60000);

  console.log("[WorkerBot] All bots started! Running 24/7...");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
