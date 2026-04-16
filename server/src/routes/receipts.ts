import { Router, Request, Response } from 'express';
import { uploadReceipt } from '../middleware/upload';

const router = Router();

const TABSCANNER_PROCESS = 'https://api.tabscanner.com/api/2/process';
const TABSCANNER_RESULT  = 'https://api.tabscanner.com/api/results';
const POLL_INTERVAL_MS   = 2000;
const POLL_MAX_ATTEMPTS  = 15; // 30 seconds max

// POST /api/v1/receipts/scan
// Accepts a receipt image, scans it with Tabscanner, returns structured data + VAT distribution
router.post('/receipts/scan', uploadReceipt.single('receipt'), async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.TABSCANNER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'TABSCANNER_API_KEY is not configured' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No receipt file provided' });
    }

    // ── Step 1: Upload to Tabscanner ──────────────────────────────────────────
    const uploadForm = new FormData();
    const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype });
    uploadForm.append('file', blob, req.file.originalname || 'receipt.jpg');

    const uploadRes = await fetch(TABSCANNER_PROCESS, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const txt = await uploadRes.text();
      return res.status(502).json({ error: 'Tabscanner upload failed', details: txt });
    }

    const uploadData = await uploadRes.json() as any;
    const token: string | undefined = uploadData?.token;

    if (!token) {
      return res.status(502).json({ error: 'Tabscanner did not return a token', raw: uploadData });
    }

    // If already done on upload (synchronous), skip polling
    if (uploadData?.status === 'done' && uploadData?.result) {
      return res.json(formatResult(uploadData.result));
    }

    // ── Step 2: Poll for results ──────────────────────────────────────────────
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetch(TABSCANNER_RESULT, {
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json() as any;

      if (pollData?.status === 'done' && pollData?.result) {
        return res.json(formatResult(pollData.result));
      }
      if (pollData?.status === 'error') {
        return res.status(422).json({ error: 'Tabscanner could not read the receipt', details: pollData });
      }
      // status === 'pending' → keep polling
    }

    return res.status(504).json({ error: 'Tabscanner timed out — receipt may be unclear' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TabscannerResult {
  establishment?: string;
  date?: string;
  total?: string | number;
  subtotal?: string | number;
  tax?: string | number;
  taxPercent?: string | number;
  currency?: string;
  lineItems?: Array<{
    lineText?: string;
    lineTotal?: string | number;
    qty?: string | number;
    unitPrice?: string | number;
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
  const validItems = rawItems.filter((li) => toNum(li.lineTotal) > 0);
  const itemsSum = validItems.reduce((s, li) => s + toNum(li.lineTotal), 0);

  // Resolve VAT to distribute:
  //   1. Mindee-style: use explicit tax field
  //   2. Fallback: infer from total − items sum (VAT shown as lump sum at bottom)
  //   3. Fallback: infer from total − subtotal
  let vatToDistribute = rawTax;
  if (vatToDistribute === 0 && totalAmount > 0 && itemsSum > 0 && (totalAmount - itemsSum) > 0.005) {
    vatToDistribute = round2(totalAmount - itemsSum);
  }
  if (vatToDistribute === 0 && subtotal > 0 && totalAmount > subtotal + 0.005) {
    vatToDistribute = round2(totalAmount - subtotal);
  }

  // Distribute VAT proportionally across line items
  const lineItems = validItems.map((li) => {
    const itemAmount = toNum(li.lineTotal);
    const vatShare   = itemsSum > 0 ? (itemAmount / itemsSum) * vatToDistribute : 0;
    return {
      description:     (li.lineText ?? '').trim(),
      amountBeforeVat: round2(itemAmount),
      vatShare:        round2(vatShare),
      amount:          round2(itemAmount + vatShare),
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
