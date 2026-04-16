import { Router, Request, Response } from 'express';
import { uploadReceipt } from '../middleware/upload';

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
      return res.status(500).json({ error: 'TABSCANNER_API_KEY is not configured' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No receipt file provided' });
    }

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
    console.log('[Tabscanner] upload status:', uploadRes.status, '| body:', uploadRaw);

    if (!uploadRes.ok) {
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
      console.log('[Tabscanner] result in upload response');
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
      console.log(`[Tabscanner] poll #${attempt + 1} status:`, pollRes.status, '| body:', pollRaw.slice(0, 500));

      if (!pollRes.ok) continue;

      let pollData: any;
      try { pollData = JSON.parse(pollRaw); } catch { continue; }

      // Return as soon as a result object is present — don't rely solely on status string
      if (pollData?.result) {
        console.log('[Tabscanner] got result, status:', pollData?.status);
        return res.json(formatResult(pollData.result));
      }

      // Explicit failure
      if (pollData?.status === 'fail' || pollData?.status === 'error') {
        console.log('[Tabscanner] explicit failure:', pollData);
        return res.status(422).json({ error: 'Tabscanner could not read the receipt', details: pollData });
      }

      // Otherwise still pending — keep looping
    }

    return res.status(504).json({ error: 'Tabscanner timed out after 30s — try a clearer photo' });
  } catch (err) {
    console.error('[Tabscanner] unexpected error:', err);
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

  const rawItems   = raw.lineItems ?? [];
  const validItems = rawItems.filter((li) => toNum(li.lineTotal) > 0);
  const itemsSum   = validItems.reduce((s, li) => s + toNum(li.lineTotal), 0);

  let vatToDistribute = rawTax;
  if (vatToDistribute === 0 && totalAmount > 0 && itemsSum > 0 && (totalAmount - itemsSum) > 0.005) {
    vatToDistribute = round2(totalAmount - itemsSum);
  }
  if (vatToDistribute === 0 && subtotal > 0 && totalAmount > subtotal + 0.005) {
    vatToDistribute = round2(totalAmount - subtotal);
  }

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
