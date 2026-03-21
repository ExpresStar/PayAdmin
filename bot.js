import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mfuqwfpnzylosqfmmuic.supabase.co";
const SUPABASE_KEY = "PASTE_ANON_KEY_LO_DI_SINI";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function generateTransaction() {
  const names = ["Nguyen Van A", "Tran Thi B", "Le Minh C"];
  const banks = ["Vietcombank", "MB Bank", "BIDV", "ACB"];

  return {
    transaction_id: "TX" + Date.now(),
    order_id: "ORD" + Math.floor(Math.random() * 100000),
    account_number: "0" + Math.floor(100000000 + Math.random() * 900000000),
    account_name: names[Math.floor(Math.random() * names.length)],
    bank_name: banks[Math.floor(Math.random() * banks.length)],
    amount: Math.floor(Math.random() * 5000000) + 50000,
    status: "Pending",
    created_at: new Date().toISOString(),
  };
}

async function runBot() {
  const tx = generateTransaction();

  const { error } = await sb.from("transactions").insert(tx);

  if (error) {
    console.error("ERROR:", error);
  } else {
    console.log("SUCCESS INSERT:", tx.transaction_id);
  }
}

runBot();
