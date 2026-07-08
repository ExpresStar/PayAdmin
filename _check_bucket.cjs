const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const m = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const sb = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", m[1]);

(async () => {
  // Test 1: Upload a tiny test image
  const imgBuf = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAVCAYAAAARV3wCAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAI0lEQVQYV2N8+vD/fwYjI0MGAyMDw1AGhkr4DwMDw1AuAABMDQ8BNqGkGgAAAABJRU5ErkJggg==",
    "base64"
  );

  const fileName = `test_${Date.now()}.png`;
  const filePath = `chat_images/${fileName}`;

  console.log("Uploading to:", filePath);
  const { error: upErr } = await sb.storage.from("chat_images").upload(filePath, imgBuf, {
    contentType: "image/png",
    upsert: true
  });
  if (upErr) {
    console.log("Upload error:", upErr.message);
    // Try creating bucket
    console.log("Trying to create bucket...");
    const { error: createErr } = await sb.storage.createBucket("chat_images", {
      public: true
    });
    if (createErr) console.log("Create error:", createErr.message);
    else {
      console.log("Bucket created! Re-uploading...");
      const { error: up2 } = await sb.storage.from("chat_images").upload(filePath, imgBuf, {
        contentType: "image/png",
        upsert: true
      });
      if (up2) console.log("Upload after create error:", up2.message);
      else console.log("✅ Upload success after bucket creation");
    }
  } else {
    console.log("✅ Upload success");
  }

  const url = sb.storage.from("chat_images").getPublicUrl(filePath);
  console.log("Public URL:", url.data.publicUrl);

  // Test if Telegram can access this URL
  try {
    const resp = await fetch(url.data.publicUrl);
    console.log("URL accessible:", resp.ok, resp.status);
  } catch (e) {
    console.log("URL fetch error:", e.message);
  }
})();
