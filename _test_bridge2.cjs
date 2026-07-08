const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://mfuqwfpnzylosqfmmuic.supabase.co",
  "eyJhbG…bC-c"
);
(async () => {
  const { data, error } = await sb.from("messages").insert({
    username: "SystemTest",
    message: "🕐 Test WIB realtime — " + new Date().toLocaleTimeString("en-GB", {timeZone:"Asia/Jakarta"}),
    type: "user",
    room: "absensi"
  }).select();
  if (error) console.error("ERR:", error.message);
  else console.log("Inserted:", data[0]?.id);
})();
