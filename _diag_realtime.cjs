const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const code = fs.readFileSync("C:\\Users\\Willyandi Wu\\Documents\\918payv3\\telegram-bot.cjs", "utf8");
const match = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const supabase = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", match[1]);

console.log("=== Testing Supabase Realtime ===");

// 1. Subscribe to messages INSERT
const channel = supabase.channel("test-diagnostic");
channel
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "messages" },
    (payload) => {
      console.log("✅ REALTIME EVENT RECEIVED!", payload.new?.id);
      process.exit(0);
    }
  )
  .subscribe((status) => {
    console.log("Subscription status:", status);
    if (status === "SUBSCRIBED") {
      // 2. Insert a test message
      console.log("Inserting test message...");
      supabase.from("messages").insert({
        username: "DiagTest",
        message: "REALTIME DIAG " + Date.now(),
        type: "user",
        room: "absensi"
      }).select().then(({ data, error }) => {
        if (error) console.error("Insert error:", error.message);
        else console.log("✅ Inserted:", data[0]?.id, "Waiting for Realtime event...");
      });
      
      // 3. Timeout after 10 seconds
      setTimeout(() => {
        console.log("⏰ TIMEOUT - No Realtime event received");
        console.log("Realtime might not be enabled on 'messages' table!");
        console.log("Go to Supabase Dashboard → Database → Replication");
        console.log("→ Enable 'messages' table for Realtime");
        channel.unsubscribe();
        process.exit(1);
      }, 10000);
    }
  });
