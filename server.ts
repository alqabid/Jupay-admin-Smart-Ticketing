import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import * as XLSX from 'xlsx';
import {
  getState,
  resetState,
  findTransferById,
  searchTransfers,
  createTicket,
  updateTicketStage,
  performTicketAction,
  setTicketAiSummary,
  toggleStaffStatus,
  previewLegacySheetImport,
  commitLegacySheetImport,
} from './src/server/store.ts';
import type { LegacyRowInput } from './src/types.ts';

dotenv.config();

const PORT = 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/state', (_req, res) => {
    res.json(getState());
  });

  app.get('/api/transfers', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ transfers: searchTransfers(q) });
  });

  app.get('/api/transfers/:id', (req, res) => {
    const transfer = findTransferById(req.params.id);
    if (!transfer) {
      res.status(404).json({ error: `Transaction ${req.params.id} not found` });
      return;
    }
    res.json({ transfer });
  });

  app.post('/api/tickets', (req, res) => {
    const result = createTicket(req.body);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ ticket: result.ticket, state: getState() });
  });

  app.patch('/api/tickets/:id/stage', (req, res) => {
    const result = updateTicketStage(req.params.id, req.body);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ticket: result.ticket, state: getState() });
  });

  app.post('/api/tickets/:id/action', (req, res) => {
    const { actionType, actorId, note } = req.body;
    const result = performTicketAction(req.params.id, actionType, actorId, note);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ticket: result.ticket, state: getState() });
  });

  app.post('/api/tickets/:id/ai-triage', async (req, res) => {
    const current = getState();
    const ticket = current.tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const t = ticket.transfer;
    const fallbackSummary =
      t.flag_type === 'compliance_mismatch'
        ? `Only name formatting differs ('${t.receiver_entered_name}' vs KYC '${t.receiver_kyc_name}'); DOB (${t.dob_verified ? 'verified' : 'pending'}) and Ghana Card ID (${t.id_verified ? 'clear' : 'pending'}) support one-click release.`
        : t.flag_type === 'network_delay'
          ? `${t.receiver_network} payout callback timed out after settlement from ${t.sender_country}. Sender ${t.sender_tier} verified; recommend immediate Ops payout re-trigger.`
          : `Interbank clearing queued for ${t.receiver_network} (${t.destination_city}). Confirm GIP batch reference and notify sender via SMS.`;

    const ai = getGeminiClient();
    if (!ai) {
      const updated = setTicketAiSummary(ticket.id, fallbackSummary);
      res.json({ ai_summary: fallbackSummary, ticket: updated, source: 'deterministic' });
      return;
    }

    try {
      const prompt = [
        `Transaction ID: ${t.id}`,
        `Sender: ${t.sender_name} (${t.sender_country}, ${t.sender_tier})`,
        `Amount: ${t.source_currency} ${t.source_amount} -> GHS ${t.ghs_amount}`,
        `Receiver Entered: ${t.receiver_entered_name} | KYC Name: ${t.receiver_kyc_name}`,
        `Network: ${t.receiver_network} (${t.destination_city})`,
        `Transfer Status: ${t.transfer_status}`,
        `Reason: ${t.status_reason}`,
        `DOB Verified: ${t.dob_verified} | ID Verified: ${t.id_verified}`,
        `Complaint: ${ticket.summary}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a concise Jupay remittance operations and compliance triage assistant. Return 1-2 crisp sentences (max 32 words) explaining the exact discrepancy or gateway issue and the immediate recommended action (e.g., confirm match & release, or re-trigger MoMo payout). Plain text only.',
        },
      });

      const summary = response.text?.trim() || fallbackSummary;
      const updated = setTicketAiSummary(ticket.id, summary);
      res.json({ ai_summary: summary, ticket: updated, source: 'gemini' });
    } catch {
      const updated = setTicketAiSummary(ticket.id, fallbackSummary);
      res.json({ ai_summary: fallbackSummary, ticket: updated, source: 'deterministic' });
    }
  });

  app.patch('/api/staff/:id', (req, res) => {
    const member = toggleStaffStatus(req.params.id, req.body);
    if (!member) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    res.json({ member, state: getState() });
  });

  app.post('/api/reset', (_req, res) => {
    res.json({ state: resetState() });
  });

  app.post('/api/import/google-sheet', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const match = rawUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      res.status(400).json({
        error: 'Enter a valid Google Sheets URL (docs.google.com/spreadsheets/d/...).',
      });
      return;
    }

    const sheetId = match[1];
    const gidMatch = rawUrl.match(/gid=(\d+)/);
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;

    try {
      const response = await fetch(exportUrl);
      if (!response.ok) {
        res.status(400).json({
          error:
            'Could not access this Google Sheet. Make sure link sharing is enabled, or download it as .xlsx / .csv and upload below.',
        });
        return;
      }
      const csvText = await response.text();
      if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
        res.status(400).json({
          error:
            'This Google Sheet requires sign-in. Download it as .xlsx or .csv from File → Download and upload it below.',
        });
        return;
      }

      const workbook = XLSX.read(csvText, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
      });
      const rows: LegacyRowInput[] = rawObjects.map((obj) => {
        const lower: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          lower[k.trim().toLowerCase()] = String(v ?? '').trim();
        }
        return {
          transaction_id:
            lower['transaction id'] ||
            lower['tx id'] ||
            lower['transaction_id'] ||
            lower['id'] ||
            lower['reference'] ||
            '',
          legacy_sender: lower['sender'] || lower['sender name'] || lower['customer'] || '',
          legacy_amount: lower['amount'] || lower['amount (ghs)'] || '',
          legacy_network: lower['network'] || lower['channel'] || '',
          legacy_staff:
            lower['assigned'] ||
            lower['assigned officer'] ||
            lower['officer'] ||
            lower['staff'] ||
            '',
          legacy_status: lower['status'] || lower['stage'] || '',
          issue_category: lower['category'] || lower['issue'] || '',
          notes: lower['notes'] || lower['complaint'] || lower['summary'] || '',
        };
      });

      const preview = previewLegacySheetImport(rows);
      res.json({ rows, preview });
    } catch {
      res.status(400).json({
        error:
          'Unable to fetch Google Sheet right now. Download as .xlsx / .csv or paste rows directly.',
      });
    }
  });

  app.post('/api/import/preview', (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? (req.body.rows as LegacyRowInput[]) : [];
    const preview = previewLegacySheetImport(rows);
    res.json({ preview });
  });

  app.post('/api/import/commit', (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? (req.body.rows as LegacyRowInput[]) : [];
    const actorId = typeof req.body?.actorId === 'string' ? req.body.actorId : 'STF-01';
    const result = commitLegacySheetImport(rows, actorId);
    res.json(result);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jupay Admin Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
