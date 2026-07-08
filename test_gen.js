let lastTime = Date.now();
function getTrafficConfig() {
  const h = new Date().getHours(); // local time (assumed WIB on client)

  // Dinamis: jam ramai lebih cepat, jam sepi lebih lambat
  if (h >= 8 && h < 22) {
    // Peak hours: 08:00-21:59
    return {
      insertDelay: [1200, 2400], // 1.2s - 2.4s antar transaksi baru
      processDelay: [4000, 9000], // 4s - 9s untuk alur proses
    };
  } else if ((h >= 6 && h < 8) || (h >= 22 && h < 24)) {
    // Shoulder hours: 06:00-07:59 & 22:00-23:59
    return {
      insertDelay: [2500, 4200],
      processDelay: [7000, 14000],
    };
  } else {
    // Quiet hours: 00:00-05:59
    return {
      insertDelay: [4500, 8000],
      processDelay: [10000, 18000],
    };
  }
}

// ─────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────
function fmtAmount(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("vi-VN") + " VND";
}

function fmtTime(iso) {
  if (!iso) return '<span style="color:#ccc">—</span>';

  const d = new Date(iso);

  // tambah +7 jam manual (WIB)
  d.setHours(d.getHours() + 7);

  const date = d.toLocaleDateString("id-ID");
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return `<span class="td-time">${date}<br>${time}</span>`;
}

function statusBadge(status) {
  const map = {
    Pending: "badge badge-pending",
    Processing: "badge badge-processing",
    Completed: "badge badge-completed",
    Failed: "badge badge-failed",
  };
  return `<span class="${map[status] || "badge"}">${status || "—"}</span>`;
}


console.log(generateSmartTransaction(0));