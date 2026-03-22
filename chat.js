// =======================
// CONFIG SUPABASE
// =======================

const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdXF3ZnBuenlsb3NxZm1tdWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODY4ODYsImV4cCI6MjA4OTU2Mjg4Nn0.mOum9c_e5w9SqiKLzVb1ZihmtAaUtqMJOulyPLmbC-c"; 
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// STATE
// =======================

let currentUser = ""; 
let activeRoom = "worker"; // default room
let presenceChannel = null; // ⬅️ Global agar bisa ditutup saat logout
let absensiState = {
  masuk: null,
  wc: 0,
  makan: 0,
  pulang: null
};

// AUTO OFFLINE SAAT TAB DITUTUP
window.addEventListener('beforeunload', () => {
  if (presenceChannel) sb.removeChannel(presenceChannel);
});

const ROOM_NAMES = {
  absensi: "📊 ABSENSI",
  reject: "❌ REJECT FAILED",
  worker: "👥 WORKER GROUP"
};

// =======================
// AUTH LOGIN
// =======================

async function doLogin() {
  const emailInput = document.getElementById("login-user");
  const passInput = document.getElementById("login-pass");
  const codeInput = document.getElementById("login-2fa");
  const errorEl = document.getElementById("login-error");
  
  const email = emailInput.value.trim();
  const password = passInput.value;
  const twoFACode = codeInput.value.trim();

  if (!email || !password || !twoFACode) {
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

  const MASTER_SECRET = "PAYADMIN24MSTRKY";
  try {
    const cleanCode = twoFACode.replace(/\s/g, "");
    const isValid = otplib.authenticator.check(cleanCode, MASTER_SECRET);
    if (!isValid) {
      errorEl.style.display = "block";
      errorEl.textContent = `⚠ Invalid 2FA Code.`;
      return;
    }
  } catch (err) {
    errorEl.style.display = "block";
    errorEl.textContent = `⚠ Security Error.`;
    return;
  }

  currentUser = data.user.email;
  loadAbsensiState(); // Restore previous state for this user

  document.getElementById("login-page").style.display = "none";
  document.getElementById("chat-ui").style.display = "flex";

  switchRoom('worker'); // Start in worker group
  initRealtime();
}

// 🔐 AUTO-LOGIN CHECK (Shared Session)
async function checkExistingSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    console.log("Found existing session for:", session.user.email);
    currentUser = session.user.email;
    loadAbsensiState();
    document.getElementById("login-page").style.display = "none";
    document.getElementById("chat-ui").style.display = "flex";
    switchRoom('worker');
    initRealtime();
  }
}
checkExistingSession();

function saveAbsensiState() {
  if (currentUser) {
    localStorage.setItem(`absensi_${currentUser}`, JSON.stringify(absensiState));
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
  document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`room-${roomId}`).classList.add('active');

  document.getElementById('active-room-title').textContent = ROOM_NAMES[roomId];
  document.getElementById('active-room-subtitle').textContent = roomId === 'absensi' ? 'Hanya log absensi' : 'online';

  // Toggle Input (Absensi room can't type)
  const inputContainer = document.getElementById('msg-input-container');
  const toolbar = document.getElementById('absensi-toolbar');

  if (roomId === 'absensi') {
    // Absensi: Tampilkan Tombol, Sembunyikan Ketikan
    toolbar.style.display = 'flex';
    inputContainer.style.display = 'none';
  } else {
    // Lainnya: Sembunyikan Tombol, Tampilkan Ketikan
    toolbar.style.display = 'none';
    inputContainer.style.display = 'flex';
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

  const msgData = { username: currentUser, message: msg, type: "user", room: activeRoom };

  console.log("Attempting to send:", msgData);
  const { error } = await sb.from("messages").insert([msgData]);

  if (error) {
    console.error("Insert error:", error);
    if (error.message.includes('column "room" does not exist')) {
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
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  if (text.includes("Masuk")) {
    // Reset state jika absen masuk baru
    absensiState = { masuk: now, wc: 0, makan: 0, pulang: null };
  }
  else if (text.includes("WC")) absensiState.wc++;
  else if (text.includes("Makan")) absensiState.makan++;
  else if (text.includes("Pulang")) {
    absensiState.pulang = now;
  }

  saveAbsensiState(); // Simpan perubahan agar tidak hilang saat refresh

  // Notification to current room
  const notifyData = { username: currentUser, message: `<i>${text}</i>`, type: "action", room: activeRoom };
  const { error: err1 } = await sb.from("messages").insert([notifyData]);
  if (err1 && err1.message.includes('column "room" does not exist')) {
    await sb.from("messages").insert([{ username: currentUser, message: `<i>${text}</i>`, type: "action" }]);
  }

  // Summary to Absensi room
  const summary = `
  <div class="absensi-box">
    <div class="absensi-title">📊 ${currentUser}'s Summary</div>
    <div class="absensi-row masuk"><span>Check-in</span> <span>${absensiState.masuk || "—"}</span></div>
    <div class="absensi-row wc"><span>WC Break</span> <span>${absensiState.wc}x</span></div>
    <div class="absensi-row makan"><span>Meal Break</span><span>${absensiState.makan}x</span></div>
    <div class="absensi-row pulang"><span>Check-out</span> <span>${absensiState.pulang || "—"}</span></div>
  </div>`;

  const botData = { username: "BOT", message: summary, type: "bot", room: "absensi" };
  const { error: err2 } = await sb.from("messages").insert([botData]);
  if (err2 && err2.message.includes('column "room" does not exist')) {
    await sb.from("messages").insert([{ username: "BOT", message: summary, type: "bot" }]);
  }
}

function getUserColor(username) {
  const colors = [
    "#3498db", "#e67e22", "#2ecc71", "#f1c40f", "#9b59b6", "#1abc9c", "#e74c3c", "#7ab9f1", "#ff784e", "#a29bfe"
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function renderMessage(m) {
  const msgRoom = (m.room || 'worker').toLowerCase();
  const currentActive = (activeRoom || 'worker').toLowerCase();

  if (msgRoom !== currentActive) {
    updateSidebarPreview(m);
    return;
  }

  const box = document.getElementById("chat-box");
  const username = m.username || "Admin";
  const message = m.message || "";
  const type = m.type || "user";
  
  let rawDate = m.created_at;
  if (rawDate && !rawDate.includes('Z') && !rawDate.includes('+')) rawDate = rawDate.replace(' ', 'T') + 'Z'; 
  const dateObj = rawDate ? new Date(rawDate) : new Date();
  const timeStr = dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

  const wrapper = document.createElement("div");
  wrapper.className = "tg-msg-wrapper";

  const div = document.createElement("div");
  div.className = "msg " + (username === currentUser ? "me" : "other");
  if (type === "bot") div.style.background = "transparent", div.style.boxShadow = "none", div.style.padding = "0";

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

    html += `<img src="${imgUrl}" class="msg-img" onclick="window.open('${imgUrl}', '_blank')" />`;
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

// =======================
// IMAGE PREVIEW & UPLOAD
// =======================

let pendingImageFile = null;

function showImagePreview(file) {
  if (!file || !file.type.startsWith('image/')) return;
  pendingImageFile = file;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('preview-img-target').src = e.target.result;
    document.getElementById('image-preview-modal').style.display = 'flex';
    document.getElementById('preview-caption').value = '';
    document.getElementById('preview-caption').focus();
  };
  reader.readAsDataURL(file);
}

function closePreview() {
  document.getElementById('image-preview-modal').style.display = 'none';
  pendingImageFile = null;
}

async function confirmSendImage() {
  if (!pendingImageFile) return;
  
  const btn = document.getElementById('preview-send-btn');
  const caption = document.getElementById('preview-caption').value.trim();
  
  btn.disabled = true;
  btn.innerText = "SENDING...";

  try {
    const file = pendingImageFile;
    const fileExt = file.name ? file.name.split('.').pop() : 'png';
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `chat_images/${fileName}`;

    // 1. Upload
    const { error: uploadError } = await sb.storage.from('chat_images').upload(filePath, file);
    if (uploadError) throw uploadError;

    // 2. URL
    const { data: publicUrlData } = sb.storage.from('chat_images').getPublicUrl(filePath);
    const imageUrl = publicUrlData.publicUrl;

    // 3. Insert message
    const finalMessage = caption ? `${imageUrl}|--CAPTION--|${caption}` : imageUrl;
    
    const msgData = { 
      username: currentUser, 
      message: finalMessage, 
      type: "image", 
      room: activeRoom 
    };

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
document.getElementById('chat-input').addEventListener('paste', async (event) => {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;
  
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      showImagePreview(file);
      event.preventDefault();
    }
  }
});

function updateSidebarPreview(m) {
  const room = m.room || 'worker';
  const previewEl = document.getElementById(`preview-${room}`);
  const timeEl = document.getElementById(`time-${room}`);
  
  if (previewEl) {
    let cleanMsg = m.message.replace(/<[^>]*>?/gm, '');
    previewEl.textContent = `${m.username}: ${cleanMsg}`;
  }
  
  if (timeEl) {
    let dateObj = m.created_at ? new Date(m.created_at) : new Date();
    timeEl.textContent = dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  }
}

async function loadMessages() {
  const box = document.getElementById("chat-box");
  box.innerHTML = `<div style="text-align:center; color:var(--tg-text-muted); margin-top:20px;">Memuat riwayat...</div>`;

  console.log("Memuat pesan untuk room:", activeRoom);
  
  let query = sb.from("messages").select("*");
  if (activeRoom) {
    query = query.eq('room', activeRoom.toLowerCase());
  }
  
  // Ambil 50 pesan TERBARU (descending)
  let { data, error } = await query.order("created_at", { ascending: false }).limit(50);

  if (error && error.message.includes('column "room" does not exist')) {
    const fallback = await sb.from("messages").select("*").order("created_at", { ascending: false }).limit(50);
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
    data.reverse().forEach(msg => renderMessage(msg));
  }
}

function initRealtime() {
  sb.channel("chat-global")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
      renderMessage(payload.new);
    })
    .subscribe();

  initPresence();
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
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('Joined:', key, newPresences);
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
       console.log('Left:', key, leftPresences);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const presenceTrackStatus = await presenceChannel.track({
          user: currentUser,
          online_at: new Date().toISOString(),
        });
        console.log('Track Status:', presenceTrackStatus);
      }
    });
}

function updatePresenceUI(state) {
  const listEl = document.getElementById('admin-presence-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const onlineUsers = Object.keys(state);
  
  // Use a Set to avoid duplicates if same user has multiple tabs
  const uniqueUsers = [...new Set(onlineUsers)];

  uniqueUsers.forEach(user => {
    // Simple display name from email/username
    const displayName = user.split('@')[0];
    
    const div = document.createElement('div');
    div.className = 'status-item';
    div.innerHTML = `
      <div class="status-dot"></div>
      <div class="status-name">${displayName}</div>
    `;
    listEl.appendChild(div);
  });

  if (uniqueUsers.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px; color:#7f91a4;">Tidak ada admin online</div>';
  }
}

// ENTER KEY
document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// GLOBAL TOOLS
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.getElementById("login-page").style.display !== "none") doLogin();
});
