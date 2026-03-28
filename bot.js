/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          PayAdmin — Bot Automation System            ║
 * ║                                                      ║
 * ║  WORKER GROUP  →  Completely ignored by all bots     ║
 * ║  ABSENSI       →  Realistic check-in / break bots    ║
 * ║  REJECT FAILED →  Error-report bots                  ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Setup:
 *   npm install @supabase/supabase-js
 *   node bot.js
 *
 * Requires Node.js 18+ (native fetch). Add to package.json:
 *   "type": "module"
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ─────────────────────────────────────────────────────────
//  SUPABASE CONFIG
// ─────────────────────────────────────────────────────────

const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdXF3ZnBuenlsb3NxZm1tdWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODY4ODYsImV4cCI6MjA4OTU2Mjg4Nn0.mOum9c_e5w9SqiKLzVb1ZihmtAaUtqMJOulyPLmbC-c";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────
//  BOT ROSTER
// ─────────────────────────────────────────────────────────

const ABSENSI_BOTS = [
  "yaer98",
  "xiaoting99",
  "anan88",
];

const REJECT_BOTS = [
  "willy@admin.com",
  "bil_scanner",
];

// ─────────────────────────────────────────────────────────
//  TIMING CONSTANTS
// ─────────────────────────────────────────────────────────

const WORK_START_HOUR = 8;
const WORK_END_HOUR   = 18;
const WC_DURATION_MS    = 15 * 60 * 1000;
const MAKAN_DURATION_MS = 30 * 60 * 1000;

const ERROR_CODES = [
  { code: ".bil",  label: "wrong nominal"       },
  { code: ".name", label: "wrong account name"  },
  { code: ".bank", label: "wrong bank"          },
];

const SAMPLE_NAMES = [
  "Nguyen Van A", "Tran Thi B", "Le Minh C",
  "Pham Duc D",   "Vo Thi E",   "Trinh Anh Oanh",
  "Hoang Van F",  "Dang Thi G", "Bui Minh H",
];
const SAMPLE_BANKS = [
  "Vietcombank", "MB Bank", "BIDV", "ACB",
  "VPBank", "Techcombank", "VietinBank", "LPBank",
];

// ─────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randItem(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJakarta(d = new Date()) {
  const s = d.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
  const jkt = new Date(s);
  const hh  = jkt.getHours();
  const mm  = jkt.getMinutes();
  const ss  = jkt.getSeconds();
  return {
    hour:        hh,
    minute:      mm,
    second:      ss,
    totalMins:   hh * 60 + mm,
    dateKey:     [
      jkt.getFullYear(),
      String(jkt.getMonth() + 1).padStart(2, "0"),
      String(jkt.getDate()).padStart(2, "0"),
    ].join("-"),
    timeStr: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    fullStr: `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`,
  };
}

function msUntilJakartaHour(targetHour, jitterMs = 0) {
  const jkt        = getJakarta();
  const nowMins    = jkt.totalMins;
  const targetMins = targetHour * 60;
  let diffMins     = targetMins - nowMins;
  if (diffMins < 0) diffMins += 24 * 60;
  const diffMs = diffMins * 60 * 1000;
  return Math.max(0, diffMs + jitterMs);
}

// ─────────────────────────────────────────────────────────
//  STATE PERSISTENCE
// ─────────────────────────────────────────────────────────

const STATE_FILE = "./bot_states.json";

function loadAllStates() {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveStateFor(botName, data) {
  const all = loadAllStates();
  all[botName] = data;
  try {
    writeFileSync(STATE_FILE, JSON.stringify(all, null, 2), "utf8");
  } catch (e) {
    console.error(`[STATE] Save failed for ${botName}:`, e.message);
  }
}

function getStateFor(botName) {
  return loadAllStates()[botName] || null;
}

// ─────────────────────────────────────────────────────────
//  SUPABASE HELPERS
// ─────────────────────────────────────────────────────────

async function insertMsg({ username, message, type, room }) {
  if (room === "worker") {
    console.warn(`[BOT GUARD] ${username} tried to write to worker room — BLOCKED`);
    return false;
  }

  const { error } = await sb
    .from("messages")
    .insert([{ username, message, type, room }]);

  if (error) {
    console.error(`[MSG ERROR] [${username}→${room}]:`, error.message);
    return false;
  }
  return true;
}

async function fetchPendingTx(limit = 5) {
  const { data, error } = await sb
    .from("transactions")
    .select("*")
    .eq("status", "Pending")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[FETCH TX ERROR]:", error.message);
    return [];
  }
  return data || [];
}

function makeFakeTx() {
  return {
    transaction_id:  "TX" + Math.random().toString(36).slice(2, 14).toUpperCase(),
    order_id:        "ORD" + Math.floor(Math.random() * 1e8),
    account_number:  "0" + Math.floor(1e9 + Math.random() * 9e9),
    account_name:    randItem(SAMPLE_NAMES),
    bank_name:       randItem(SAMPLE_BANKS),
    amount:          randInt(50, 5000) * 1000,
    status:          "Pending",
    created_at:      new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────
//  ABSENSI BOT
// ─────────────────────────────────────────────────────────

class AbsensiBot {
  constructor(name) {
    this.name      = name;
    this.state     = "idle";
    this.masukTime = null;
    this.wcCount   = 0;
    this.makanCount = 0;
    this.pulangTime = null;
    this.breaks    = [];
    this.pulangMs  = null;
  }

  log(msg) {
    const { timeStr } = getJakarta();
    console.log(`[ABSENSI][${timeStr}] ${this.name}: ${msg}`);
  }

  async doAction(text) {
    this.log(text);

    await insertMsg({
      username: this.name,
      message:  `<i>${text}</i>`,
      type:     "action",
      room:     "absensi",
    });

    await sleep(randInt(300, 800));
    await this.sendSummary();
  }

  async sendSummary() {
    const pulangDisplay = this.pulangTime || "—";
    const summary = `<div class="absensi-box">
  <div class="absensi-title">📊 ${this.name}'s Summary</div>
  <div class="absensi-row masuk"><span>Check-in</span><span>${this.masukTime || "—"}</span></div>
  <div class="absensi-row wc"><span>WC Break</span><span>${this.wcCount}x</span></div>
  <div class="absensi-row makan"><span>Meal Break</span><span>${this.makanCount}x</span></div>
  <div class="absensi-row pulang"><span>Check-out</span><span>${pulangDisplay}</span></div>
</div>`;

    await insertMsg({
      username: this.name,
      message:  summary,
      type:     "bot",
      room:     "absensi",
    });
  }

  buildSchedule(masukMs) {
    const shiftEndMs = masukMs + (WORK_END_HOUR - WORK_START_HOUR) * 60 * 60 * 1000;

    const pool = [
      ...Array(randInt(1, 3)).fill("wc"),
      "makan",
    ].sort(() => Math.random() - 0.5);

    const schedule  = [];
    let cursorMs = masukMs + randInt(45, 120) * 60 * 1000;

    for (const type of pool) {
      if (cursorMs >= shiftEndMs - 60 * 60 * 1000) break;

      const startMs = cursorMs + randInt(0, 25) * 60 * 1000;
      const durMs   = type === "wc" ? WC_DURATION_MS : MAKAN_DURATION_MS;
      const endMs   = startMs + durMs;

      schedule.push({ type, startMs, endMs });

      cursorMs = endMs + randInt(30, 90) * 60 * 1000;
    }

    const lastEventMs = schedule.length
      ? schedule[schedule.length - 1].endMs
      : masukMs;
    const nominalPulang = shiftEndMs + randInt(-30, 30) * 60 * 1000;
    const pulangMs = Math.max(lastEventMs + 10 * 60 * 1000, nominalPulang);

    return { schedule, pulangMs };
  }

  async run() {
    const saved = getStateFor(this.name);
    const todayKey = getJakarta().dateKey;

    if (saved?.dateKey === todayKey && saved?.done) {
      this.log("Already completed today. Exiting.");
      return;
    }

    const jitterMs = randInt(-5, 5) * 60 * 1000;
    const waitMs   = msUntilJakartaHour(WORK_START_HOUR, jitterMs);

    if (waitMs > 0) {
      this.log(`Waiting ${Math.round(waitMs / 60000)} min before check-in`);
      await sleep(waitMs);
    }

    const masukMs    = Date.now();
    this.masukTime   = getJakarta().timeStr;
    this.state       = "working";
    await this.doAction("Masuk");
    saveStateFor(this.name, { dateKey: todayKey, masukTime: this.masukTime, done: false });

    const { schedule, pulangMs } = this.buildSchedule(masukMs);
    this.breaks   = schedule;
    this.pulangMs = pulangMs;

    this.log(
      `Schedule: ${schedule.map(b => `${b.type}@${getJakarta(new Date(b.startMs)).timeStr}`).join(", ")} | Pulang@${getJakarta(new Date(pulangMs)).timeStr}`
    );

    for (const brk of schedule) {
      const waitBreak = brk.startMs - Date.now();
      if (waitBreak > 0) await sleep(waitBreak);

      if (Date.now() > this.pulangMs) break;

      const startLabel = brk.type === "wc"
        ? "Ke WC dulu (15 menit)"
        : "Istirahat Makan (30 menit)";

      this.state = brk.type;
      if (brk.type === "wc")   this.wcCount++;
      else                      this.makanCount++;

      await this.doAction(startLabel);

      const breakWait = (brk.endMs - Date.now()) + randInt(-60, 60) * 1000;
      if (breakWait > 0) await sleep(breakWait);

      const returnLabel = brk.type === "wc"
        ? "Kembali dari WC"
        : "Kembali, lanjut kerja";

      this.state = "working";
      await this.doAction(returnLabel);

      await sleep(randInt(5, 30) * 1000);
    }

    const waitPulang = this.pulangMs - Date.now();
    if (waitPulang > 0) await sleep(waitPulang);

    this.pulangTime = getJakarta().timeStr;
    this.state      = "done";
    await this.doAction("Pulang Kerja");

    saveStateFor(this.name, { dateKey: todayKey, masukTime: this.masukTime, done: true });
    this.log("Done for today ✓");
  }
}

// ─────────────────────────────────────────────────────────
//  REJECT FAILED BOT
// ─────────────────────────────────────────────────────────

class RejectBot {
  constructor(name) {
    this.name = name;
  }

  log(msg) {
    const { timeStr } = getJakarta();
    console.log(`[REJECT][${timeStr}] ${this.name}: ${msg}`);
  }

  buildCard(tx) {
    const amount  = Number(tx.amount).toLocaleString("vi-VN");
    const created = tx.created_at
      ? new Date(tx.created_at).toLocaleString("en-GB", {
          timeZone: "Asia/Jakarta",
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        })
      : new Date().toLocaleString("en-GB", { timeZone: "Asia/Jakarta" });

    return `<div style="background:#1a2433;border:1px solid #2d3f53;border-radius:8px;padding:12px 14px;font-size:11px;font-family:'Courier New',monospace;color:#c8d6e5;line-height:2;max-width:560px;box-shadow:0 4px 12px rgba(0,0,0,0.4)">
  <div style="color:#4fc3f7;font-weight:700;font-size:12px;margin-bottom:8px;border-bottom:1px solid #2d3f53;padding-bottom:6px;letter-spacing:0.5px">
    ⚠ REJECT REPORT — ${this.name}
  </div>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="color:#5b7a99;padding-right:16px;white-space:nowrap">TX&nbsp;ID</td>
        <td style="color:#ffffff;word-break:break-all">${tx.transaction_id}</td></tr>
    <tr><td style="color:#5b7a99">Order</td>
        <td>${tx.order_id}</td></tr>
    <tr><td style="color:#5b7a99">Account</td>
        <td style="font-size:12px">${tx.account_number}</td></tr>
    <tr><td style="color:#5b7a99">Name</td>
        <td style="color:#e2e8f0">${tx.account_name}</td></tr>
    <tr><td style="color:#5b7a99">Bank</td>
        <td>${tx.bank_name}</td></tr>
    <tr><td style="color:#5b7a99">Amount</td>
        <td style="color:#60a5fa;font-weight:700;font-size:13px">${amount} VND</td></tr>
    <tr><td style="color:#5b7a99">Status</td>
        <td><span style="background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b55;padding:1px 8px;border-radius:4px;font-size:10px;font-weight:700">${tx.status}</span></td></tr>
    <tr><td style="color:#5b7a99">Time</td>
        <td style="color:#6b7a8d;font-size:10px">${created}</td></tr>
  </table>
</div>`;
  }

  async sendReport(tx) {
    const err = randItem(ERROR_CODES);
    this.log(`Reporting TX ${tx.transaction_id} → ${err.code} (${err.label})`);

    await insertMsg({
      username: this.name,
      message:  this.buildCard(tx),
      type:     "bot",
      room:     "reject",
    });

    await sleep(randInt(800, 4000));

    await insertMsg({
      username: this.name,
      message:  err.code,
      type:     "user",
      room:     "reject",
    });
  }

  async run() {
    this.log("Reject monitor active.");
    await sleep(randInt(5, 30) * 1000);

    while (true) {
      try {
        const list = await fetchPendingTx(5);
        const tx   = list.length ? randItem(list) : makeFakeTx();
        await this.sendReport(tx);
      } catch (err) {
        console.error(`[REJECT ERROR] ${this.name}:`, err.message);
      }

      const nextMin = randInt(3, 10);
      this.log(`Next report in ${nextMin} min`);
      await sleep(nextMin * 60 * 1000);
    }
  }
}

// ─────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────

async function main() {
  const startTime = getJakarta().fullStr;
  console.log(`
╔═══════════════════════════════════════════════════╗
║            PayAdmin — Bot System v2               ║
║  Started at : ${startTime} WIB               ║
║  Absensi    : [${ABSENSI_BOTS.join(", ")}]    ║
║  Reject     : [${REJECT_BOTS.join(", ")}]    ║
║  Worker     : ✗  (bots are 100% silent here)     ║
╚═══════════════════════════════════════════════════╝
`);

  const tasks = [];

  ABSENSI_BOTS.forEach((name, i) => {
    const delay = i * randInt(10, 30) * 1000;
    tasks.push(
      sleep(delay).then(() => {
        console.log(`[INIT] AbsensiBot "${name}" starting in ${delay / 1000}s`);
        return new AbsensiBot(name).run();
      })
    );
  });

  REJECT_BOTS.forEach((name, i) => {
    const delay = i * randInt(15, 45) * 1000;
    tasks.push(
      sleep(delay).then(() => {
        console.log(`[INIT] RejectBot  "${name}" starting in ${delay / 1000}s`);
        return new RejectBot(name).run();
      })
    );
  });

  const results = await Promise.allSettled(tasks);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[CRASH] Bot task #${i} failed:`, r.reason);
    }
  });

  console.log("[BOT SYSTEM] All bots have exited.");
}

main().catch(console.error);
