const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const match = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
if (!match) { console.error("Key not found"); process.exit(1); }

const key = match[1];
const sb = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", key);

(async () => {
  const { data, error } = await sb.from("messages").insert({
    username: "SystemTest",
    message: "⏰ Test waktu realtime WIB — " + new Date().toLocaleTimeString("en-GB", {timeZone:"Asia/Jakarta"}),
    type: "user",
    room: "absensi"
  }).select();
  if (error) console.error("ERR:", error.message);
  else console.log("Inserted:", data[0]?.id);
})();
