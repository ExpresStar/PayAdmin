const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const match = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const supabase = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", match[1]);

(async () => {
  // Check if Realtime is enabled on messages table
  const { data, error } = await supabase.rpc("get_publication_tables");
  if (error) {
    console.log("RPC not available, checking via SQL...");
    // Try direct query
    const { data: d2, error: e2 } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true });
    if (e2) console.log("Query error:", e2.message);
    else console.log("messages table accessible, count:", d2?.length || 0);
  } else {
    console.log("Publication tables:", JSON.stringify(data));
  }

  // Try to enable realtime on messages table via the management API
  console.log("\nAttempting to enable Realtime on messages table...");
  
  // Method 1: Using sql endpoint with service_role
  const sql = `
    BEGIN;
      -- Drop existing publication if exists
      DROP PUBLICATION IF EXISTS supabase_realtime;
      CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
      -- Add messages table to realtime
      ALTER PUBLICATION supabase_realtime ADD TABLE ONLY messages;
    COMMIT;
  `;

  // We need service_role key for this - try the anon key approach
  // Actually, just alter the table
  try {
    const { error: alterErr } = await supabase.rpc("exec_sql", { sql_text: "ALTER TABLE messages REPLICA IDENTITY FULL;" });
    if (alterErr) console.log("alter rpc error:", alterErr.message);
    else console.log("✅ Replica identity set!");
  } catch (e) {
    console.log("Can't alter via RPC:", e.message);
  }
  
  console.log("\nDone. Checking subscription...");
})();
