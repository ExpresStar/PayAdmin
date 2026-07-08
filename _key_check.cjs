const fs = require("fs");
const c = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const m = c.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
if (m) {
  const key = m[1];
  console.log("Length:", key.length);
  for (let i = 0; i < Math.min(key.length, 20); i++) {
    console.log(i + ": " + key.charCodeAt(i) + " (" + key[i] + ")");
  }
}
