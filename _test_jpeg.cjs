const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const m = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const sb = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", m[1]);

(async () => {
  // Download a real JPEG photo (not PNG with transparency)
  const jpegUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png";
  
  const resp = await fetch("https://picsum.photos/400/300"); // random JPEG photo
  const buf = Buffer.from(await resp.arrayBuffer());
  const base64 = buf.toString("base64");
  const dataUri = `data:image/jpeg;base64,${base64}`;

  console.log("Downloaded test image:", buf.length, "bytes");

  const { data, error } = await sb
    .from("messages")
    .insert({
      username: "anan88",
      message: `${dataUri}|--CAPTION--|Test JPEG dari DB → Telegram (400x300)`,
      type: "image",
      room: "reject",
    })
    .select();

  if (error) {
    console.log("Insert error:", error.message);
  } else {
    console.log("✅ Inserted ID:", data[0].id);
    console.log("Cek grup reject...");
  }
})();
