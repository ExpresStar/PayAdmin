const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const m = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const sb = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", m[1]);

(async () => {
  // Create a larger image (200x200 gradient with visible content)
  const width = 400, height = 300;
  const channels = 4;
  const raw = Buffer.alloc(width * height * channels, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = Math.min(255, x + y);         // R
      raw[i+1] = Math.min(255, x);            // G
      raw[i+2] = Math.min(255, y);            // B
      raw[i+3] = 255;                         // A
    }
  }

  // Convert raw RGBA to PNG using minimal approach
  // Since we can't use sharp/pngjs, use a pre-encoded larger PNG
  // Read the existing 1x1 and make it bigger... no, let me use a different approach:
  // Embed a proper PNG that's 200x200 with some visible content
  
  // Actually let me just use a proper large PNG that I can create with a simple known PNG
  // Or better: use a publicly accessible image URL for the test
  // Let me try with a known-good URL first to verify the multipart works
  
  const testUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png";
  
  // Download it
  const resp = await fetch(testUrl);
  const buf = Buffer.from(await resp.arrayBuffer());
  const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
  
  console.log("Downloaded test image:", buf.length, "bytes");
  console.log("Data URI length:", dataUri.length, "chars");

  const { data, error } = await sb
    .from("messages")
    .insert({
      username: "anan88",
      message: `${dataUri}|--CAPTION--|Test gambar dari DB → Telegram (200x300 PNG asli)`,
      type: "image",
      room: "reject",
    })
    .select();

  if (error) {
    console.log("Insert error:", error.message);
  } else {
    console.log("✅ Inserted ID:", data[0].id);
    console.log("Cek grup reject...");

    await new Promise(r => setTimeout(r, 5000));
    
    const log = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\logs\\telegram-out-5.log", "utf8");
    const lines = log.split("\n").slice(-20);
    for (const line of lines) {
      if (line.includes("sendPhoto") || line.includes("EVENT") || line.includes("Forwarded") || line.includes("error") || line.includes("multipart")) {
        console.log("  LOG:", line.trim());
      }
    }
  }
})();
