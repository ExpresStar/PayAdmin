// ============================================================
// telegram-bot.js  —  Bridge: Supabase messages ↔ Telegram
// v1.0
// ============================================================
// Arsitektur:
//   Supabase messages table  ←→  Telegram groups
//   - AbsensiBot / WorkerBot posting ke Supabase
//     → telegram-bot.js mendeteksi INSERT via Realtime
//     → forward ke grup Telegram yang sesuai
//   - Admin/Worker kirim pesan di Telegram
//     → telegram-bot.js polling getUpdates()
//     → insert ke Supabase messages
// ============================================================

"use strict";

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
//  KONFIGURASI
// ─────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN = "8847094091:AAGgblCf4e_MRmnuHEpCI_8HhyfEE_Y10b8";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}`;

const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdXF3ZnBuenlsb3NxZm1tdWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODY4ODYsImV4cCI6MjA4OTU2Mjg4Nn0.mOum9c_e5w9SqiKLzVb1ZihmtAaUtqMJOulyPLmbC-c";

// ─────────────────────────────────────────────────────────────
//  SUPABASE CLIENT
// ─────────────────────────────────────────────────────────────

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────
//  GROUP DETECTION
// ─────────────────────────────────────────────────────────────
// telegram-groups.json akan menyimpan mapping:
//   { "room": chat_id }
// Auto-detect berdasarkan nama grup.

const CONFIG_PATH = path.join(__dirname, "telegram-groups.json");
const ROOM_GROUPS = {}; // { worker: -100..., absensi: -100..., reject: -100..., report: -100... }
const GROUP_ROOMS = {}; // { -100...: "worker", ... }
const DETECT_NAMES = { worker: "worker", absensi: "absensi", reject: "reject", report: "report" };

let lastUpdateOffset = 0;
const recentlyInserted = new Set(); // dedup loop
let startupDetectDone = false;

// ─────────────────────────────────────────────────────────────
//  TELEGRAM API HELPERS
// ─────────────────────────────────────────────────────────────

async function tgApi(method, payload = {}) {
  const url = `${TELEGRAM_API}/${method}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error(`[TELEGRAM] API error (${method}):`, err.message);
    return { ok: false };
  }
}

async function sendToGroup(chatId, text, options = {}) {
  if (!chatId) {
    console.warn("[TELEGRAM] sendToGroup skipped — no chatId");
    return;
  }
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || "HTML",
    disable_web_page_preview: true,
    ...(options.extra || {}),
  };
  const res = await tgApi("sendMessage", payload);
  if (!res.ok) {
    console.error("[TELEGRAM] sendMessage error:", res.description);
  }
  return res;
}

async function sendPhotoToGroup(chatId, photoUrl, caption = "") {
  if (!chatId) return;

  // ── Data URI: extract base64 & kirim sebagai file (multipart) ──
  if (photoUrl.startsWith("data:")) {
    return await sendPhotoDataUri(chatId, photoUrl, caption);
  }

  // ── URL biasa (http/https) ──
  const payload = {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption || undefined,
    parse_mode: "HTML",
  };
  const res = await tgApi("sendPhoto", payload);
  if (!res.ok) {
    console.error("[TELEGRAM] sendPhoto error:", res.description);
  }
  return res;
}

async function sendPhotoDataUri(chatId, dataUri, caption = "") {
  try {
    // Parse data URI: "data:image/png;base64,iVBOR..."
    const matches = dataUri.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!matches) {
      console.error("[TELEGRAM] Invalid data URI format");
      return await sendToGroup(chatId, caption || "📸 Gambar");
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const ext = mimeType.split("/")[1] || "png";
    const fileName = `image_${Date.now()}.${ext}`;

    console.log(`[DATAURI] size=${buffer.length} type=${mimeType} file=${fileName}`);

    // ── Save to temp file, then send via multipart ──
    const uploadsDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const tmpPath = path.join(uploadsDir, fileName);
    fs.writeFileSync(tmpPath, buffer);

    try {
      // ── Attempt 1: sendPhoto via multipart ──
      const photoFile = new File([buffer], fileName, { type: mimeType });
      const formData = new FormData();
      formData.append("chat_id", String(chatId));
      formData.append("photo", photoFile);
      if (caption) formData.append("caption", caption);
      formData.append("parse_mode", "HTML");

      let url = `${TELEGRAM_API}/sendPhoto`;
      let res = await fetch(url, { method: "POST", body: formData });
      let json = await res.json();
      if (json.ok) {
        console.log("[DATAURI] ✅ Sent as photo");
        fs.unlinkSync(tmpPath);
        return json;
      }
      console.warn("[DATAURI] sendPhoto failed:", json.description);

      // ── Attempt 2: If image is PNG, try as JPEG (rename + change type) ──
      if (mimeType === "image/png") {
        console.log("[DATAURI] PNG failed as photo, trying as JPEG...");
        const jpegFile = new File([buffer], fileName.replace(/\.png$/i, ".jpg"), { type: "image/jpeg" });
        const formDataJpeg = new FormData();
        formDataJpeg.append("chat_id", String(chatId));
        formDataJpeg.append("photo", jpegFile);
        if (caption) formDataJpeg.append("caption", caption);
        formDataJpeg.append("parse_mode", "HTML");

        res = await fetch(url, { method: "POST", body: formDataJpeg });
        json = await res.json();
        if (json.ok) {
          console.log("[DATAURI] ✅ Sent as photo (PNG as JPEG)");
          fs.unlinkSync(tmpPath);
          return json;
        }
        console.warn("[DATAURI] PNG-as-JPEG also failed:", json.description);
      }

      // ── Attempt 3: sendDocument (fallback, shows as file with preview) ──
      const docFile = new File([buffer], fileName, { type: mimeType });
      const formData2 = new FormData();
      formData2.append("chat_id", String(chatId));
      formData2.append("document", docFile);
      if (caption) formData2.append("caption", caption);
      formData2.append("parse_mode", "HTML");

      url = `${TELEGRAM_API}/sendDocument`;
      res = await fetch(url, { method: "POST", body: formData2 });
      json = await res.json();
      if (json.ok) {
        console.log("[DATAURI] ✅ Sent as document (last resort)");
        fs.unlinkSync(tmpPath);
        return json;
      }
      console.warn("[DATAURI] sendDocument failed:", json.description);

      fs.unlinkSync(tmpPath);
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch {}
      throw e;
    }

    if (caption) await sendToGroup(chatId, caption);
    return { ok: false };
  } catch (err) {
    console.error("[DATAURI] fatal error:", err.message);
    if (caption) await sendToGroup(chatId, caption);
    return { ok: false };
  }
}

// ─────────────────────────────────────────────────────────────
//  GROUP CONFIG LOAD / SAVE / DETECT
// ─────────────────────────────────────────────────────────────

function loadGroupConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      for (const [room, id] of Object.entries(data)) {
        if (id) {
          ROOM_GROUPS[room] = id;
          GROUP_ROOMS[String(id)] = room;
        }
      }
      console.log(
        "[CONFIG] Loaded groups:",
        JSON.stringify(ROOM_GROUPS),
      );
      return true;
    }
  } catch (err) {
    console.error("[CONFIG] Load error:", err.message);
  }
  return false;
}

function saveGroupConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(ROOM_GROUPS, null, 2));
    console.log("[CONFIG] Saved:", JSON.stringify(ROOM_GROUPS));
  } catch (err) {
    console.error("[CONFIG] Save error:", err.message);
  }
}

function matchRoomByGroupTitle(title) {
  const t = (title || "").toLowerCase();
  // English
  if (t.includes("worker")) return "worker";
  if (t.includes("absensi")) return "absensi";
  if (t.includes("reject")) return "reject";
  if (t.includes("report") || t.includes("laporan") || t.includes("harian")) return "report";
  // Chinese
  if (t.includes("工作人员")) return "worker";
  if (t.includes("考勤")) return "absensi";
  if (t.includes("驳回")) return "reject";
  if (t.includes("工作日报") || t.includes("日报")) return "report";
  // Indonesian / mixed
  if (t.includes("pekerja")) return "worker";
  if (t.includes("tolak")) return "reject";
  return null;
}

async function detectGroupsFromUpdates() {
  console.log("[DETECT] Scanning for Telegram groups...");
  const res = await tgApi("getUpdates", { offset: 0, limit: 100 });
  if (!res.ok || !Array.isArray(res.result)) {
    console.log("[DETECT] No updates yet — waiting for group activity...");
    return;
  }

  for (const update of res.result) {
    const chat =
      update.message?.chat ||
      update.my_chat_member?.chat ||
      null;
    if (!chat) continue;
    if (chat.type !== "supergroup" && chat.type !== "group") continue;

    const cid = chat.id;
    if (GROUP_ROOMS[String(cid)]) continue;

    const room = matchRoomByGroupTitle(chat.title);
    if (room) {
      console.log(
        `[DETECT] ✅ "${chat.title}" → room: ${room} → chat_id: ${cid}`,
      );
      ROOM_GROUPS[room] = cid;
      GROUP_ROOMS[String(cid)] = room;
    } else {
      console.log(
        `[DETECT] ⚠️  "${chat.title}" (${cid}) — tidak dikenal, skip`,
      );
    }

    // Track offset so polling doesn't re-process
    if (update.update_id > lastUpdateOffset) {
      lastUpdateOffset = update.update_id;
    }
  }

  if (Object.keys(ROOM_GROUPS).length > 0) {
    saveGroupConfig();
    startupDetectDone = true;
  }
}

// ─────────────────────────────────────────────────────────────
//  SUPABASE → TELEGRAM  (forward dari messages table)
// ─────────────────────────────────────────────────────────────

function getCurrentWIB() {
  const now = new Date();
  return now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
    hour12: false,
  });
}

function formatJakartaWIB(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function formatBotSummary(html) {
  // Absensi summary format: check-in/WC/makan/pulang
  const lines = [];
  const checkin = html.match(/Check-in[^]*?<span[^>]*>([^<]+)<\/span>/);
  const wc = html.match(/WC Break[^]*?<span[^>]*>([^<]+)<\/span>/);
  const makan = html.match(/Meal Break[^]*?<span[^>]*>([^<]+)<\/span>/);
  const pulang = html.match(/Check-out[^>]*>([^<]+)<\/span>/);

  if (checkin) lines.push(`✅ Masuk: ${checkin[1].trim()}`);
  if (wc) lines.push(`🚽 WC: ${wc[1].trim()}`);
  if (makan) lines.push(`🍜 Makan: ${makan[1].trim()}`);
  if (pulang) lines.push(`🏁 Pulang: ${pulang[1].trim()}`);

  return lines.join("\n") || stripHtml(html);
}

function formatBotReject(html) {
  // Extract content inside <pre> if it exists to preserve ASCII art / boxes
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) {
    const innerText = preMatch[1].replace(/<[^>]*>/g, "");
    return `<pre>${innerText}</pre>`;
  }
  
  // Reject message format — take the full text, clean up
  const clean = stripHtml(html);
  if (clean.includes("TX") || clean.includes("Gagal")) {
    return clean;
  }
  return clean;
}

async function forwardToTelegram(msg) {
  const room = (msg.room || "worker").toLowerCase();
  const chatId = ROOM_GROUPS[room];
  if (!chatId) {
    // Try detection again
    return;
  }

  const username = msg.username || "Admin";
  const timeStr = getCurrentWIB();
  const type = msg.type || "user";

  // ── IMAGE TYPE ──
  if (type === "image") {
    const parts = (msg.message || "").split("|--CAPTION--|");
    const imgUrl = parts[0];
    const captionText = parts[1] || "";

    // Always prepend bot/user name and time for context
    let tgCaption = `🤖 <b>${username}</b>`;
    if (captionText) tgCaption += `\n${captionText}`;
    if (timeStr) tgCaption += `\n🕐 ${timeStr} WIB`;

    // Forward image as photo (handle URL + data URI)
    if (imgUrl) {
      await sendPhotoToGroup(chatId, imgUrl, tgCaption);
    } else {
      await sendToGroup(chatId, tgCaption);
    }
    return;
  }

  // ── BOT TYPE (absensi enterprise / summary / structured data) ──
  if (type === "bot") {
    const html = msg.message || "";

    // NEW: Enterprise absensi format — fully self-contained
    if (html.includes("933PAY WORKER") || html.includes("考勤")) {
      await sendToGroup(chatId, html);
      return;
    }

    // OLD: Absensi summary (legacy fallback)
    if (html.includes("absensi-box") || html.includes("Check-in")) {
      const formatted = formatBotSummary(html);
      const text =
        `🤖 <b>${username}</b>\n` +
        `${formatted}\n` +
        `🕐 ${timeStr} WIB`;
      await sendToGroup(chatId, text);
      return;
    }

    // Default: reject / other bot messages
    const formatted = formatBotReject(html);
    const text =
      `🤖 <b>${username}</b>\n` +
      `${formatted}\n` +
      `🕐 ${timeStr} WIB`;
    await sendToGroup(chatId, text);
    return;
  }

  // ── ACTION TYPE (absensi tindakan: Masuk/WC/Makan/Pulang) ──
  if (type === "action") {
    const actionText = stripHtml(msg.message || "");
    const emoji = actionText.includes("Masuk")
      ? "✅"
      : actionText.includes("WC")
        ? "🚽"
        : actionText.includes("Makan")
          ? "🍜"
          : actionText.includes("Pulang")
            ? "🏁"
            : "📋";

    const text =
      `${emoji} <b>${username}</b>\n` +
      `${actionText}\n` +
      `🕐 ${timeStr} WIB`;

    await sendToGroup(chatId, text);
    return;
  }

  // ── USER TYPE (default) ──
  const text =
    `👤 <b>${username}</b>\n` +
    `${msg.message || ""}\n` +
    `🕐 ${timeStr} WIB`;

  await sendToGroup(chatId, text);
}

let lastPolledMsgId = null;

async function pollNewMessages() {
  try {
    let query = sb
      .from("messages")
      .select("id, username, message, type, room, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    const { data, error } = await query;
    if (error) return;
    if (!data || data.length === 0) return;

    for (const msg of data) {
      if (recentlyInserted.has(msg.id)) {
        recentlyInserted.delete(msg.id);
        continue;
      }
      if (lastPolledMsgId === msg.id) continue;
      if (!lastPolledMsgId) {
        lastPolledMsgId = msg.id;
        continue; // skip first poll (catch up)
      }

      // Check if this is a new message
      const msgAge = Date.now() - new Date(msg.created_at).getTime();
      if (msgAge > 30000) continue; // skip old messages

      console.log(`[POLL→TG] Forwarding ${msg.id.substring(0,8)}...`);
      lastPolledMsgId = msg.id;
      await forwardToTelegram(msg);
    }
  } catch (err) {
    // silent
  }
}

function listenMessages() {
  console.log("[REALTIME] Subscribing to messages table...");

  const channelName = "tg-bridge-" + Math.random().toString(36).substring(2,8);
  console.log("[REALTIME] Channel:", channelName);

  sb.channel(channelName)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        console.log("[REALTIME] 🔔 EVENT RECEIVED!", payload.new?.id?.substring(0,8));
        const msg = payload.new;
        if (!msg) {
          console.warn("[REALTIME] No payload.new");
          return;
        }
        if (recentlyInserted.has(msg.id)) {
          console.log("[REALTIME] Skipping self-inserted");
          recentlyInserted.delete(msg.id);
          return;
        }
        lastPolledMsgId = msg.id;
        forwardToTelegram(msg).then(() => {
          console.log("[→TG] ✅ Forwarded to Telegram");
        }).catch((err) =>
          console.error("[→TG] Error forwarding:", err.message),
        );
      },
    )
    .subscribe((status) => {
      console.log("[REALTIME] Subscription status:", status);
    });
  
  // Fallback: poll every 4 seconds
  setInterval(pollNewMessages, 4000);
}

// ─────────────────────────────────────────────────────────────
//  TELEGRAM → SUPABASE  (terima pesan dari grup)
// ─────────────────────────────────────────────────────────────

async function downloadTelegramFile(fileId) {
  try {
    // Get file path
    const fileRes = await tgApi("getFile", { file_id: fileId });
    if (!fileRes.ok || !fileRes.result?.file_path) {
      console.error("[FILE] getFile failed:", fileRes.description);
      return null;
    }
    const filePath = fileRes.result.file_path;
    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;

    // Download
    const resp = await fetch(fileUrl);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());

    return { buffer, filePath };
  } catch (err) {
    console.error("[FILE] Download error:", err.message);
    return null;
  }
}

async function uploadToSupabase(buffer, originalPath) {
  const ext = path.extname(originalPath) || ".jpg";
  const fileName = `tg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const filePath = `chat_images/${fileName}`;

  const { error: uploadErr } = await sb.storage
    .from("chat_images")
    .upload(filePath, buffer, {
      contentType: `image/${ext.replace(".", "")}`,
    });

  if (uploadErr) {
    console.error("[STORAGE] Upload error:", uploadErr.message);
    return null;
  }

  const { data: pubData } = sb.storage
    .from("chat_images")
    .getPublicUrl(filePath);

  return pubData?.publicUrl || null;
}

async function handleTelegramMessage(update) {
  const msg = update.message;
  if (!msg) return;

  const chat = msg.chat;
  if (chat.type !== "supergroup" && chat.type !== "group") return;

  const chatIdStr = String(chat.id);
  let room = GROUP_ROOMS[chatIdStr];

  if (!room) {
    // Try auto-detect if not yet mapped
    const detected = matchRoomByGroupTitle(chat.title);
    if (detected) {
      console.log(
        `[DETECT] New group detected: "${chat.title}" → ${detected} (${chat.id})`,
      );
      ROOM_GROUPS[detected] = chat.id;
      GROUP_ROOMS[chatIdStr] = detected;
      room = detected;
      saveGroupConfig();
    } else {
      console.log(
        `[TG→DB] Pesan dari grup "${chat.title}" (${chat.id}) — tidak dikenal, skip`,
      );
      return;
    }
  }

  // Skip messages from the bot itself
  const sender = msg.from;
  if (sender?.is_bot) return;

  const username = sender?.first_name || sender?.username || "Unknown";
  const now = new Date().toISOString();

  // ── IMAGE MESSAGE ──
  if (msg.photo && msg.photo.length > 0) {
    // Get largest photo
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    const caption = msg.caption || "";

    console.log(`[TG→DB] 📸 ${username} mengirim gambar di room "${room}"`);

    // Download from Telegram
    const fileData = await downloadTelegramFile(fileId);
    if (!fileData) {
      console.error("[TG→DB] Gagal download gambar");
      return;
    }

    // Convert to base64 data URI (no Supabase Storage needed)
    const mimeType = fileData.filePath.endsWith('.png') ? 'image/png'
      : fileData.filePath.endsWith('.gif') ? 'image/gif'
      : fileData.filePath.endsWith('.webp') ? 'image/webp'
      : 'image/jpeg';
    const base64 = fileData.buffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Insert message
    const finalMsg = caption
      ? `${dataUri}|--CAPTION--|${caption}`
      : dataUri;

    const { data: inserted, error } = await sb
      .from("messages")
      .insert({
        username,
        message: finalMsg,
        type: "image",
        room,
      })
      .select();

    if (error) {
      console.error("[TG→DB] Insert image error:", error.message);
    } else if (inserted && inserted[0]) {
      recentlyInserted.add(inserted[0].id);
      setTimeout(() => recentlyInserted.delete(inserted[0].id), 5000);
    }
    return;
  }

  // ── TEXT MESSAGE ──
  const text = (msg.text || "").trim();
  if (!text) return;

  console.log(`[TG→DB] 💬 ${username} di "${room}": ${text.substring(0, 50)}...`);

  const { data: inserted, error } = await sb
    .from("messages")
    .insert({
      username,
      message: text,
      type: "user",
      room,
    })
    .select();

  if (error) {
    console.error("[TG→DB] Insert error:", error.message);
  } else if (inserted && inserted[0]) {
    recentlyInserted.add(inserted[0].id);
    setTimeout(() => recentlyInserted.delete(inserted[0].id), 5000);
  }
}

// ─────────────────────────────────────────────────────────────
//  POLLING LOOP
// ─────────────────────────────────────────────────────────────

async function pollTelegram() {
  try {
    const res = await tgApi("getUpdates", {
      offset: lastUpdateOffset + 1,
      timeout: 2,
    });

    if (!res.ok || !Array.isArray(res.result)) return;

    for (const update of res.result) {
      lastUpdateOffset = update.update_id;
      await handleTelegramMessage(update);
    }
  } catch (err) {
    console.error("[POLL] Error:", err.message);
  }
}

function startPolling() {
  const poll = async () => {
    await pollTelegram();
    setTimeout(poll, 200);
  };
  poll();
}

// ─────────────────────────────────────────────────────────────
//  STARTUP SEQUENCE
// ─────────────────────────────────────────────────────────────

async function startTelegramBridge() {
  console.log("");
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║     TELEGRAM BRIDGE — PayAdmin v1.0      ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log("");

  // 1. Load saved config
  const hasConfig = loadGroupConfig();

  // 2. Try detect from recent updates
  await detectGroupsFromUpdates();

  // 3. If still no groups, log instructions
  const mapped = Object.keys(ROOM_GROUPS).length;
  if (mapped === 0) {
    console.log("");
    console.log("⚠️  BELUM ADA GRUP TERDETEKSI.");
    console.log("   Kirim pesan ke grup Telegram yang sudah dibuat,");
    console.log("   nanti bot akan auto-detect berdasarkan nama grup.");
    console.log("   Nama grup harus mengandung: Worker, Absensi, atau Reject");
    console.log("");
    console.log("   Atau set manual di telegram-groups.json");
    console.log("");
  } else {
    console.log(`✅ ${mapped} grup terdeteksi:`, JSON.stringify(ROOM_GROUPS));
  }

  // 4. Start Supabase → Telegram listener
  listenMessages();

  // 5. Start Telegram polling loop
  console.log("[POLL] Starting polling loop...");
  startPolling();

  // 6. Periodic re-detect (every 10 min, only if groups < 3)
  setInterval(async () => {
    if (Object.keys(ROOM_GROUPS).length < 3) {
      await detectGroupsFromUpdates();
    }
  }, 10 * 60 * 1000);

  console.log("[BRIDGE] ✅ Telegram Bridge aktif!");
  console.log("");
}

// ─────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────

startTelegramBridge().catch((err) => {
  console.error("[FATAL] Startup error:", err);
  process.exit(1);
});
