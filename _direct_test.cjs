const fs = require("fs");
const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");

// Extract token
const tMatch = code.match(/TELEGRAM_TOKEN\s*=\s*["']([^"']+)/);
const token = tMatch[1];

// Extract supabase key
const sMatch = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", sMatch[1]);

// Test 1: Send direct to Telegram
fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: -5241237412,
    text: "🧪 Direct test — WIB " + new Date().toLocaleTimeString("en-GB", {timeZone:"Asia/Jakarta"}),
    parse_mode: "HTML"
  })
}).then(r => r.json()).then(d => {
  console.log("Test 1 - SendMessage:", d.ok ? "✅ OK" : "❌ FAIL", d.description || "");
  
  // Test 2: Insert via Supabase
  return supabase.from("messages").insert({
    username: "DirectTest",
    message: "🧪 Via Supabase — " + new Date().toLocaleTimeString("en-GB", {timeZone:"Asia/Jakarta"}),
    type: "user",
    room: "absensi"
  }).select();
}).then(({ data, error }) => {
  if (error) console.log("Test 2 - Insert:", "❌", error.message);
  else console.log("Test 2 - Insert: ✅", data[0]?.id);
  
  // Wait and check Realtime
  setTimeout(() => console.log("\n✅ Cek Telegram — 2 pesan harus masuk di grup 933Pay 考勤"), 2000);
});
