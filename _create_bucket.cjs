const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const ANON_KEY = (() => {
  const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
  const m = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
  return m[1];
})();

async function tryAdmin() {
  // Try logging in as admin to get a session
  const sb = createClient(SUPABASE_URL, ANON_KEY);

  // Try login with known admin credentials
  const { data: loginData, error: loginErr } = await sb.auth.signInWithPassword({
    email: "baobei908@933pay.local",
    password: "bobi908"
  });

  if (loginErr) {
    console.log("Login 1 error:", loginErr.message);
    // Try second admin
    const { data: d2, error: e2 } = await sb.auth.signInWithPassword({
      email: "operator908@933pay.local",
      password: "bobi908"
    });
    if (e2) {
      console.log("Login 2 error:", e2.message);
      return null;
    }
    console.log("✅ Login as operator908 success");
    console.log("Session:", d2.session ? "YES" : "NO");
    return d2.session;
  }

  console.log("✅ Login as baobei908 success");
  console.log("Session:", loginData.session ? "YES" : "NO");
  return loginData.session;
}

(async () => {
  const session = await tryAdmin();
  if (!session) return;

  const accessToken = session.access_token;

  // Try create bucket using access token
  console.log("\nTrying to create bucket with admin session...");
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: "chat_images",
      name: "chat_images",
      public: true,
      file_size_limit: 5242880,
      allowed_mime_types: ["image/png", "image/jpeg", "image/gif", "image/webp"]
    })
  });

  const result = await resp.json();
  console.log("Create bucket result:", JSON.stringify(result, null, 2));

  // Try upload a test image
  if (result.id === "chat_images" || resp.ok) {
    console.log("\n✅ Bucket ready! Testing upload...");
    const imgBuf = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAVCAYAAAARV3wCAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAI0lEQVQYV2N8+vD/fwYjI0MGAyMDw1AGhkr4DwMDw1AuAABMDQ8BNqGkGgAAAABJRU5ErkJggg==",
      "base64"
    );

    const { error: upErr } = await sb.storage.from("chat_images").upload(
      `chat_images/test_${Date.now()}.png`,
      imgBuf,
      { contentType: "image/png", upsert: true }
    );

    if (upErr) console.log("Upload error:", upErr.message);
    else console.log("✅ Upload test OK!");
  }

  // Now set RLS policies for anon access
  console.log("\nSetting RLS policies for bucket...");
  const sql = `
    CREATE POLICY IF NOT EXISTS "chat_images_public_select"
    ON storage.objects FOR SELECT USING (bucket_id = 'chat_images');

    CREATE POLICY IF NOT EXISTS "chat_images_anon_insert"
    ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat_images');
  `;

  // Try via management API
  const mgmtResp = await fetch(
    `https://api.supabase.com/v1/projects/mfuqwfpnzylosqfmmuic/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: sql })
    }
  );
  const mgmtResult = await mgmtResp.text();
  console.log("SQL result:", mgmtResult.substring(0, 200));
})();
