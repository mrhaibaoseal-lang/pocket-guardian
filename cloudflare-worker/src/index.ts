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
  clampedDate,
  emptyLedger,
  guessSource,
  MemoryLedger,
  mergeLedgerData,
  normalizeRawInput,
  normalizeText,
  parseEvent,
  taipeiDate,
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
  AI?: {
    run(
      model: string,
      input: Record<string, unknown>,
    ): Promise<{ response?: string } | string>;
  };
  DEFAULT_OWN_ACCOUNT_SUFFIX?: string;
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
    const ledger = new MemoryLedger(parsed);
    const cleanedJson = JSON.stringify(ledger.data);
    if (cleanedJson !== row.data_json) {
      await saveLedger(env, ledger, new Date().toISOString());
    }
    return ledger;
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
    const imageCandidate =
      (parsed.imageBase64 as string | undefined) ??
      (parsed.image as string | undefined) ??
      (parsed.screenshot as string | undefined) ??
      null;
    return {
      source: src ?? null,
      raw: {
        text: textCandidate ?? null,
        amount: (parsed.amount as number | string | undefined) ?? queryAmount,
        merchant: (parsed.merchant as string | undefined) ?? queryMerchant,
        imageBase64: imageCandidate,
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

function decodeBase64ToBytes(b64: string): number[] | null {
  try {
    const clean = b64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s+/g, '');
    const bin = atob(clean);
    const bytes = new Array<number>(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Use Cloudflare Workers AI (Vision @cf/llava-hf/llava-1.5-7b-hf / @cf/meta/llama-3.2-11b-vision-instruct
 * + Text @cf/meta/llama-3.1-8b-instruct) when an image is provided or when deterministic rules
 * encounter a novel bank/payment layout, passbook detail ("存" vs "提" circle badge), or low-confidence parse.
 */
async function enhanceWithWorkersAiIfNeeded(
  env: Env,
  sourceHint: EventSource | null,
  rawInput: RawInput,
  ownSuffix: string,
  now: string,
): Promise<RawInput> {
  if (!env.AI) return rawInput;
  const norm = normalizeRawInput(rawInput);
  const text = normalizeText(norm.text ?? '');
  const hasImage = Boolean(norm.imageBase64);
  if (!text && !hasImage) return rawInput;

  const isPassbookAmbiguous =
    /(轉帳給此帳號|網路非約轉帳|約定轉帳|存摺備註)/.test(text) &&
    !/(?:^|\n)[ \t]*[（(【\[]?(?:存|提|支)[）)】\]]?[ \t]*(?=\d|\n|$)/.test(text);

  const guessed = sourceHint ?? guessSource(text) ?? (norm.amount || norm.merchant ? 'wallet' : 'efingo');
  const prelim = parseEvent(guessed, norm, now, ownSuffix);

  // If deterministic rules already succeeded with high confidence and no ambiguous passbook badge, skip AI latency
  if (
    !hasImage &&
    !isPassbookAmbiguous &&
    prelim.confidence === 'high' &&
    (prelim.kind === 'card_spend' ||
      prelim.kind === 'transfer_out' ||
      prelim.kind === 'transfer_in' ||
      prelim.kind === 'otp')
  ) {
    return rawInput;
  }

  const systemPrompt = `你是台灣「靠北我錢呢 ImbrokeAF」記帳 App 的 AI 帳務解析引擎。
請根據使用者傳入的手機截圖與 OCR 文字，判斷這是不是一筆真實的金融交易，並只輸出單行 JSON（不要 Markdown、不要任何解釋）：
{"kind":"transfer_out"|"transfer_in"|"card_spend"|"internal_transfer"|"non_transaction","amount":整數金額或null,"merchant":"店家或對象名稱或null","payeeBankCode":"3碼銀行代碼或null","payeeSuffix":"末4~5碼帳號或null","occurredAt":"YYYY-MM-DD HH:mm:ss或null","reason":"簡短說明"}

嚴格規則：
1. 絕對不可把「西元年份(如2026)」、「時間(如10:29、11:39)」、「電量(如84)」、「銀行代碼(如808、013、812)」、「帳戶餘額/可用餘額(如2,040)」、「手續費(如15)」誤判為交易金額 amount！
2. 玉山銀行等存摺交易明細（底部有「轉帳給此帳號」按鈕時，轉出與轉入都有該按鈕，不可單憑按鈕判斷！）：
   - 必須看金額旁邊的圓形圖示：若是【青色/綠色圓圈「存」】或有匯款人遮罩姓名（如「阮*豫」），代表別人轉錢給我，kind 必為 "transfer_in"，merchant 填「轉入：對方姓名或末碼」。
   - 若金額旁邊是【橘色/紅色圓圈「提」】或顯示「轉入對象 + 自己帳號」或「轉出/扣款」，代表我轉錢給別人，kind 必為 "transfer_out"。
   - 若轉入對象的帳號末碼屬於使用者自己的帳號 (${ownSuffix})，kind 必為 "internal_transfer"。
3. 若是一般刷卡、Apple Pay、LINE Pay、街口、全支付或超商消費，kind 為 "card_spend"，merchant 填商店名稱。
4. 若畫面只是手機鎖定畫面、主畫面、捷徑設定頁、聊天對話或找不到明確交易金額，kind 必為 "non_transaction"，amount 為 null。`;

  try {
    // 1. If screenshot image bytes are available, run Vision AI to read visual badges ("存" vs "提" circle) & layout directly from the image
    if (norm.imageBase64) {
      const imageBytes = decodeBase64ToBytes(norm.imageBase64);
      if (imageBytes && imageBytes.length > 100) {
        const ocrContext = text ? `\n\n畫面 OCR 輔助文字：\n${text.slice(0, 1000)}` : '';
        const visionPrompt = `${systemPrompt}${ocrContext}\n請直接觀看這張截圖畫面（特別注意金額左側圓圈是青色「存」(transfer_in) 還是橘色「提」(transfer_out)，以及交易金額、日期與帳號末碼），只輸出單行 JSON：`;
        const runLlamaVision = async () => {
          try {
            return await env.AI!.run('@cf/meta/llama-3.2-11b-vision-instruct', {
              image: imageBytes,
              prompt: visionPrompt,
              max_tokens: 220,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/agree|license/i.test(msg)) {
              await env.AI!.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' }).catch(() => undefined);
              return await env.AI!.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                image: imageBytes,
                prompt: visionPrompt,
                max_tokens: 220,
              });
            }
            throw err;
          }
        };
        const visionCall = runLlamaVision().catch(() =>
          env.AI!.run('@cf/llava-hf/llava-1.5-7b-hf', {
            image: imageBytes,
            prompt: visionPrompt,
            max_tokens: 220,
          }),
        );
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
        const visionRes = await Promise.race([visionCall, timeout]);
        if (visionRes) {
          const rawVision =
            typeof visionRes === 'string'
              ? visionRes
              : (visionRes as { response?: string; description?: string }).response ??
                (visionRes as { description?: string }).description ??
                '';
          const jsonMatch = rawVision.match(/\{[\s\S]*?"kind"\s*:[\s\S]*?\}/);
          if (jsonMatch) {
            return { text: jsonMatch[0], amount: null, merchant: null };
          }
        }
      }
      if (!text) return rawInput;
    }

    // 2. Text LLM semantic analysis
    const aiCall = env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.slice(0, 1500) },
      ],
      temperature: 0,
      max_tokens: 220,
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
    const aiRes = await Promise.race([aiCall, timeout]);
    if (!aiRes) return rawInput;
    const rawResponse = typeof aiRes === 'string' ? aiRes : aiRes.response ?? '';
    const jsonMatch = rawResponse.match(/\{[\s\S]*?"kind"\s*:[\s\S]*?\}/);
    if (jsonMatch) {
      return { text: jsonMatch[0], amount: null, merchant: null };
    }
  } catch {
    // Fallback gracefully to deterministic parser
  }
  return rawInput;
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
        const ownSuffix = ledger.data.settings.ownAccountSuffix || env.DEFAULT_OWN_ACCOUNT_SUFFIX || '83151';
        const enhancedRaw = await enhanceWithWorkersAiIfNeeded(env, source, raw, ownSuffix, now);
        const result = ledger.ingest(source, enhancedRaw, now);
        // Preserve original OCR text in the stored event if AI structured JSON was used
        const normOrig = normalizeRawInput(raw);
        if (normOrig.text && ledger.data.events.length > 0) {
          const lastEv = ledger.data.events[ledger.data.events.length - 1];
          lastEv.rawText = normOrig.text.slice(0, 2000);
        }
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
        const charged = ledger.chargeSubscriptions(now);
        if (charged.length > 0) {
          await saveLedger(env, ledger, now);
        }
        return jsonResponse({ ok: true, data: ledger.data, summary: ledger.summary(now) });
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        return runSerialized(async () => {
          const body = (await req.json()) as { data: LedgerData; replace?: boolean };
          const existing = await loadLedger(env);
          const existingSubIds = new Set((existing.data.subscriptions ?? []).map((s) => s.id));
          const today = taipeiDate(now);
          const ym = today.slice(0, 7);
          const [y, m] = ym.split('-').map(Number);

          // Prevent newly added subscriptions whose billingDay already passed this month
          // from retroactively deducting the current month's balance.
          if (Array.isArray(body.data?.subscriptions)) {
            body.data.subscriptions = body.data.subscriptions.map((s) => {
              if (!existingSubIds.has(s.id) && s.lastChargedMonth === null) {
                const dueThisMonth = clampedDate(y, m, s.billingDay);
                if (dueThisMonth <= today) {
                  return { ...s, lastChargedMonth: ym };
                }
              }
              return s;
            });
          }

          if (body.replace || (body.data.transactions.length === 0 && body.data.events.length === 0)) {
            const ledger = new MemoryLedger(body.data);
            await saveLedger(env, ledger, now);
            return jsonResponse({ ok: true, data: ledger.data, summary: ledger.summary(now) });
          }
          const { merged } = mergeLedgerData(body.data, existing.data);
          const ledger = new MemoryLedger(merged);
          await saveLedger(env, ledger, now);
          return jsonResponse({ ok: true, data: ledger.data, summary: ledger.summary(now) });
        });
      }
    }

    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  },
};
