const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const match = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const sb = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", match[1]);

(async () => {
  console.log("Inserting test message...");
  const { data, error } = await sb.from("messages").insert({
    username: "SystemTest",
    message: "TEST " + Date.now(),
    type: "user",
    room: "absensi"
  }).select();
  if (error) console.error("ERR:", error.message);
  else console.log("Inserted:", data[0]?.id);
  await new Promise(r => setTimeout(r, 3000));
  console.log("Done waiting - check Telegram");
})();
