// =======================
// CONFIG SUPABASE
// =======================

const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdXF3ZnBuenlsb3NxZm1tdWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODY4ODYsImV4cCI6MjA4OTU2Mjg4Nn0.mOum9c_e5w9SqiKLzVb1ZihmtAaUtqMJOulyPLmbC-c";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// STATE
// =======================

let currentUser = "";
let activeRoom = "worker"; // default room
let presenceChannel = null; // ⬅️ Global agar bisa ditutup saat logout
let roomsSupported = true; // fallback if messages table has no "room" column
let absensiState = {
  masuk: null,
  wc: 0,
  makan: 0,
  pulang: null,
};

// AUTO OFFLINE SAAT TAB DITUTUP
window.addEventListener("beforeunload", () => {
  if (presenceChannel) sb.removeChannel(presenceChannel);
});

const ROOM_NAMES = {
  absensi: "📊 ABSENSI",
  reject: "❌ REJECT FAILED",
  worker: "👥 WORKER GROUP",
};

// ─────────────────────────────────────────────────────
//  BOT ROSTER  (must match names in bot.js)
//  Absensi bots → only active in "absensi" room
//  Reject bots  → only active in "reject" room
//  Worker Group → NO bot may ever write here
// ─────────────────────────────────────────────────────
const ABSENSI_BOTS = ["yaer98", "xiaoting99", "anan88"];

/** Bot names that are allowed to post in reject room */
const REJECT_BOT_NAMES = new Set(["willy@admin.com", "bil_scanner"]);

/**
 * Hard guard: called before every bot message insert.
 * Returns false (and blocks) if a bot is trying to
 * write to the Worker Group channel.
 */
function botMayPostToRoom(username, room) {
  const isBot =
    ABSENSI_BOTS.includes(username) || REJECT_BOT_NAMES.has(username);
  if (!isBot) return true; // human admins can post anywhere
  if (room === "worker") {
    console.warn(
      `[BOT GUARD] "${username}" tried to post to worker room — BLOCKED`,
    );
    return false;
  }
  return true;
}

// =======================
// AUTH LOGIN
// =======================

async function doLogin() {
  const emailInput = document.getElementById("login-user");
  const passInput = document.getElementById("login-pass");
  const errorEl = document.getElementById("login-error");

  const email = emailInput.value.trim();
  const password = passInput.value;

  if (!email || !password) {
    errorEl.style.display = "block";
    errorEl.textContent = "⚠ Please fill in all fields.";
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.style.display = "block";
    errorEl.textContent = "⚠ " + error.message;
    return;
  }

  // ✅ 2FA DIHAPUS — langsung masuk tanpa 2FA

  currentUser = data.user.email;
  loadAbsensiState(); // Restore previous state for this user

  document.getElementById("login-page").style.display = "none";
  document.getElementById("chat-ui").style.display = "flex";

  switchRoom("worker"); // Start in worker group
  initRealtime();

  // Start simulated absensi bots (chat page)
  startAbsensiBotsIfNeeded();
}

function saveAbsensiState() {
  if (currentUser) {
    localStorage.setItem(
      `absensi_${currentUser}`,
      JSON.stringify(absensiState),
    );
  }
}

function loadAbsensiState() {
  const saved = localStorage.getItem(`absensi_${currentUser}`);
  if (saved) {
    absensiState = JSON.parse(saved);
  } else {
    absensiState = { masuk: null, wc: 0, makan: 0, pulang: null };
  }
}

// =======================
// ROOM SWITCHING
// =======================

function switchRoom(roomId) {
  activeRoom = roomId;

  // UI Updates
  document
    .querySelectorAll(".room-item")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById(`room-${roomId}`).classList.add("active");

  document.getElementById("active-room-title").textContent = ROOM_NAMES[roomId];
  document.getElementById("active-room-subtitle").textContent =
    roomId === "absensi" ? "Hanya log absensi" : "online";

  // Toggle Input (Absensi room can't type)
  const inputContainer = document.getElementById("msg-input-container");
  const toolbar = document.getElementById("absensi-toolbar");

  if (roomId === "absensi") {
    // Absensi: Tampilkan Tombol, Sembunyikan Ketikan
    toolbar.style.display = "flex";
    inputContainer.style.display = "none";
  } else {
    // Lainnya: Sembunyikan Tombol, Tampilkan Ketikan
    toolbar.style.display = "none";
    inputContainer.style.display = "flex";
  }

  loadMessages();
}

// =======================
// DATA OPS
// =======================

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  const msgData = roomsSupported
    ? { username: currentUser, message: msg, type: "user", room: activeRoom }
    : { username: currentUser, message: msg, type: "user" };

  console.log("Attempting to send:", msgData);
  const { error } = await sb.from("messages").insert([msgData]);

  if (error) {
    console.error("Insert error:", error);
    if (error.message.includes('column "room" does not exist')) {
      roomsSupported = false;
      console.warn("Retrying without room field...");
      const fallbackMsg = { username: currentUser, message: msg, type: "user" };
      const { error: err2 } = await sb.from("messages").insert([fallbackMsg]);
      if (err2) alert("Fatal error: " + err2.message);
      else input.value = "";
    } else {
      alert("Error: " + error.message);
    }
    return;
  }
  input.value = "";
}

async function sendAction(text) {
  const now = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  if (text.includes("Masuk")) {
    // Reset state jika absen masuk baru
    absensiState = { masuk: now, wc: 0, makan: 0, pulang: null };
  } else if (text.includes("WC")) absensiState.wc++;
  else if (text.includes("Makan")) absensiState.makan++;
  else if (text.includes("Pulang")) {
    absensiState.pulang = now;
  }

  saveAbsensiState(); // Simpan perubahan agar tidak hilang saat refresh

  // Notification to current room
  const notifyData = roomsSupported
    ? {
        username: currentUser,
        message: `<i>${text}</i>`,
        type: "action",
        room: activeRoom,
      }
    : { username: currentUser, message: `<i>${text}</i>`, type: "action" };
  const { error: err1 } = await sb.from("messages").insert([notifyData]);
  if (err1 && err1.message.includes('column "room" does not exist')) {
    roomsSupported = false;
    await sb
      .from("messages")
      .insert([
        { username: currentUser, message: `<i>${text}</i>`, type: "action" },
      ]);
  }

  // Summary to Absensi room — simpan dengan username sendiri supaya hanya tampil ke user yg bersangkutan
  const summary = `
  <div class="absensi-box">
    <div class="absensi-title">📊 ${currentUser}'s Summary</div>
    <div class="absensi-row masuk"><span>Check-in</span> <span>${absensiState.masuk || "—"}</span></div>
    <div class="absensi-row wc"><span>WC Break</span> <span>${absensiState.wc}x</span></div>
    <div class="absensi-row makan"><span>Meal Break</span><span>${absensiState.makan}x</span></div>
    <div class="absensi-row pulang"><span>Check-out</span> <span>${absensiState.pulang || "—"}</span></div>
  </div>`;

  // Simpan summary dengan username = currentUser (bukan BOT) agar bisa difilter per admin
  const botData = roomsSupported
    ? { username: currentUser, message: summary, type: "bot", room: "absensi" }
    : { username: currentUser, message: summary, type: "bot" };
  const { error: err2 } = await sb.from("messages").insert([botData]);
  if (err2 && err2.message.includes('column "room" does not exist')) {
    roomsSupported = false;
    await sb
      .from("messages")
      .insert([{ username: currentUser, message: summary, type: "bot" }]);
  }
}

function getUserColor(username) {
  const colors = [
    "#3498db",
    "#e67e22",
    "#2ecc71",
    "#f1c40f",
    "#9b59b6",
    "#1abc9c",
    "#e74c3c",
    "#7ab9f1",
    "#ff784e",
    "#a29bfe",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function renderMessage(m) {
  const currentActive = (activeRoom || "worker").toLowerCase();
  const msgRoom = roomsSupported
    ? (m.room || "worker").toLowerCase()
    : currentActive;

  if (roomsSupported && msgRoom !== currentActive) {
    updateSidebarPreview(m);
    return;
  }

  const box = document.getElementById("chat-box");
  const username = m.username || "Admin";
  const message = m.message || "";
  const type = m.type || "user";

  let rawDate = m.created_at;
  if (rawDate && !rawDate.includes("Z") && !rawDate.includes("+"))
    rawDate = rawDate.replace(" ", "T") + "Z";
  const dateObj = rawDate ? new Date(rawDate) : new Date();
  const timeStr = dateObj.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

  const wrapper = document.createElement("div");
  wrapper.className = "tg-msg-wrapper";

  const div = document.createElement("div");
  div.className = "msg " + (username === currentUser ? "me" : "other");
  if (type === "bot")
    ((div.style.background = "transparent"),
      (div.style.boxShadow = "none"),
      (div.style.padding = "0"));

  let html = "";
  if (username !== currentUser && type !== "bot") {
    // Generate warna unik berdasarkan username
    const nameColor = getUserColor(username);
    html += `<span class="msg-name" style="color: ${nameColor}">${username}</span>`;
  }

  // Handle IMAGE type
  if (type === "image") {
    const parts = message.split("|--CAPTION--|");
    const imgUrl = parts[0];
    const captionText = parts[1] || "";

    html += `<img src="${imgUrl}" class="msg-img" onclick="openZoom('${imgUrl}')" />`;
    if (captionText) {
      html += `<div style="margin-top: 6px; font-size: 14px; color: #fff;">${captionText}</div>`;
    }
  } else {
    html += `<div>${message}</div>`;
  }

  html += `<div class="msg-meta"><span>${timeStr}</span></div>`;

  div.innerHTML = html;
  wrapper.appendChild(div);
  box.appendChild(wrapper);
  box.scrollTop = box.scrollHeight;
}

// =======================
// IMAGE UPLOAD & PASTE
// =======================

let pendingImageFile = null;

function showImagePreview(file) {
  if (!file || !file.type.startsWith("image/")) return;
  pendingImageFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("preview-img-target").src = e.target.result;
    document.getElementById("image-preview-modal").style.display = "flex";
    document.getElementById("preview-caption").value = "";
    document.getElementById("preview-caption").focus();
  };
  reader.readAsDataURL(file);
}

function closePreview() {
  document.getElementById("image-preview-modal").style.display = "none";
  pendingImageFile = null;
}

async function confirmSendImage() {
  if (!pendingImageFile) return;

  const btn = document.getElementById("preview-send-btn");
  const caption = document.getElementById("preview-caption").value.trim();

  btn.disabled = true;
  btn.innerText = "SENDING...";

  try {
    const file = pendingImageFile;
    const fileExt = file.name ? file.name.split(".").pop() : "png";
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `chat_images/${fileName}`;

    // 1. Upload
    const { error: uploadError } = await sb.storage
      .from("chat_images")
      .upload(filePath, file);
    if (uploadError) throw uploadError;

    // 2. URL
    const { data: publicUrlData } = sb.storage
      .from("chat_images")
      .getPublicUrl(filePath);
    const imageUrl = publicUrlData.publicUrl;

    // 3. Insert message
    const finalMessage = caption
      ? `${imageUrl}|--CAPTION--|${caption}`
      : imageUrl;

    const msgData = roomsSupported
      ? {
          username: currentUser,
          message: finalMessage,
          type: "image",
          room: activeRoom,
        }
      : { username: currentUser, message: finalMessage, type: "image" };

    const { error: dbError } = await sb.from("messages").insert([msgData]);
    if (dbError) throw dbError;

    closePreview();
  } catch (err) {
    alert("Gagal kirim: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "SEND";
  }
}

async function handleFileSelect(event) {
  const file = event.target.files[0];
  showImagePreview(file);
  event.target.value = ""; // Reset input
}

// Fitur PASTE (Ctrl + V)
document
  .getElementById("chat-input")
  .addEventListener("paste", async (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData)
      .items;

    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        showImagePreview(file);
        event.preventDefault();
      }
    }
  });

function updateSidebarPreview(m) {
  const room = m.room || "worker";
  const previewEl = document.getElementById(`preview-${room}`);
  const timeEl = document.getElementById(`time-${room}`);

  if (previewEl) {
    let cleanMsg = (m.message || "").replace(/<[^>]*>?/gm, "");
    previewEl.textContent = `${m.username}: ${cleanMsg}`;
  }

  if (timeEl) {
    let dateObj = m.created_at ? new Date(m.created_at) : new Date();
    timeEl.textContent = dateObj.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
  }
}

async function loadMessages() {
  const box = document.getElementById("chat-box");
  box.innerHTML = `<div style="text-align:center; color:var(--tg-text-muted); margin-top:20px;">Memuat riwayat...</div>`;

  console.log("Memuat pesan untuk room:", activeRoom);

  let query = sb.from("messages").select("*");
  if (activeRoom && roomsSupported) {
    query = query.eq("room", activeRoom.toLowerCase());
  }

  // Ambil 50 pesan TERBARU (descending)
  let { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(50);

  if (error && error.message.includes('column "room" does not exist')) {
    roomsSupported = false;
    const fallback = await sb
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("Kesalahan Load:", error);
    box.innerHTML = `<div style="color:red; text-align:center;">Gagal memuat pesan: ${error.message}</div>`;
    return;
  }

  box.innerHTML = "";
  // Balik urutan data agar pesan terbaru ada di bawah (chronological)
  if (data) {
    data.reverse().forEach((msg) => renderMessage(msg));
  }
}

function initRealtime() {
  sb.channel("chat-global")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        renderMessage(payload.new);
      },
    )
    .subscribe();

  initPresence();
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
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      console.log("Joined:", key, newPresences);
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      console.log("Left:", key, leftPresences);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const presenceTrackStatus = await presenceChannel.track({
          user: currentUser,
          online_at: new Date().toISOString(),
        });
        console.log("Track Status:", presenceTrackStatus);
      }
    });
}

function updatePresenceUI(state) {
  const listEl = document.getElementById("admin-presence-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const onlineUsers = Object.keys(state);

  // Use a Set to avoid duplicates if same user has multiple tabs
  const uniqueUsers = [...new Set(onlineUsers)];

  uniqueUsers.forEach((user) => {
    // Simple display name from email/username
    const displayName = user.split("@")[0];

    const div = document.createElement("div");
    div.className = "status-item";
    div.innerHTML = `
      <div class="status-dot"></div>
      <div class="status-name">${displayName}</div>
    `;
    listEl.appendChild(div);
  });

  if (uniqueUsers.length === 0) {
    listEl.innerHTML =
      '<div style="font-size:12px; color:#7f91a4;">Tidak ada admin online</div>';
  }
}

// ENTER KEY
document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// GLOBAL TOOLS
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    document.getElementById("login-page").style.display !== "none"
  )
    doLogin();
  if (e.key === "Escape") closeZoom();
});

// =======================
// IMAGE ZOOM SYSTEM
// =======================

let zoomScale = 1;
let isDragging = false;
let startX,
  startY,
  translateX = 0,
  translateY = 0;

function openZoom(url) {
  const modal = document.getElementById("zoom-modal");
  const img = document.getElementById("zoom-img-target");
  img.src = url;
  modal.style.display = "flex";

  resetZoom();
}

function closeZoom() {
  document.getElementById("zoom-modal").style.display = "none";
}

function applyZoom(delta) {
  const oldScale = zoomScale;
  zoomScale += delta;
  if (zoomScale < 0.1) zoomScale = 0.1;
  if (zoomScale > 10) zoomScale = 10;
  updateZoomTransform();
}

function resetZoom() {
  zoomScale = 1;
  translateX = 0;
  translateY = 0;
  updateZoomTransform();
}

function updateZoomTransform() {
  const img = document.getElementById("zoom-img-target");
  if (img) {
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`;
  }
}

// Drag functionality
const container = document.getElementById("zoom-container");
if (container) {
  container.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    container.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateZoomTransform();
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    if (container) container.style.cursor = "grab";
  });

  // Mouse wheel zoom
  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      applyZoom(delta);
    },
    { passive: false },
  );
}

// Click background to close
document.getElementById("zoom-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "zoom-modal" || e.target.id === "zoom-container") {
    closeZoom();
  }
});

// ─────────────────────────────────────────────────────
//  ABSENSI BOTS (Simulasi "manusia" di room Absensi)
// ─────────────────────────────────────────────────────

function getJakartaParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function getJakartaDateKey(d = new Date()) {
  const p = getJakartaParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function isWithinAbsensiWorkWindow(d = new Date()) {
  const p = getJakartaParts(d);
  const cur = p.hour * 60 + p.minute;
  const start = 8 * 60; // 08:00
  const end = 20 * 60; // 20:00
  return cur >= start && cur <= end;
}

function formatJakartaTime(d = new Date()) {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
    hour12: false,
  });
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function loadBotAbsensiState(botName) {
  const key = `absensi_bot_${botName}`;
  const saved = localStorage.getItem(key);
  if (saved) return JSON.parse(saved);
  return {
    dateKey: null,
    masuk: null,
    wc: 0,
    makan: 0,
    pulang: null,
    masukMs: null,
    wcTimesMs: [],
    makanTimesMs: [],
    pulangMs: null,
  };
}

function saveBotAbsensiState(botName, st) {
  const key = `absensi_bot_${botName}`;
  localStorage.setItem(key, JSON.stringify(st));
}

async function insertBotActionToChat({ botName, room, text }) {
  // Hard guard: bots must never touch Worker Group
  if (!botMayPostToRoom(botName, room)) return;

  const notifyData = roomsSupported
    ? { username: botName, message: `<i>${text}</i>`, type: "action", room }
    : { username: botName, message: `<i>${text}</i>`, type: "action" };
  const { error } = await sb.from("messages").insert([notifyData]);
  if (error && error.message.includes('column "room" does not exist')) {
    roomsSupported = false;
    await sb
      .from("messages")
      .insert([
        { username: botName, message: `<i>${text}</i>`, type: "action" },
      ]);
  }
}

async function insertBotSummaryToAbsensi({ botName, st }) {
  const summary = `
    <div class="absensi-box">
      <div class="absensi-title">📊 ${botName}'s Summary</div>
      <div class="absensi-row masuk"><span>Check-in</span> <span>${st.masuk || "—"}</span></div>
      <div class="absensi-row wc"><span>WC Break</span> <span>${st.wc}x</span></div>
      <div class="absensi-row makan"><span>Meal Break</span><span>${st.makan}x</span></div>
      <div class="absensi-row pulang"><span>Check-out</span> <span>${st.pulang || "—"}</span></div>
    </div>`;

  const botData = roomsSupported
    ? { username: botName, message: summary, type: "bot", room: "absensi" }
    : { username: botName, message: summary, type: "bot" };
  const { error: err2 } = await sb.from("messages").insert([botData]);
  if (err2 && err2.message.includes('column "room" does not exist')) {
    roomsSupported = false;
    await sb
      .from("messages")
      .insert([{ username: botName, message: summary, type: "bot" }]);
  }
}

async function sendAbsensiBotAction(botName, actionText, now = new Date()) {
  const st = loadBotAbsensiState(botName);

  if (!isWithinAbsensiWorkWindow(now)) return;

  const nowMs = now.getTime();
  const dateKey = getJakartaDateKey(now);

  // reset if day changes
  if (st.dateKey !== dateKey) {
    st.dateKey = dateKey;
    st.masuk = null;
    st.wc = 0;
    st.makan = 0;
    st.pulang = null;
    st.masukMs = null;
    st.wcTimesMs = [];
    st.makanTimesMs = [];
    st.pulangMs = null;
  }

  if (actionText.includes("Masuk")) {
    st.masukMs = nowMs;
    st.masuk = formatJakartaTime(now);
    st.wc = 0;
    st.makan = 0;
    st.pulang = null;

    // Plan WC (max 5x) within ~15m, Makan (max 3x) within ~30m (simulated spacing)
    const totalWc = randInt(0, 5);
    const totalMakan = randInt(1, 3);

    st.wcTimesMs = Array.from({ length: totalWc }).map(
      (_, i) => nowMs + randInt(25, 55) * 1000 + i * randInt(25, 60) * 1000,
    );
    st.makanTimesMs = Array.from({ length: totalMakan }).map((_, i) => {
      const afterWcBase = st.wcTimesMs.length
        ? st.wcTimesMs[st.wcTimesMs.length - 1]
        : nowMs;
      return afterWcBase + randInt(60, 120) * 1000 + i * randInt(35, 85) * 1000;
    });

    const lastMakan = st.makanTimesMs.length
      ? st.makanTimesMs[st.makanTimesMs.length - 1]
      : afterSafe(nowMs);
    function afterSafe(t) {
      return t;
    }
    st.pulangMs = lastMakan + randInt(45, 120) * 1000;
  } else if (actionText.includes("WC")) {
    st.wc++;
  } else if (actionText.includes("Makan")) {
    st.makan++;
  } else if (actionText.includes("Pulang")) {
    st.pulang = formatJakartaTime(now);
    st.pulangMs = null;
  }

  saveBotAbsensiState(botName, st);

  // 1) action message in absensi room
  await insertBotActionToChat({ botName, room: "absensi", text: actionText });
  // 2) summary update
  await insertBotSummaryToAbsensi({ botName, st });
}

let _absensiBotLoopStarted = false;

function tickAbsensiBots() {
  if (!Array.isArray(ABSENSI_BOTS) || ABSENSI_BOTS.length === 0) return;
  if (!isWithinAbsensiWorkWindow(new Date())) return;

  const now = new Date();
  const nowMs = now.getTime();
  const dateKey = getJakartaDateKey(now);

  // Send at most one action per tick per bot
  ABSENSI_BOTS.forEach(async (botName) => {
    const st = loadBotAbsensiState(botName);

    if (st.dateKey !== dateKey) {
      st.dateKey = dateKey;
      st.masuk = null;
      st.wc = 0;
      st.makan = 0;
      st.pulang = null;
      st.masukMs = null;
      st.wcTimesMs = [];
      st.makanTimesMs = [];
      st.pulangMs = null;
      saveBotAbsensiState(botName, st);
    }

    if (!st.masukMs) {
      // start sometime inside window
      if (Math.random() < 0.18) {
        await sendAbsensiBotAction(botName, "Masuk Kerja", now);
      }
      return;
    }

    // WC (max 5x)
    if (st.wcTimesMs.length && st.wc < 5 && nowMs >= st.wcTimesMs[0]) {
      st.wcTimesMs.shift();
      saveBotAbsensiState(botName, st);
      await sendAbsensiBotAction(botName, "Ke WC (15m)", now);
      return;
    }

    // Makan (max 3x)
    if (st.makanTimesMs.length && st.makan < 3 && nowMs >= st.makanTimesMs[0]) {
      st.makanTimesMs.shift();
      saveBotAbsensiState(botName, st);
      await sendAbsensiBotAction(botName, "Istirahat Makan", now);
      return;
    }

    // Pulang
    if (st.pulangMs && nowMs >= st.pulangMs && !st.pulang) {
      st.pulangMs = null;
      saveBotAbsensiState(botName, st);
      await sendAbsensiBotAction(botName, "Pulang Kerja", now);
      return;
    }
  });
}

function startAbsensiBotsIfNeeded() {
  if (_absensiBotLoopStarted) return;
  _absensiBotLoopStarted = true;
}
