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

### ❌ DISABLED: RejectBot
- **Reason**: Workers handle reject room manually (they upload screenshot + copy TX data)
- **Status**: `const REJECT_BOTS = [...]` commented out in bot.js
- **Alternative**: Manual workflow in chat image upload feature

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

## Deployment Checklist

- [x] AbsensiBot configured + tested
- [x] RejectBot disabled
- [x] Chat realtime working
- [x] PM2 auto-restart configured
- [x] Production timing reverted (WORK_START_HOUR=8)
- [x] Commits pushed
- [ ] QA: Test full shift cycle (08:00-18:00)
- [ ] QA: Verify reject room manual workflow (xiaoting uploads evidence)
- [ ] QA: Confirm worker room remains bot-free

## Next Steps

1. **Monitor production** — check bot logs daily for 1 week
2. **Gather feedback** — ask xiaoting/workers if reject workflow smooth
3. **Tune timing** — adjust jitter/break intervals based on real usage
4. **Scale workers** — add more AbsensiBot instances if team grows

---

**Last Updated**: 2026-07-06 16:40 WIB
**System Status**: ✅ PRODUCTION READY
**Commits**: `119c889` (bot.js: disable RejectBot, revert production timing)
