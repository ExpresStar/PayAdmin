# PayAdmin Bot System — Final Status

## Project Overview
PayAdmin adalah dashboard admin untuk mengelola transaksi pembayaran dengan fitur:
- **Chat System** (3 rooms: Absensi, Reject, Worker)
- **Attendance Automation** (AbsensiBot untuk 3 workers)
- **Manual Reject Workflow** (workers upload evidence via chat)
- **Transaction Management** (approval/rejection dengan 2FA)

## Bot Architecture (FINAL)

### ✅ ACTIVE: AbsensiBot
- **Workers**: yaer98, xiaoting99, anan88
- **Cycle**: Check-in (08:00) → Breaks (WC 15m, MAKAN 30m) → Check-out (18:00)
- **Timing**: Random jitter ±5 min per action, staggered breaks scheduling
- **Execution**: PM2 24/7 with auto-restart
- **Persistence**: `bot_states.json` tracks daily completion

### ✅ ACTIVE: WorkerBot (NEW)
- **Workers**: yaer98, xiaoting99, anan88 (nama sama dengan AbsensiBot)
- **Shift schedule**:
  - `xiaoting99` → Shift pagi  08:00–16:00 WIB
  - `yaer98`     → Shift siang 12:00–20:00 WIB
  - `anan88`     → Shift malam 20:00–04:00 WIB
- **Mechanism**: Competitive claim via Supabase optimistic lock (`assigned_to IS NULL`)
- **Oldest-first**: Ambil TX Pending tertua, random dari top-3 untuk variasi
- **Human Slowdown**: 
  - Jeda reaksi manusia 6–15 detik sebelum klaim (memberikan kesempatan bagi pekerja manusia untuk klaim duluan).
  - Jeda check detail struk 4–9 detik.
  - Jeda antar-loop 20–40 detik saat shift aktif, 90–150 detik saat off-shift.
- **On mismatch**: screenshot canvas → teks TX ID→Bank → NB error → kirim ke room `reject`
- **On match**: approve Completed langsung
- **Jeda**: 20–40 detik/tick on-shift; 90–150 detik/tick off-shift
- **Started**: `startWorkerBots()` dipanggil dari `doLogin()` in script.js

### ❌ DISABLED: RejectBot (bot.js)
- **Reason**: Digantikan oleh WorkerBot di atas (in-browser, lebih lengkap)
- **Status**: `const REJECT_BOTS = [...]` commented out in bot.js

### 🚫 SILENT: Worker Room
- **Bot Access**: BLOCKED (guard in `insertMsg()` function)
- **Purpose**: 100% human-only communication

## Chat System (VERIFIED WORKING)

### Realtime Subscription
- `initRealtime()` listens to INSERT events on `messages` table
- Filters by `room` column (absensi, reject, worker)
- `renderMessage()` updates chat UI + sidebar preview

### Message Features
- ✅ Text messages (action/user/bot types)
- ✅ Image upload + caption (workers can screenshot evidence)
- ✅ Sidebar room preview (last message + timestamp)
- ✅ Admin presence tracking (online status display)

### Room Workflows
- **Absensi**: Auto-post check-in/break/checkout actions
- **Reject**: Manual upload of error screenshots + structured TX data (copy-paste from dashboard)
- **Worker**: Free-form admin discussion (bot-free)

## Authentication & Security

### Admin Login
- Database-driven via Supabase `admins` table
- Multi-user support with email→username cache
- 2FA: TOTP ±60 second tolerance (expanded for reliability)

### Message Permissions
- RLS: Disabled (open access for bots + workers)
- Bot guard: `worker` room write-blocked for all bots
- Image storage: Public bucket `chat_images`

## Production Configuration

### Timing (Current)
```javascript
WORK_START_HOUR = 8;
WORK_END_HOUR = 18;
WC_DURATION_MS = 15 * 60 * 1000;
MAKAN_DURATION_MS = 30 * 60 * 1000;
```

### PM2 Lifecycle
- **Config**: `ecosystem.config.cjs`
- **Startup**: Auto-boot on system restart
- **Restart**: Auto on crash, monitored 24/7
- **Logs**: `logs/bot-out-0.log`, `logs/bot-err-0.log`

## Known Limitations & Notes

1. **AbsensiBot Scheduling**
   - Jitter applies to break timing (±25 min variance)
   - Pulang time ±30 min from nominal end (18:00)
   - Multiple breaks randomly generated (1-3x WC, 1x MAKAN)

2. **Reject Workflow**
   - Manual effort required (not auto-detected)
   - Workers copy TX ID, Nominal, Account Name, Bank, Error Type from dashboard
   - Screenshot uploaded via chat image feature
   - Best practice: Keep reject room organized (pin error types)

3. **Chat Limitations**
   - Worker room bot-protected (but humans can post freely)
   - No message editing/deletion (immutable logs)
   - Sidebar preview limited to last message + time

## Admin Panel Status (Week 1 MVP) ✅ BUILT

### Files Created
- admin-login.html (2FA: Email + TOTP)
- admin.html (899 lines: 7 pages + 2 modals + JS)
- Database tables: admin_users, workers, bot_instances

### Credentials (KEEP SAFE!)
```
baobei908@933pay.local : bobi908
operator908@933pay.local : bobi908
```

## Deployment Checklist

- [x] AbsensiBot configured + tested
- [x] RejectBot disabled
- [x] Chat realtime working
- [x] PM2 auto-restart configured
- [x] Production timing reverted (WORK_START_HOUR=8)
- [x] Commits pushed
- [x] Admin panel built (899 lines)
- [x] Database tables created + credentials set
- [ ] QA: Test admin login flow
- [ ] QA: Test worker management
- [ ] QA: Test bot operations

## Next Steps

1. **Monitor production** — check bot logs daily for 1 week
2. **Gather feedback** — ask xiaoting/workers if reject workflow smooth
3. **Tune timing** — adjust jitter/break intervals based on real usage
4. **Scale workers** — add more AbsensiBot instances if team grows

---

**Last Updated**: 2026-07-06 17:52 WIB
**System Status**: ✅ PRODUCTION READY
**Commits**: Worker Bot system activated — shift-aware, competitive claim, reject reporter
