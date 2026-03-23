/* ===== RESET & BASE ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --primary: #1a7dc4;
  --primary-dark: #155fa0;
  --bg: #f0f2f5;
  --sidebar-bg: #1e2a3a;
  --sidebar-hover: #2a3a50;
  --sidebar-active: #1a7dc4;
  --topbar-bg: #ffffff;
  --white: #ffffff;
  --border: #dde1e7;
  --text: #222;
  --text-muted: #6b7280;
  --font: 'Inter', 'Segoe UI', sans-serif;

  --status-pending: #f59e0b;
  --status-processing: #3b82f6;
  --status-completed: #10b981;
  --status-failed: #ef4444;

  --btn-yellow: #f59e0b;
  --btn-red: #ef4444;
  --btn-blue: #3b82f6;
  --btn-teal: #14b8a6;
  --btn-green: #10b981;
}

body { font-family: var(--font); font-size: 12px; background: var(--bg); color: var(--text); overflow: hidden; height: 100vh; }

/* ===== LOGIN ===== */
#login-page {
  display: flex; align-items: center; justify-content: center;
  height: 100vh;
  background: #0f1f2e url('bg-payadmin.png') center / cover no-repeat;
}
.login-card {
  background: white; border-radius: 12px; padding: 36px 40px;
  width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.login-logo { text-align: center; margin-bottom: 24px; }
.login-logo h2 { font-size: 22px; font-weight: 700; color: var(--primary); }
.login-logo p { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
.form-group input {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border);
  border-radius: 6px; font-size: 13px; outline: none; transition: border 0.2s;
}
.form-group input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(26,125,196,0.1); }
.login-btn {
  width: 100%; padding: 10px; background: var(--primary); color: white;
  border: none; border-radius: 6px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background 0.2s; margin-top: 6px;
}
.login-btn:hover { background: var(--primary-dark); }
.login-error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; display: none; }

/* ===== APP SHELL ===== */
#app { display: none; height: 100vh; flex-direction: row; }

/* ===== SIDEBAR ===== */
#sidebar {
  width: 200px; min-width: 200px; background: var(--sidebar-bg);
  display: flex; flex-direction: column; transition: width 0.25s ease;
  overflow: hidden; z-index: 100;
}
#sidebar.collapsed { width: 46px; min-width: 46px; }
.sidebar-header {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08); min-height: 46px;
}
.sidebar-logo { font-size: 13px; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; }
.sidebar-toggle-btn {
  margin-left: auto; background: none; border: none; color: rgba(255,255,255,0.6);
  cursor: pointer; font-size: 16px; padding: 2px 4px; flex-shrink: 0;
}
.sidebar-toggle-btn:hover { color: white; }

/* User info */
.sidebar-user {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.user-avatar {
  width: 28px; height: 28px; border-radius: 50%; background: var(--primary);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: white; flex-shrink: 0;
}
.user-info { overflow: hidden; }
.user-name { font-size: 11px; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-role { font-size: 10px; color: rgba(255,255,255,0.45); }

.sidebar-nav { flex: 1; overflow-y: auto; padding: 6px 0; }
.nav-section-label {
  font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.3);
  text-transform: uppercase; letter-spacing: 1px;
  padding: 8px 14px 4px; white-space: nowrap; overflow: hidden;
}
#sidebar.collapsed .nav-section-label { opacity: 0; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  color: rgba(255,255,255,0.65); cursor: pointer; transition: all 0.15s;
  white-space: nowrap; border-left: 2px solid transparent;
  text-decoration: none; font-size: 12px;
}
.nav-item:hover { background: var(--sidebar-hover); color: white; }
.nav-item.active { background: rgba(26,125,196,0.2); color: white; border-left-color: var(--primary); }
.nav-item .nav-icon { font-size: 14px; flex-shrink: 0; width: 20px; text-align: center; }
.nav-item .nav-label { overflow: hidden; transition: opacity 0.2s; }
#sidebar.collapsed .nav-label { opacity: 0; width: 0; }

/* Keep hamburger visible even when sidebar is collapsed */
#sidebar.collapsed .sidebar-header {
  justify-content: center;
  padding: 10px 0;
}
#sidebar.collapsed .sidebar-logo { display: none; }
#sidebar.collapsed .sidebar-toggle-btn {
  margin-left: 0;
  font-size: 18px;
  color: rgba(255,255,255,0.85);
}

/* Keep user avatar visible and centered when collapsed */
#sidebar.collapsed .sidebar-user { justify-content: center; padding: 10px 0; }
#sidebar.collapsed .user-info { display: none; }

/* ===== MAIN CONTENT ===== */
#main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* TOPBAR */
#topbar {
  background: var(--topbar-bg); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; padding: 0 14px; height: 40px;
  gap: 8px; flex-shrink: 0;
}
.topbar-breadcrumb { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.breadcrumb-home { color: var(--text-muted); cursor: pointer; }
.breadcrumb-sep { color: var(--border); }
.breadcrumb-current {
  background: var(--primary); color: white; padding: 2px 10px;
  border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;
}
.topbar-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.topbar-welcome { font-size: 11px; color: var(--text-muted); }
.topbar-fullscreen, .topbar-logout {
  font-size: 11px; color: var(--text-muted); cursor: pointer; padding: 3px 8px;
  border-radius: 4px; border: 1px solid var(--border); background: white;
  display: flex; align-items: center; gap: 4px;
}
.topbar-logout { color: #ef4444; border-color: #fca5a5; }
.topbar-logout:hover { background: #fef2f2; }

/* PAGE ACTIONS BAR */
.page-actions-bar {
  background: white; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; padding: 0 14px; height: 32px;
  gap: 8px; flex-shrink: 0; justify-content: flex-end;
}
.page-action-btn {
  font-size: 11px; padding: 3px 10px; border: 1px solid var(--border);
  background: white; border-radius: 4px; cursor: pointer; color: var(--text-muted);
  display: flex; align-items: center; gap: 4px;
}
.page-action-btn:hover { background: var(--bg); }

/* ===== PAGE CONTENT ===== */
#content { flex: 1; overflow-y: auto; padding: 10px 12px; }

/* Page sections */
.page-section { display: none; }
.page-section.active { display: block; }

/* ===== FILTER PANEL ===== */
.filter-panel {
  background: white; border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px 8px; margin-bottom: 8px;
  overflow: hidden; /* Penting untuk animasi lipat */
  max-height: 500px; /* Batas atas saat terbuka */
  opacity: 1;
  transition: max-height 0.4s ease, opacity 0.3s ease, padding 0.4s ease, margin-bottom 0.4s ease;
}

.filter-panel.collapsed {
  display: block !important; /* Timpa display:none nya */
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 0;
  border-color: transparent;
  pointer-events: none; /* Mencegah input diklik saat sembunyi */
}
.filter-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 10px; }
.filter-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.filter-item { display: flex; flex-direction: column; gap: 2px; }
.filter-item label { font-size: 10px; color: var(--text-muted); font-weight: 600; }
.filter-item input, .filter-item select {
  height: 26px; padding: 0 7px; border: 1px solid var(--border);
  border-radius: 4px; font-size: 11px; color: var(--text); outline: none;
  background: white;
}
.filter-item input:focus, .filter-item select:focus { border-color: var(--primary); }
.filter-item input[type="date"] { font-size: 10px; }
.filter-date-range { display: flex; align-items: center; gap: 4px; }
.filter-date-range span { font-size: 10px; color: var(--text-muted); }

.filter-buttons { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; }
.fbtn {
  height: 26px; padding: 0 12px; border: none; border-radius: 4px;
  font-size: 11px; font-weight: 600; cursor: pointer; transition: filter 0.15s;
  display: flex; align-items: center; gap: 4px;
}
.fbtn:hover { filter: brightness(0.9); }
.fbtn-search { background: #1a7dc4; color: white; }
.fbtn-reset { background: #f59e0b; color: white; }
.fbtn-today { background: #10b981; color: white; }
.fbtn-yesterday { background: #8b5cf6; color: white; }

/* ===== TABLE TOOLBAR ===== */
.table-toolbar {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 6px; margin-bottom: 4px;
}
.toolbar-btn {
  width: 28px; height: 28px; border: 1px solid var(--border); background: white;
  border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--text-muted); transition: all 0.15s;
}
.toolbar-btn:hover { background: var(--bg); border-color: var(--primary); color: var(--primary); }
.toolbar-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

/* ===== TRANSACTION TABLE ===== */
.table-wrap {
  background: white; border: 1px solid var(--border); border-radius: 6px;
  overflow: auto; max-height: calc(100vh - 290px);
  transition: max-height 0.3s ease; /* Tambahkan transisi halus */
}

/* 👇 JIKA FILTER TUTUP, TABEL MEMANJANG KE BAWAH */
.filter-panel.collapsed + .table-wrap, 
.filter-panel.collapsed ~ .table-wrap {
  max-height: calc(100vh - 160px);
}
table { width: 100%; border-collapse: collapse; font-size: 14px; }
thead tr { background: #f8f9fb; position: sticky; top: 0; z-index: 10; }
thead th {
  padding: 8px 8px; border-bottom: 1px solid var(--border);
  font-weight: 700; font-size: 11px; color: #374151; text-align: center;
  white-space: nowrap; border-right: 1px solid var(--border);
  cursor: pointer; user-select: none;
}
thead th:last-child { border-right: none; }
thead th:hover { background: #eef0f4; }
tbody tr { border-bottom: 1px solid #f0f2f5; transition: background 0.1s; }
tbody tr:hover { background: #f8faff; }
tbody td {
  padding: 4px 6px; vertical-align: middle; white-space: nowrap;
  border-right: 1px solid #f0f2f5;
}
tbody td:last-child { border-right: none; }
.td-id { font-family: monospace; font-size: 11px; color: #374151; }
.td-order { font-family: monospace; font-size: 10px; color: #1a7dc4; font-weight: 600; }
.td-amount { font-weight: 700; color: #111; text-align: center; font-size: 11px; }
.td-name { font-weight: 600; }
.td-time { font-size: 10px; color: #6b7280; line-height: 1.4; }
.td-check input[type=checkbox] { cursor: pointer; }

/* STATUS BADGES */
.badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 1px 7px; border-radius: 20px; font-size: 10px; font-weight: 700;
  white-space: nowrap; line-height: 1.6;
}
.badge-pending { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
.badge-processing { background: #eff6ff; color: #1d4ed8; border: 1px solid #3b82f6; }
.badge-completed { background: #ecfdf5; color: #065f46; border: 1px solid #10b981; }
.badge-failed { background: #fef2f2; color: #991b1b; border: 1px solid #ef4444; }
.badge-source { background: #e0f2fe; color: #0369a1; border: 1px solid #38bdf8; font-size: 10px; }

/* ACTION BUTTONS */
.actions-wrap { display: flex; gap: 8px; align-items: flex-start; }
.action-group { display: flex; flex-direction: column; gap: 2px; }
.action-group-divider { width: 1px; background: var(--border); margin: 0 2px; }
.abtn {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border: none; border-radius: 3px;
  font-size: 10px; font-weight: 600; cursor: pointer;
  white-space: nowrap; transition: filter 0.15s; color: white;
  line-height: 1.6;
}
.abtn:hover { filter: brightness(0.88); }
.abtn-confirm { background: #f59e0b; }
.abtn-reject { background: #ef4444; }
.abtn-detail { background: #3b82f6; }
.abtn-proof { background: #14b8a6; }
.abtn-checknum { background: #f59e0b; }
.abtn-checkname { background: #3b82f6; }

/* ===== PAGINATION ===== */
.pagination-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; background: white; border: 1px solid var(--border);
  border-top: none; border-radius: 0 0 6px 6px; font-size: 11px; color: var(--text-muted);
}
.pagination-btns { display: flex; gap: 3px; align-items: center; }
.pgbtn {
  min-width: 24px; height: 24px; border: 1px solid var(--border);
  background: white; border-radius: 3px; font-size: 11px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; padding: 0 5px;
  color: var(--text); transition: all 0.15s;
}
.pgbtn:hover { border-color: var(--primary); color: var(--primary); }
.pgbtn.active { background: var(--primary); color: white; border-color: var(--primary); }
.pgbtn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ===== MODALS ===== */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.48);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
  opacity: 0; pointer-events: none; transition: opacity 0.2s;
}
.modal-overlay.open { opacity: 1; pointer-events: all; }
.modal {
  background: white; border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.1);
  min-width: 420px; max-width: 600px; width: 92vw;
  transform: translateY(10px) scale(0.97); transition: transform 0.22s cubic-bezier(0.34,1.4,0.64,1), opacity 0.18s;
  opacity: 0;
}
.modal-overlay.open .modal { transform: translateY(0) scale(1); opacity: 1; }

/* Header */
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px 12px; border-bottom: 1px solid var(--border);
}
.modal-title-wrap { display: flex; align-items: center; gap: 9px; }
.modal-title-icon {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.modal-icon-confirm  { background: #fef3c7; color: #92400e; }
.modal-icon-reject   { background: #fef2f2; color: #991b1b; }
.modal-icon-checknum { background: #fef3c7; color: #92400e; }
.modal-icon-checkname{ background: #eff6ff; color: #1d4ed8; }

.modal-title { font-size: 13px; font-weight: 700; color: #111; }
.modal-close {
  background: none; border: none; font-size: 16px; cursor: pointer;
  color: var(--text-muted); width: 26px; height: 26px; display: flex;
  align-items: center; justify-content: center; border-radius: 5px;
  transition: background 0.15s;
}
.modal-close:hover { background: #f3f4f6; color: #374151; }

/* Body */
.modal-body { padding: 14px 16px; }

/* Info block — transaction summary shown above textarea */
.modal-info-block {
  background: #f8f9fb; border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; margin-bottom: 12px; font-size: 11px;
}
.modal-info-block:empty { display: none; }
.modal-info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 0; border-bottom: 1px solid #f0f2f5;
}
.modal-info-row:last-child { border-bottom: none; }
.modal-info-label { color: #6b7280; font-weight: 600; font-size: 10px; }
.modal-info-val   { font-weight: 700; color: #111; font-size: 11px; }

/* Input section */
.modal-input-section { display: flex; flex-direction: column; gap: 5px; }
.modal-input-label {
  font-size: 10px; font-weight: 700; color: #374151;
  text-transform: uppercase; letter-spacing: 0.4px;
  display: flex; align-items: center; gap: 4px;
}
.modal-input-required { color: #ef4444; font-size: 11px; }
.modal-input-hint {
  font-size: 10px; font-weight: 400; color: #9ca3af;
  text-transform: none; letter-spacing: 0; margin-left: 2px;
  transition: color 0.2s;
}
.modal-input-hint.active { color: #10b981; }

.modal-textarea {
  width: 100%; height: 96px; padding: 9px 10px;
  border: 1.5px solid #e5e7eb; border-radius: 6px;
  font-size: 12px; resize: vertical; outline: none;
  font-family: var(--font); color: var(--text);
  background: white; transition: border-color 0.2s, box-shadow 0.2s;
  line-height: 1.5;
}
.modal-textarea::placeholder { color: #b0b7c3; }
.modal-textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(26,125,196,0.1); }
.modal-textarea.has-value { border-color: #10b981; }

/* Footer */
.modal-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 11px 16px; border-top: 1px solid var(--border); background: #fafafa;
  border-radius: 0 0 10px 10px;
}

/* ── UNIFIED BUTTON STATES ── */
.modal-btn {
  padding: 7px 20px; border-radius: 5px; font-size: 12px; font-weight: 700;
  cursor: pointer; border: none; transition: filter 0.15s, opacity 0.2s, transform 0.1s;
  display: flex; align-items: center; gap: 5px; line-height: 1;
}
.modal-btn:not(:disabled):hover { filter: brightness(0.9); transform: translateY(-1px); }
.modal-btn:not(:disabled):active { transform: translateY(0); }

/* Disabled state — BOTH buttons locked when textarea empty */
.modal-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  filter: none;
  transform: none;
}

/* Confirm = yellow */
.modal-btn-confirm  { background: #f59e0b; color: white; }
/* Cancel  = gray */
.modal-btn-mcancel  { background: #e5e7eb; color: #374151; }
/* Primary = blue (detail close, error ok) */
.modal-btn-primary  { background: var(--primary); color: white; }
/* Legacy aliases */
.modal-btn-danger   { background: #ef4444; color: white; }
.modal-btn-cancel   { background: #e5e7eb; color: #374151; }

/* Detail table */
.detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.detail-table tr { border-bottom: 1px solid #f0f2f5; }
.detail-table tr:last-child { border-bottom: none; }
.detail-table th {
  width: 38%; padding: 6px 8px; text-align: left;
  font-weight: 600; color: var(--text-muted); background: #f8f9fb;
  font-size: 11px;
}
.detail-table td { padding: 6px 8px; font-size: 12px; }

/* Check result */
.check-result {
  display: flex; flex-direction: column; gap: 10px; padding: 4px 0;
}
.check-row { display: flex; gap: 12px; }
.check-col { flex: 1; }
.check-col label { font-size: 10px; color: var(--text-muted); font-weight: 600; margin-bottom: 4px; display: block; }
.check-val { font-size: 12px; font-weight: 600; padding: 5px 8px; background: #f8f9fb; border-radius: 4px; border: 1px solid var(--border); }
.match-indicator {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px; border-radius: 6px; font-size: 13px; font-weight: 700; margin-top: 4px;
}
.match-yes { background: #ecfdf5; color: #065f46; border: 1px solid #10b981; }
.match-no { background: #fef2f2; color: #991b1b; border: 1px solid #ef4444; }

/* Error modal */
.error-icon { font-size: 36px; margin-bottom: 10px; }
.error-msg { font-size: 14px; font-weight: 600; color: #374151; }

/* ===== SYSTEM NOTICE ===== */
.sys-notice {
  position: fixed; top: 12px; right: 14px; z-index: 2000;
  background: white; border-radius: 8px; padding: 12px 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2); min-width: 280px;
  display: flex; align-items: flex-start; gap: 10px;
  border-left: 4px solid var(--primary); font-size: 12px;
  transform: translateX(120%); transition: transform 0.3s;
}
.sys-notice.show { transform: translateX(0); }
.sys-notice.success { border-color: #10b981; }
.sys-notice.error { border-color: #ef4444; }
.sys-notice.warning { border-color: #f59e0b; }

/* ===== DASHBOARD ===== */
.dash-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.stat-card {
  background: white; border-radius: 8px; padding: 14px 16px;
  border: 1px solid var(--border); display: flex; gap: 12px; align-items: center;
}
.stat-icon {
  width: 40px; height: 40px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;
}
.stat-info h3 { font-size: 20px; font-weight: 800; }
.stat-info p { font-size: 11px; color: var(--text-muted); margin-top: 1px; }

.dash-recent { background: white; border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
.dash-recent h3 { font-size: 13px; font-weight: 700; margin-bottom: 10px; }

/* ===== BANK MANAGEMENT ===== */
.bank-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
  max-width: 700px;
}
.bank-card {
  background: white; border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; transition: box-shadow 0.2s;
}
.bank-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
.bank-card-logo {
  height: 90px; display: flex; align-items: center; justify-content: center;
  background: #f8f9fb; font-size: 28px; font-weight: 900;
  border-bottom: 1px solid var(--border);
}
.bank-card-body { padding: 10px; }
.bank-card-name { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
.bank-select-btn {
  width: 100%; padding: 6px; background: #ef4444; color: white;
  border: none; border-radius: 4px; font-size: 11px; font-weight: 700;
  cursor: pointer; transition: filter 0.15s;
}
.bank-select-btn:hover { filter: brightness(0.9); }
.bank-select-btn.selected { background: #10b981; }

/* ===== REPORTS ===== */
.reports-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.report-card {
  background: white; border: 1px solid var(--border); border-radius: 8px;
  padding: 14px; cursor: pointer; transition: all 0.2s;
}
.report-card:hover { border-color: var(--primary); box-shadow: 0 2px 8px rgba(26,125,196,0.1); }
.report-card-icon { font-size: 28px; margin-bottom: 8px; }
.report-card h4 { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.report-card p { font-size: 11px; color: var(--text-muted); }

/* ===== SCROLLBAR ===== */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* Responsive fix for very wide tables */
.table-wrap table { min-width: 1400px; }

.history-table td {
  font-size: 12px;
  padding: 10px 8px;
  border-bottom: 1px solid #e5e7eb;
}

.history-table tr:hover {
  background: #f9fafb;
}

.history-actions {
  display: flex;
  gap: 6px;
}

.abtn-detail {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.abtn-proof {
  background: #10b981;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.history-admin {
  font-weight: 600;
  color: #374151;
}

.card-table {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  padding: 12px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  text-transform: uppercase;
}

.history-header h2 {
  font-weight: 700;
  padding-bottom: 5px;
}

.history-header p {
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}

.table-footer {
  margin-top: 10px;
  font-size: 12px;
  color: #6b7280;
}

.action-group {
  display: flex;
  flex-direction: column; /* ✅ */
  /* gap: 6px; */

}

.abtn {
  width: 100%;
  text-align: center;
}

/* BANK CARDS */

.bank-card {
  padding: 18px 20px;
  border-radius: 12px;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  transition: all 0.2s ease;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border: 1px solid rgba(0, 0, 0, 0.103);
  min-height: 100px;
  -webkit-transition: all 0.2s ease;
  -moz-transition: all 0.2s ease;
  -ms-transition: all 0.2s ease;
  -o-transition: all 0.2s ease;
}

.bank-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.1);
  background-color: rgba(233, 160, 3, 0.404);
}

.bank-card.active {
  border: 2px solid #007bff;
  box-shadow: 0 6px 18px rgba(0,123,255,0.2);
}

.bank-logo {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.bank-info {
  display: flex;
  flex-direction: column;
}

.bank-name {
  font-size: 15px;
  font-weight: 600;
}

.bank-number {
  font-size: 13px;
  color: #6c757d;
}

/* .bank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 20px;
} */

.bank-wrapper {
  display: flex;
  justify-content: center;
  width: 100%;
}

.bank-grid {
  display: grid;
  grid-template-columns: repeat(3, 280px);
  gap: 30px;
  margin-top: 20px;
}

.bank-header {
  margin-bottom: 24px;
  text-align: center;
  margin-top: 20px;
  text-transform: uppercase;
}

.bank-header h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--primary);
}

.bank-header p {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.bank-header p::after {
  content: '';
  display: block;
  width: 30%;
  height: 2px;
  background: var(--primary);
  margin: 8px auto 0;
}




/* BANK COLORS */

.bank-vcb {
  background: rgba(0, 135, 90, 0.08);
}

.bank-tcb {
  background: rgba(220, 53, 69, 0.08);
}

.bank-mb {
  background: rgba(0, 102, 204, 0.08);
}

.bank-bidv {
  background: rgba(0, 128, 128, 0.08);
}

.bank-acb {
  background: rgba(0, 102, 204, 0.08);
}

.bank-vp {
  background: rgba(0, 128, 0, 0.08);
}

.bank-ocb {
  background: rgba(255, 165, 0, 0.08);
}

.bank-msb {
  background: rgba(220, 53, 69, 0.08);
}

/* PAGINATION BUTTONS */

.pgbtn {
  margin: 3px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  font-size: 12px;
}

.pgbtn.active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}

.pgbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

#history-pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.box-history {
  /* background: white; */
  /* border: 1px solid #e5e7eb; */
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  padding-left: 20px;
  padding-right: 20px;
  align-items: center;
  margin-top: 7px;
}

#history-summary {
  font-size: 12px;
  color: black;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
  background-color: rgba(128, 128, 128, 0.356);
  padding: 6px 12px;
  border-radius: 5px;
  -webkit-border-radius: 5px;
  -moz-border-radius: 5px;
  -ms-border-radius: 5px;
  -o-border-radius: 5px;
}

@keyframes pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.2; }
}
