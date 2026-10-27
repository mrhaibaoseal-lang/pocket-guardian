/**
 * Cloudflare Worker + D1 Backend for PocketGuardian (守財靈)
 *
 * Features:
 * 1. Ultra-forgiving `/api/ingest` endpoint (accepts JSON, plain text, form data, or query params)
 *    for iOS 27 Shortcuts ("當我收到來自玉山銀行的通知時" / Wallet / Action Button OCR / AppIntents).
 * 2. In-worker mutex + D1 atomic persistence to prevent 0.1s race conditions when Wallet and
 *    e.Fingo notifications fire simultaneously.
 * 3. `/api/widget-summary` read-only endpoint for the Swift WidgetKit lock-screen & home-screen widgets.
 * 4. `/api/state` GET/PUT endpoint for full synchronization with the iPhone 16 Plus App.
 */

import {
  emptyLedger,
  MemoryLedger,
  widgetPayload,
} from '../../core';
import type { EventSource, LedgerData, RawInput } from '../../core';

export interface Env {
  DB: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first<T = Record<string, unknown>>(): Promise<T | null>;
        run(): Promise<unknown>;
      };
    };
  };
  INGEST_TOKEN?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Ingest-Token',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

// Per-isolate promise queue to serialize simultaneous webhook requests (<100ms apart)
let mutexChain: Promise<unknown> = Promise.resolve();
function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutexChain.then(fn, fn);
  mutexChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function ensureTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ledger_snapshot (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
    .bind()
    .run();
}

async function loadLedger(env: Env): Promise<MemoryLedger> {
  await ensureTable(env);
  const row = await env.DB.prepare(`SELECT data_json FROM ledger_snapshot WHERE id = ?`)
    .bind('default')
    .first<{ data_json: string }>();
  if (!row?.data_json) {
    return new MemoryLedger(emptyLedger());
  }
  try {
    const parsed = JSON.parse(row.data_json) as LedgerData;
    return new MemoryLedger(parsed);
  } catch {
    return new MemoryLedger(emptyLedger());
  }
}

async function saveLedger(env: Env, ledger: MemoryLedger, now: string): Promise<void> {
  await ensureTable(env);
  await env.DB.prepare(
    `INSERT INTO ledger_snapshot (id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
  )
    .bind('default', JSON.stringify(ledger.data), now)
    .run();
}

function checkAuth(req: Request, url: URL, env: Env): boolean {
  if (!env.INGEST_TOKEN) return true; // Open until secret is set
  const headerToken =
    req.headers.get('X-Ingest-Token') ||
    req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const queryToken = url.searchParams.get('token');
  return headerToken === env.INGEST_TOKEN || queryToken === env.INGEST_TOKEN;
}

/**
 * Ultra-forgiving payload extractor: handles JSON, plain text, URL-encoded form,
 * or query parameters so iOS Shortcuts never fail with 400 Bad Request.
 */
async function extractRawInput(req: Request, url: URL): Promise<{ source: EventSource | null; raw: RawInput }> {
  const querySource = (url.searchParams.get('source') as EventSource | null) ?? null;
  const queryText = url.searchParams.get('text');
  const queryAmount = url.searchParams.get('amount');
  const queryMerchant = url.searchParams.get('merchant');

  if (req.method === 'GET') {
    return {
      source: querySource,
      raw: { text: queryText, amount: queryAmount, merchant: queryMerchant },
    };
  }

  const rawBody = await req.text();
  if (!rawBody.trim()) {
    return {
      source: querySource,
      raw: { text: queryText, amount: queryAmount, merchant: queryMerchant },
    };
  }

  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const src = (parsed.source as EventSource | undefined) ?? querySource;
    const textCandidate =
      (parsed.text as string | undefined) ??
      (parsed.body as string | undefined) ??
      (parsed.notification as string | undefined) ??
      (parsed.input as string | undefined) ??
      queryText;
    return {
      source: src ?? null,
      raw: {
        text: textCandidate ?? null,
        amount: (parsed.amount as number | string | undefined) ?? queryAmount,
        merchant: (parsed.merchant as string | undefined) ?? queryMerchant,
      },
    };
  } catch {
    // Plain text or form-urlencoded body sent directly from iOS Shortcut
    if (rawBody.includes('=') && !rawBody.includes('\n')) {
      const params = new URLSearchParams(rawBody);
      if (params.has('text') || params.has('amount')) {
        return {
          source: (params.get('source') as EventSource | null) ?? querySource,
          raw: {
            text: params.get('text') ?? queryText,
            amount: params.get('amount') ?? queryAmount,
            merchant: params.get('merchant') ?? queryMerchant,
          },
        };
      }
    }
    return {
      source: querySource,
      raw: { text: rawBody, amount: queryAmount, merchant: queryMerchant },
    };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(req.url);
    const now = new Date().toISOString();

    if (!checkAuth(req, url, env)) {
      return jsonResponse({ ok: false, error: 'Unauthorized token' }, 401);
    }

    // 1. Health & Widget Summary endpoint
    if (url.pathname === '/api/widget-summary' || url.pathname === '/') {
      const ledger = await loadLedger(env);
      ledger.chargeSubscriptions(now);
      const summary = ledger.summary(now);
      return jsonResponse({
        ok: true,
        widget: widgetPayload(summary),
        summary,
      });
    }

    // 2. Shortcut / AppIntent Ingest endpoint (serialized to prevent 0.1s race condition)
    if (url.pathname === '/api/ingest' || url.pathname === '/api/webhook/apple-pay') {
      return runSerialized(async () => {
        const { source, raw } = await extractRawInput(req, url);
        const ledger = await loadLedger(env);
        ledger.chargeSubscriptions(now);
        const result = ledger.ingest(source, raw, now);
        await saveLedger(env, ledger, now);
        return jsonResponse({
          ok: true,
          status: result.status,
          reason: result.reason,
          message: result.message,
          transaction: result.transaction,
          widget: widgetPayload(result.summary),
          summary: result.summary,
        });
      });
    }

    // 3. Full Ledger State Sync (GET / PUT) for the iPhone App
    if (url.pathname === '/api/state') {
      if (req.method === 'GET') {
        const ledger = await loadLedger(env);
        ledger.chargeSubscriptions(now);
        return jsonResponse({ ok: true, data: ledger.data, summary: ledger.summary(now) });
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        return runSerialized(async () => {
          const body = (await req.json()) as { data: LedgerData };
          const ledger = new MemoryLedger(body.data);
          await saveLedger(env, ledger, now);
          return jsonResponse({ ok: true, summary: ledger.summary(now) });
        });
      }
    }

    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  },
};
