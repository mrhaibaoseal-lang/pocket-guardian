-- Cloudflare D1 (SQLite) Schema for PocketGuardian (守財靈) v3.1

CREATE TABLE IF NOT EXISTS ledger_Snapshot (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'cash', 'debit_card')),
  balance REAL NOT NULL DEFAULT 0,
  account_suffix TEXT,
  linked_account_id TEXT,
  last_reconciled_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'adjustment')),
  method TEXT NOT NULL,
  category TEXT,
  merchant TEXT,
  note TEXT,
  account_id TEXT NOT NULL,
  to_account_id TEXT,
  payee_id TEXT,
  frontend_slot TEXT,
  bank_slot TEXT,
  idempotency_key TEXT UNIQUE,
  is_locked INTEGER NOT NULL DEFAULT 0,
  merged_metadata TEXT,
  time_source TEXT NOT NULL DEFAULT 'manual',
  affects_budget INTEGER NOT NULL DEFAULT 1,
  is_advance INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_occurred_at ON transactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_amount_unlocked ON transactions(amount, is_locked, deleted_at);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  raw_text TEXT,
  fingerprint TEXT NOT NULL,
  received_at TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  transaction_id TEXT,
  status TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);

CREATE TABLE IF NOT EXISTS payees (
  id TEXT PRIMARY KEY,
  bank_code TEXT,
  account_suffix TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  default_category TEXT NOT NULL DEFAULT '轉帳'
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  billing_day INTEGER NOT NULL,
  account_id TEXT NOT NULL DEFAULT 'bank',
  is_active INTEGER NOT NULL DEFAULT 1,
  auto_post INTEGER NOT NULL DEFAULT 0,
  last_charged_month TEXT
);

CREATE TABLE IF NOT EXISTS ingest_tokens (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  revoked_at TEXT,
  last_used_at TEXT
);
