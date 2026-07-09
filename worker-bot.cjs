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
let WORKERS = ["yaer98", "xiaoting99", "bama98", "anan88", "xiaoyan", "xiaoxan"];

const WORKER_SHIFTS = {};

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

let PImage;
let fnt;
try {
  PImage = require("pureimage");
  fnt = PImage.registerFont("simsunb.ttf", "sans-serif");
  fnt.loadSync();
} catch (err) {
  console.warn("[WorkerBot] PureImage module or font not found, screenshots disabled.");
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  // PureImage doesn't support arcTo perfectly, so we just draw a normal rect
  ctx.fillRect(x, y, w, h);
}

function renderRejectScreenshotCanvas(tx, mismatch, botName) {
  if (!PImage || !fnt) return null;
  const W = 1100;
  const H = 160;
  const canvas = PImage.make(W, H);
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
  const stream = require("stream");
  const pass = new stream.PassThrough();
  const chunks = [];
  pass.on("data", chunk => chunks.push(chunk));
  
  await PImage.encodePNGToStream(canvas, pass);
  const buffer = Buffer.concat(chunks);
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

  let bottomErrors = [];
  if (mismatch.wrongNominal) bottomErrors.push(".bil");
  else if (mismatch.wrongBank) bottomErrors.push(".bank");
  else if (mismatch.wrongName) bottomErrors.push(".name");
  const bottomText = bottomErrors[0] || ".unknown";

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
    `${bottomText}`;

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

const shiftCounters = {}; // { botName: 15 }

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function workerBotOneTick(botName) {
  // Guard: hanya bekerja kalau shift sedang aktif
  if (!isWorkerOnShift(botName)) {
    return { backlog: 0, processed: false };
  }

  // Cek apakah bot ini terlalu "rakus" dibanding temannya
  const myCount = shiftCounters[botName] || 0;
  const activePeers = WORKERS.filter(w => isWorkerOnShift(w));
  const minPeerCount = activePeers.length > 0 
      ? Math.min(...activePeers.map(w => shiftCounters[w] || 0)) 
      : myCount;
  const isRakus = (myCount > minPeerCount + 2); // lebih banyak 3 nota dari yg paling sedikit

  try {
    // 1. Ambil transaksi Pending dari DUA HARI (kemarin & hari ini)
    //    SEMUA bot aktif: prioritas nota kemarin dulu (habiskan backlog), baru hari ini
    const todayStr = getLocalDate();
    const startOfToday = new Date(todayStr + "T00:00:00").toISOString();

    // Hitung startOfYesterday: mundur 1 hari (WIB-aware)
    const wibNow = new Date(Date.now() + 7 * 3600000);
    const yesterdayWib = new Date(wibNow);
    yesterdayWib.setUTCDate(yesterdayWib.getUTCDate() - 1);
    const yy = yesterdayWib.getUTCFullYear();
    const ym = String(yesterdayWib.getUTCMonth() + 1).padStart(2, "0");
    const yd = String(yesterdayWib.getUTCDate()).padStart(2, "0");
    const startOfYesterday = new Date(`${yy}-${ym}-${yd}T00:00:00`).toISOString();

    // Fetch semua pending 2 hari terakhir (limit 50 agar backlog besar tertangkap)
    const { data: pendingList, error } = await sb
      .from("transactions")
      .select("id,transaction_id,order_id,account_number,account_name,bank_name,amount,created_at,process_time,status")
      .eq("status", "Pending")
      .is("assigned_to", null)
      .gte("created_at", startOfYesterday)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error(`[WorkerBot][${botName}] fetch error:`, error.message);
      return { backlog: 0, processed: false };
    }
    if (!pendingList || pendingList.length === 0) return { backlog: 0, processed: false };

    // Pisahkan menjadi dua bucket: kemarin vs hari ini
    const bucketOld   = pendingList.filter(tx => tx.created_at < startOfToday);
    const bucketToday = pendingList.filter(tx => tx.created_at >= startOfToday);

    // SEMUA bot: coba kemarin dulu, kalau sudah habis baru hari ini
    const buckets = [bucketOld, bucketToday];

    const nowMs = Date.now();

    // Filter process_time sudah terlewat — coba bucket kemarin dulu, fallback ke hari ini
    let validList = [];
    for (const bucket of buckets) {
      const filtered = bucket.filter(tx => {
        if (!tx.process_time) return true;
        const ptStr = tx.process_time.endsWith("Z") ? tx.process_time : tx.process_time + "Z";
        return nowMs >= new Date(ptStr).getTime();
      });
      if (filtered.length > 0) { validList = filtered; break; }
    }

    if (validList.length === 0) {
      return { backlog: pendingList.length, processed: false };
    }

    const bucketLabel = (validList[0].created_at < startOfToday) ? "kemarin" : "hari ini";
    console.log(`[WorkerBot][${botName}] Bucket: ${bucketLabel} | Valid: ${validList.length}/${pendingList.length}`);

    // Pilih random dari top 5 yang sudah matang di bucket terpilih
    const topValid = validList.slice(0, 5);
    const tx = topValid[Math.floor(Math.random() * topValid.length)];

    // 2. Simulasi waktu reaksi manusia & Logika Rakus / Ngalah
    let reactionDelayMs = 2000 + Math.random() * 3000;
    let checkDelayMs = 4000 + Math.random() * 5000;
    let isNgalah = false;

    if (isRakus) {
      // Jika rakus, beri teman kesempatan
      if (validList.length < 15) {
        // Sepi/sedang: 60% chance ngalah total (skip)
        if (Math.random() < 0.6) isNgalah = true;
        // Walau ga ngalah, kerjanya sengaja dilambatin
        reactionDelayMs = 3000 + Math.random() * 3000;
        checkDelayMs = 5000 + Math.random() * 3000;
      } else {
        // Banjir: ga ngalah total, tapi ambilnya pelan-pelan
        reactionDelayMs = 2000 + Math.random() * 1000;
        checkDelayMs = 2000 + Math.random() * 2000;
      }
    } else {
      // Tidak rakus
      if (validList.length >= 15) {
        // Antrean banjir: Mode super cepat (ngebut)
        if (Math.random() < 0.1) isNgalah = true; // cuma 10% chance ngalah
        reactionDelayMs = 400 + Math.random() * 800; // ngebut
        checkDelayMs = 600 + Math.random() * 900;
      }
    }

    if (isNgalah) {
      console.log(`[WorkerBot][${botName}] Antrean ${validList.length}, Skor: ${myCount}. Ngalah dulu buat temen...`);
      return { backlog: validList.length, processed: false, isRakus };
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

    // Tambah counter karena bot ini baru saja mengerjakan nota
    shiftCounters[botName] = (shiftCounters[botName] || 0) + 1;

    return { backlog: validList.length, processed: true, isRakus };

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
    const onShift = isWorkerOnShift(botName);

    if (!onShift) {
      // Off-shift: jangan memproses nota sama sekali, tidur 60 detik sebelum cek shift lagi
      await new Promise(r => setTimeout(r, 60000));
      continue;
    }

    // Check break status
    const onBreak = await handleBotBreakTick(botName);
    if (onBreak) {
      // Sedang istirahat: tidur 15 detik sebelum tick berikutnya
      await new Promise(r => setTimeout(r, 15000));
      continue;
    }

    const result = await workerBotOneTick(botName);
    let idleMs;

    const backlog = result?.backlog || 0;
    const wasRakus = result?.isRakus || false;

    if (wasRakus) {
      // Habis ngalah/rakus: tidur panjang biar teman yg ambil
      idleMs = 4000 + Math.random() * 4000;
    } else if (backlog >= 15) {
      // Banyak antrean (>= 15): sangat cepat lanjut
      idleMs = 200 + Math.random() * 400;
    } else if (backlog > 3) {
      // Antrean sedang (> 3): lumayan cepat
      idleMs = 1000 + Math.random() * 1500;
    } else if (backlog > 0) {
      // Antrean sedikit (1-3): normal
      idleMs = 2000 + Math.random() * 3000;
    } else {
      // Kosong: santai
      idleMs = 15000 + Math.random() * 5000;
    }

    await new Promise(r => setTimeout(r, idleMs));
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
      .select("user_id, shift")
      .eq("status", "active");

    if (error || !data || data.length === 0) return;

    const newWorkers = data.map(w => w.user_id);

    // Update shift mapping
    for (const w of data) {
      const sLower = String(w.shift || "").toLowerCase();
      let start = 8, end = 20;
      if (sLower.includes("malam")) {
        start = 20;
        end = 8;
      }
      WORKER_SHIFTS[w.user_id] = { start, end };
    }
    
    // Assign default shifts for any hardcoded workers not in DB
    WORKERS.forEach(bot => {
      if (!WORKER_SHIFTS[bot]) {
        WORKER_SHIFTS[bot] = { start: 8, end: 20 };
      }
    });

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
//  ATTENDANCE CRON (Absensi Bot)
// ─────────────────────────────────────────────────────────────

const absensiState = { lastMasuk: {}, lastPulang: {} };

const botBreakStates = {};

function getActiveBreaksCount() {
  let count = 0;
  for (const botName in botBreakStates) {
    if (botBreakStates[botName].status !== null && isWorkerOnShift(botName)) {
      count++;
    }
  }
  return count;
}

async function sendTelegramAbsensiMessage(botName, text, type = "action") {
  try {
    await sb.from("messages").insert([{
      room: "absensi",
      username: botName,
      type: type,
      message: type === "action" ? `<i>${text}</i>` : text
    }]);
  } catch (err) {
    console.error(`[WorkerBot][${botName}] Error sending absensi message:`, err.message);
  }
}

async function handleBotBreakTick(botName) {
  const sInfo = WORKER_SHIFTS[botName];
  const isPagi = sInfo ? sInfo.start === 8 : true;
  const shiftKey = `${getLocalDate()}_${isPagi ? "pagi" : "malam"}`;

  // Initialize break state if empty or new shift
  if (!botBreakStates[botName] || botBreakStates[botName].shiftKey !== shiftKey) {
    botBreakStates[botName] = {
      shiftKey,
      status: null,
      returnTime: 0,
      lastBreakTime: 0,
      checklist: {
        wc: Math.floor(1 + Math.random() * 2), // 1 atau 2 WC breaks per shift
        makan: 1 // 1 Meal break per shift
      },
      // Break check pertama 45-90 menit dari awal shift/startup
      nextScheduledCheck: Date.now() + (45 + Math.random() * 45) * 60 * 1000
    };
  }

  const state = botBreakStates[botName];
  const now = Date.now();

  // Scenario 1: Sedang break
  if (state.status !== null) {
    if (now >= state.returnTime) {
      const oldStatus = state.status;
      state.status = null;
      state.lastBreakTime = now;
      
      const returnLabel = oldStatus === "wc" ? "Kembali dari WC" : "Kembali, lanjut kerja";
      console.log(`[WorkerBot][${botName}] Return to work from ${oldStatus}`);
      
      await sendTelegramAbsensiMessage(botName, returnLabel, "action");
      
      // Jadwalkan break berikutnya 1.5 - 2.5 jam lagi
      state.nextScheduledCheck = now + (90 + Math.random() * 60) * 60 * 1000;
    }
    return true; // Skip kerjaan
  }

  // Scenario 2: Sedang kerja, cek apakah sudah waktunya break
  if (now >= state.nextScheduledCheck) {
    let chosenType = null;
    if (state.checklist.makan > 0) {
      chosenType = "makan";
    } else if (state.checklist.wc > 0) {
      chosenType = "wc";
    }

    if (chosenType !== null) {
      const activeBreaks = getActiveBreaksCount();
      // Aturan pembatasan: Maksimal 2 bot yang boleh break bersamaan per shift
      if (activeBreaks < 2) {
        state.status = chosenType;
        const durationMs = chosenType === "wc" ? 15 * 60 * 1000 : 30 * 60 * 1000;
        state.returnTime = now + durationMs;
        state.checklist[chosenType]--;

        const startLabel = chosenType === "wc" ? "Ke WC dulu (15 menit)" : "Istirahat Makan (30 menit)";
        console.log(`[WorkerBot][${botName}] Starting break: ${chosenType}`);

        await sendTelegramAbsensiMessage(botName, startLabel, "action");
        return true; // Skip kerjaan
      } else {
        // Batas maksimum tercapai, tunda pengecekan bot ini selama 5 menit
        console.log(`[WorkerBot][${botName}] Ingin break (${chosenType}) tapi sudah ada 2 bot yang break. Menunggu standby...`);
        state.nextScheduledCheck = now + 5 * 60 * 1000;
      }
    }
  }

  return false;
}

async function getShiftNoteCount(botName, startIso, endIso) {
  try {
    const { count, error } = await sb
      .from("transaction_logs")
      .select("*", { count: "exact", head: true })
      .eq("actor", botName)
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.error(`[WorkerBot] Error counting notes for ${botName}:`, err.message);
    return 0;
  }
}

async function sendAbsensi(botName, shiftName, type, count = 0) {
  const title = type === "masuk" ? "【考勤：上班】 (Absen Masuk)" : "【考勤：下班】 (Absen Pulang)";
  const timeStr = getCurrentWIB();
  
  let msgText = 
    `╔════════════════════════╗\n` +
    `         933PAY\n` +
    `╚════════════════════════╝\n\n` +
    `${title}\n\n` +
    `姓名   │ ${botName}\n` +
    `班次   │ ${shiftName}\n` +
    `时间   │ ${timeStr} WIB\n\n`;

  if (type === "pulang") {
    msgText += `════════════════════════\n\nTerima Kasih!`;
  } else {
    msgText += `════════════════════════\n\nSelamat Bekerja!`;
  }

  const html = `<pre>${msgText}</pre>`;

  await sb.from("messages").insert([{
    room: "absensi",
    username: botName,
    type: "bot",
    message: html
  }]);

  // Jika Pulang, kirim pesan TERPISAH ke grup Laporan Nota (report)
  if (type === "pulang") {
    let reportText = 
      `╔════════════════════════╗\n` +
      `         933PAY\n` +
      `╚════════════════════════╝\n\n` +
      `【工作日报】 (Laporan Harian)\n\n` +
      `姓名   │ ${botName}\n` +
      `班次   │ ${shiftName}\n` +
      `时间   │ ${timeStr} WIB\n\n` +
      `单数   │ ${count} (Total Nota)\n\n` +
      `════════════════════════\n\nKerja Bagus!`;

    await sb.from("messages").insert([{
      room: "report",
      username: botName,
      type: "bot",
      message: `<pre>${reportText}</pre>`
    }]);
  }
}

function getCurrentWIB() {
  const now = new Date();
  const wibTimeMs = now.getTime() + (7 * 60 * 60 * 1000);
  const wibDate = new Date(wibTimeMs);
  const hh = String(wibDate.getUTCHours()).padStart(2, "0");
  const mm = String(wibDate.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function doPulang(botName, shiftName) {
  const nowMs = Date.now();
  // Ambil rentang 12.5 jam ke belakang untuk mencakup seluruh shift
  const startIso = new Date(nowMs - (12.5 * 60 * 60 * 1000)).toISOString();
  const endIso = new Date(nowMs + (30 * 60 * 1000)).toISOString();
  
  const count = await getShiftNoteCount(botName, startIso, endIso);
  await sendAbsensi(botName, shiftName, "pulang", count);
}

function checkAttendanceCron() {
  const now = new Date();
  const wibTimeMs = now.getTime() + (7 * 60 * 60 * 1000);
  const wibDate = new Date(wibTimeMs);
  
  const h = wibDate.getUTCHours();
  const m = wibDate.getUTCMinutes();
  
  const yyyy = wibDate.getUTCFullYear();
  const mm = String(wibDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(wibDate.getUTCDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Jendela Absen: Menit ke 55-59 sebelum jam, atau menit ke 00-05 pada jam pas
  const isMorningWindow = (h === 7 && m >= 55) || (h === 8 && m <= 5);
  const isEveningWindow = (h === 19 && m >= 55) || (h === 20 && m <= 5);

  for (const botName of WORKERS) {
    const shiftInfo = WORKER_SHIFTS[botName];
    if (!shiftInfo) continue;

    const isPagi = shiftInfo.start === 8;
    const shiftName = isPagi ? "早班 (Shift Pagi)" : "晚班 (Shift Malam)";
    const shiftKey = `${todayStr}_${isPagi ? "pagi" : "malam"}`;

    // MASUK
    if (isPagi && isMorningWindow && absensiState.lastMasuk[botName] !== shiftKey) {
      absensiState.lastMasuk[botName] = shiftKey;
      sendAbsensi(botName, shiftName, "masuk");
    }
    if (!isPagi && isEveningWindow && absensiState.lastMasuk[botName] !== shiftKey) {
      absensiState.lastMasuk[botName] = shiftKey;
      sendAbsensi(botName, shiftName, "masuk");
    }

    // PULANG
    if (isPagi && isEveningWindow && absensiState.lastPulang[botName] !== shiftKey) {
      absensiState.lastPulang[botName] = shiftKey;
      doPulang(botName, shiftName);
    }
    if (!isPagi && isMorningWindow && absensiState.lastPulang[botName] !== shiftKey) {
      absensiState.lastPulang[botName] = shiftKey;
      doPulang(botName, shiftName);
    }
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

  // Cek jam absensi bot setiap 60 detik
  setInterval(checkAttendanceCron, 60000);

  console.log("[WorkerBot] All bots started! Running 24/7...");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
