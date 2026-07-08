const fs = require("fs");
const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const tMatch = code.match(/TELEGRAM_TOKEN\s*=\s*["']([^"']+)/);
const token = tMatch[1];

(async () => {
  // Test 1: Direct sendMessage
  const r1 = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: -5241237412,
      text: "✅ Langsung dari script — " + new Date().toLocaleTimeString("en-GB", {timeZone:"Asia/Jakarta"}),
      parse_mode: "HTML"
    })
  });
  const d1 = await r1.json();
  console.log("SendMessage:", d1.ok ? "✅ OK" : "❌ FAIL", d1.description || "");
  
  // Test 2: Check updates for bot's messages
  const r2 = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offset: -20, limit: 20 })
  });
  const d2 = await r2.json();
  if (d2.ok && d2.result) {
    for (const u of d2.result) {
      const m = u.message;
      if (m && m.chat?.id === -5241237412) {
        console.log("  Msg dalam grup:", m.text?.substring(0, 60) || "[non-text]", "- dari:", m.from?.is_bot ? "BOT" : "USER");
      }
    }
  }
})();
