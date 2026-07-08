const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://mfuqwfpnzylosqfmmuic.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdXF3ZnBuenlsb3NxZm1tdWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODY4ODYsImV4cCI6MjA4OTU2Mjg4Nn0.mOum9c_e5w9SqiKLzVb1ZihmtAaUtqMJOulyPLmbC-c"
);
(async () => {
  const { data, error } = await sb.from("messages").insert({
    username: "SystemTest",
    message: "⏰ Test jam realtime — sekarang harus jam malam",
    type: "user",
    room: "absensi"
  }).select();
  if (error) console.error("ERR:", error.message);
  else console.log("Inserted:", data[0]?.id);
})();
