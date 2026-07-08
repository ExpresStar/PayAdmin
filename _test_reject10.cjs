const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const code = fs.readFileSync("telegram-bot.cjs", "utf8");
const match = code.match(/SUPABASE_KEY\s*=\s*["']([^"']+)/);
const supabase = createClient("https://mfuqwfpnzylosqfmmuic.supabase.co", match[1]);

const samples = [
  { bank: "BCA", nominal: "Rp150.000", txId: "INV-20260707-001", akun: "Sari Dewi", error: "Nama tidak sesuai KTP" },
  { bank: "MANDIRI", nominal: "Rp250.000", txId: "INV-20260707-002", akun: "Budi Santoso", error: "Nomor rekening salah" },
  { bank: "BNI", nominal: "Rp1.200.000", txId: "INV-20260707-003", akun: "Citra Lestari", error: "Bank tujuan berbeda" },
  { bank: "BRI", nominal: "Rp375.000", txId: "INV-20260707-004", akun: "Agus Wijaya", error: "Limit transfer terlampaui" },
  { bank: "PERMATA", nominal: "Rp500.000", txId: "INV-20260707-005", akun: "Dian Permata", error: "Rekening tidak aktif" },
  { bank: "BCA", nominal: "Rp890.000", txId: "INV-20260707-006", akun: "Rudi Hartono", error: "Nama rekening berbeda" },
  { bank: "MANDIRI", nominal: "Rp65.000", txId: "INV-20260707-007", akun: "Ani Rahayu", error: "Jumlah tidak sesuai" },
  { bank: "BNI", nominal: "Rp1.500.000", txId: "INV-20260707-008", akun: "Tono Suharto", error: "Melebihi saldo" },
  { bank: "BRI", nominal: "Rp420.000", txId: "INV-20260707-009", akun: "Maya Indah", error: "Waktu habis/timeout" },
  { bank: "BCA", nominal: "Rp2.000.000", txId: "INV-20260707-010", akun: "Hendra Gunawan", error: "Duplikat transaksi" },
];

const imageUrls = [
  "https://images.unsplash.com/photo-1616077168070-5cb5f5f0a3b0?w=400",
  "https://images.unsplash.com/photo-1616627561742-5e9565e8b9b0?w=400",
  "https://images.unsplash.com/photo-1621293954908-907159247fc8?w=400",
  "https://images.unsplash.com/photo-1616077168070-5cb5f5f0a3b1?w=400",
];

async function main() {
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const isGenap = i % 2 === 0;
    const username = i % 2 === 0 ? "xiaoting99" : "yaer98";

    const msg = isGenap
      ? `─── NOTA REJECT ───\nTX ID: ${s.txId}\nAkun: ${s.akun}\nNominal: ${s.nominal}\nBank: ${s.bank}\nError: ${s.error}\n─────────────────`
      : `❌ GAGAL\n━━━━━━━━━━━━━\nTX : ${s.txId}\nAkun : ${s.akun}\nNominal : ${s.nominal}\nBank : ${s.bank}\nKeterangan : ${s.error}\n━━━━━━━━━━━━━`;

    const useImage = i >= 5;
    let finalMessage = msg;
    let msgType = "user";

    if (useImage) {
      finalMessage = `${imageUrls[i % imageUrls.length]}|--CAPTION--|📋 ${s.txId} | ${s.akun} | ${s.nominal} | ${s.bank}\n❌ ${s.error}`;
      msgType = "image";
    }

    const { data, error } = await supabase.from("messages").insert({
      username,
      message: finalMessage,
      type: msgType,
      room: "reject"
    }).select();

    if (error) console.error(`${i+1}. ❌ ${error.message}`);
    else console.log(`${i+1}. ✅ ${s.txId} — ${s.error} (${msgType})`);
  }
  console.log("\n✅ Selesai! 10 nota reject terkirim.");
}

main();
