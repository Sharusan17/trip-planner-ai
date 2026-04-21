import { Router, Request, Response } from 'express';
import { uploadReceipt } from '../middleware/upload';
import { createLogger } from '../utils/logger';

const log = createLogger('tabscanner');
const router = Router();

const TABSCANNER_PROCESS = 'https://api.tabscanner.com/api/2/process';
const TABSCANNER_RESULT  = 'https://api.tabscanner.com/api/result';
const POLL_INTERVAL_MS   = 2500;
const POLL_MAX_ATTEMPTS  = 12; // 30 seconds max

// POST /api/v1/receipts/scan
router.post('/receipts/scan', uploadReceipt.single('receipt'), async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.TABSCANNER_API_KEY;
    if (!apiKey) {
      log.warn('TABSCANNER_API_KEY not configured — receipt scan unavailable');
      return res.status(500).json({ error: 'TABSCANNER_API_KEY is not configured' });
    }
    if (!req.file) {
      log.warn('scan called with no file');
      return res.status(400).json({ error: 'No receipt file provided' });
    }
    log.info(`scanning receipt`, { bytes: req.file.size, mime: req.file.mimetype, name: req.file.originalname });

    // ── Step 1: Upload ────────────────────────────────────────────────────────
    const uploadForm = new FormData();
    const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype });
    uploadForm.append('file', blob, req.file.originalname || 'receipt.jpg');

    const uploadRes = await fetch(TABSCANNER_PROCESS, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: uploadForm,
    });

    const uploadRaw = await uploadRes.text();
    log.info(`upload status=${uploadRes.status}`, { bodyPreview: uploadRaw.slice(0, 500) });

    if (!uploadRes.ok) {
      log.warn('upload failed', { status: uploadRes.status });
      return res.status(502).json({ error: 'Tabscanner upload failed', details: uploadRaw });
    }

    let uploadData: any;
    try { uploadData = JSON.parse(uploadRaw); } catch {
      return res.status(502).json({ error: 'Tabscanner upload returned non-JSON', raw: uploadRaw });
    }

    // If duplicate, use the duplicateToken for the result lookup
    const token: string | undefined = uploadData?.duplicateToken ?? uploadData?.token;
    if (!token) {
      return res.status(502).json({ error: 'No token in Tabscanner response', raw: uploadData });
    }

    // If the result is already included in the upload response
    if (uploadData?.result && isSuccess(uploadData?.status)) {
      log.info('result in upload response (no polling needed)');
      return res.json(formatResult(uploadData.result));
    }

    // ── Step 2: Poll for results ──────────────────────────────────────────────
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetch(`${TABSCANNER_RESULT}/${token}`, {
        method: 'GET',
        headers: { apikey: apiKey },
      });

      const pollRaw = await pollRes.text();
      log.debug(`poll #${attempt + 1} status=${pollRes.status}`, { bodyPreview: pollRaw.slice(0, 500) });

      if (!pollRes.ok) continue;

      let pollData: any;
      try { pollData = JSON.parse(pollRaw); } catch { continue; }

      // Return as soon as a result object is present — don't rely solely on status string
      if (pollData?.result) {
        log.info(`got result after ${attempt + 1} poll(s)`, { status: pollData?.status });
        return res.json(formatResult(pollData.result));
      }

      // Explicit failure
      if (pollData?.status === 'fail' || pollData?.status === 'error') {
        log.warn('explicit failure from Tabscanner', { details: pollData });
        return res.status(422).json({ error: 'Tabscanner could not read the receipt', details: pollData });
      }

      // Otherwise still pending — keep looping
    }

    return res.status(504).json({ error: 'Tabscanner timed out after 30s — try a clearer photo' });
  } catch (err) {
    log.error('unexpected scan error', { message: (err as Error).message, stack: (err as Error).stack });
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSuccess(status?: string) {
  return !status || ['done', 'success', 'complete', 'finished'].includes(status.toLowerCase());
}

interface TabscannerResult {
  establishment?: string;
  date?: string;
  total?: string | number;
  subtotal?: string | number;
  tax?: string | number;
  currency?: string;
  lineItems?: Array<{
    desc?: string;           // primary description field
    lineText?: string;       // alias used in some responses
    descr?: string;          // alternate spelling seen in some API versions
    text?: string;           // generic text field fallback
    name?: string;           // another common alias
    lineTotal?: string | number;
    qty?: string | number;
    price?: string | number;     // unit price
    unitPrice?: string | number; // alternate field name
    [key: string]: unknown;      // allow any additional fields for logging
  }>;
}

function toNum(v: string | number | undefined): number {
  if (v === undefined || v === null || v === '') return 0;
  return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

function formatResult(raw: TabscannerResult) {
  const totalAmount = toNum(raw.total);
  const subtotal    = toNum(raw.subtotal);
  const rawTax      = toNum(raw.tax);
  const currency    = (raw.currency ?? 'GBP').toUpperCase();

  const rawItems = raw.lineItems ?? [];
  log.debug('raw lineItems', { count: rawItems.length, sample: rawItems.slice(0, 3) });

  // Resolve per-item total: prefer lineTotal, fall back to qty × price
  const withAmounts = rawItems.map((li) => {
    const lineTotal = toNum(li.lineTotal);
    const unitPrice = toNum(li.price ?? li.unitPrice);
    const qty       = Math.max(1, Math.round(toNum(li.qty) || 1));
    const amount    = lineTotal > 0 ? lineTotal : round2(unitPrice * qty);

    // Try every known Tabscanner description field name
    const rawDesc = (
      li.desc ?? li.lineText ?? li.descr ?? li.text ?? li.name ?? ''
    ).trim();

    // Strip trailing price/$ symbols (e.g. "Item $ 3.50" or "Item $")
    // and leading qty prefix (e.g. "2x " or "1X ")
    const cleaned = rawDesc
      .replace(/\s*\$\s*[\d.,]*\s*$/, '')   // trailing "$ 3.50" or lone "$"
      .replace(/^\d+[xX]\s+/, '')             // leading "2x " or "1X " prefix
      .trim();

    // If cleaning wiped the name (e.g. the whole string was "$3.50"), fall back to rawDesc minus qty prefix
    const desc = cleaned || rawDesc.replace(/^\d+[xX]\s+/, '').trim();

    return { desc, qty, amount };
  });

  log.debug('cleaned items', { count: withAmounts.length, items: withAmounts });

  const validItems = withAmounts.filter((li) => li.amount > 0);
  const itemsSum   = validItems.reduce((s, li) => s + li.amount, 0);

  let vatToDistribute = rawTax;
  if (vatToDistribute === 0 && totalAmount > 0 && itemsSum > 0 && (totalAmount - itemsSum) > 0.005) {
    vatToDistribute = round2(totalAmount - itemsSum);
  }
  if (vatToDistribute === 0 && subtotal > 0 && totalAmount > subtotal + 0.005) {
    vatToDistribute = round2(totalAmount - subtotal);
  }

  const lineItems = validItems.map((li) => {
    const vatShare = itemsSum > 0 ? (li.amount / itemsSum) * vatToDistribute : 0;
    return {
      description:     li.desc,           // clean name, no qty prefix
      qty:             li.qty,
      amountBeforeVat: round2(li.amount),
      vatShare:        round2(vatShare),
      amount:          round2(li.amount + vatShare),
    };
  });

  return {
    merchant:  raw.establishment ?? '',
    date:      raw.date ?? '',
    total:     totalAmount,
    currency,
    tax:       vatToDistribute,
    hasVat:    vatToDistribute > 0,
    lineItems,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default router;
