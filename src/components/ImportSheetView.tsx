import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Link2,
  Upload,
} from 'lucide-react';
import type { ImportPreviewItem, LegacyRowInput, Ticket } from '../types.ts';

interface ImportSheetViewProps {
  tickets: Ticket[];
  actorId: string;
  onImportComplete: (summary: {
    importedCount: number;
    reroutedCount: number;
    skippedCount: number;
    state: any;
  }) => void;
}

type SourceMode = 'file' | 'google' | 'paste';

const SAMPLE_LEGACY_ROWS: LegacyRowInput[] = [
  {
    transaction_id: 'jp 48213',
    legacy_sender: 'Uncle Kwame',
    legacy_amount: 'GHS 6000',
    legacy_network: 'MTN MoMo',
    legacy_staff: 'Kwesi Boateng',
    legacy_status: 'In Progress',
    issue_category: 'Delayed Wallet Payout',
    notes: 'School fees for Abena at KNUST Kumasi held 30m on MTN MoMo',
  },
  {
    transaction_id: 'JP-48501',
    legacy_sender: 'Dr. Tetteh',
    legacy_amount: 'GHS 9300',
    legacy_network: 'Stanbic Bank',
    legacy_staff: 'Priscilla Owusu',
    legacy_status: 'On Hold',
    issue_category: 'Compliance Name-Mismatch Hold',
    notes: 'Abbreviated business beneficiary name needs Compliance sign-off',
  },
  {
    transaction_id: 'JP-48622',
    legacy_sender: 'Maame Efua',
    legacy_amount: 'GHS 2500',
    legacy_network: 'Telecel',
    legacy_staff: 'Yaw Boakye',
    legacy_status: 'Open',
    issue_category: 'Delayed Wallet Payout',
    notes: 'Telecel Cash wallet credit timeout in Osu',
  },
  {
    transaction_id: 'JP-49107',
    legacy_sender: 'Auntie Ama',
    legacy_amount: 'GHS 2750',
    legacy_network: 'Telecel Cash',
    legacy_staff: 'Daniel Nkrumah',
    legacy_status: 'In Progress',
    notes: 'Already logged in Jupay dashboard (duplicate check)',
  },
];

function mapRawObjectsToRows(rawObjects: Record<string, unknown>[]): LegacyRowInput[] {
  return rawObjects
    .map((obj) => {
      const lower: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        lower[k.trim().toLowerCase()] = String(v ?? '').trim();
      }
      return {
        transaction_id:
          lower['transaction id'] ||
          lower['tx id'] ||
          lower['transaction_id'] ||
          lower['tx_id'] ||
          lower['id'] ||
          lower['reference'] ||
          '',
        legacy_sender: lower['sender'] || lower['sender name'] || lower['customer'] || '',
        legacy_amount: lower['amount'] || lower['amount (ghs)'] || lower['ghs'] || '',
        legacy_network: lower['network'] || lower['channel'] || lower['rail'] || '',
        legacy_staff:
          lower['assigned'] ||
          lower['assigned officer'] ||
          lower['officer'] ||
          lower['staff'] ||
          lower['owner'] ||
          '',
        legacy_status: lower['status'] || lower['stage'] || '',
        issue_category: lower['category'] || lower['issue'] || '',
        notes: lower['notes'] || lower['complaint'] || lower['summary'] || '',
      };
    })
    .filter((r) => r.transaction_id.length > 0 || (r.legacy_sender ?? '').length > 0);
}

export function ImportSheetView({ tickets, actorId, onImportComplete }: ImportSheetViewProps) {
  const [mode, setMode] = useState<SourceMode>('file');
  const [googleUrl, setGoogleUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [sourceRows, setSourceRows] = useState<LegacyRowInput[]>([]);
  const [preview, setPreview] = useState<ImportPreviewItem[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const runPreview = async (rows: LegacyRowInput[], label = '') => {
    if (rows.length === 0) {
      setError('No rows with a Transaction ID or Sender name were found.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Preview failed');
      setSourceRows(rows);
      setPreview(json.preview);
      setFileName(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse rows.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
      });
      const parsed = mapRawObjectsToRows(rawObjects);
      await runPreview(parsed, file.name);
    } catch {
      setError('Could not read file. Use .xlsx, .xls, or .csv exported from Google Sheets or Excel.');
    }
  };

  const handleGoogleFetch = async () => {
    if (!googleUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import/google-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not fetch Google Sheet');
      setSourceRows(json.rows);
      setPreview(json.preview);
      setFileName('Google Sheet Export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch Google Sheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleParsePaste = async () => {
    if (!pasteText.trim()) return;
    try {
      const workbook = XLSX.read(pasteText.trim(), { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
      });
      const parsed = mapRawObjectsToRows(rawObjects);
      await runPreview(parsed, 'Pasted Sheet Data');
    } catch {
      setError('Include a header row (e.g. Transaction ID, Assigned Officer, Status, Notes).');
    }
  };

  const handleDownloadTemplateXlsx = () => {
    const sheetRows = SAMPLE_LEGACY_ROWS.slice(0, 2).map((r) => ({
      'Transaction ID': r.transaction_id.toUpperCase().replace(/\s+/g, '-'),
      Sender: r.legacy_sender,
      Amount: r.legacy_amount,
      Network: r.legacy_network,
      'Assigned Officer': r.legacy_staff,
      Status: r.legacy_status,
      Category: r.issue_category ?? '',
      Notes: r.notes ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Complaints_Template');
    XLSX.writeFile(wb, 'jupay_complaints_template.xlsx');
  };

  const handleExportSystem = (format: 'xlsx' | 'csv') => {
    const exportRows = tickets.map((t) => ({
      'Ticket ID': t.id,
      'Transaction ID': t.transaction_id,
      Sender: t.transfer.sender_name,
      Country: t.transfer.sender_country,
      Receiver: t.transfer.receiver_name,
      Network: t.transfer.receiver_network,
      'Amount (GHS)': t.transfer.ghs_amount,
      Category: t.issue_category,
      Stage: t.stage,
      'Assigned Officer': t.assigned_to_name ?? 'Unassigned',
      'Created At': t.created_at,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jupay_Tickets');
    XLSX.writeFile(wb, `jupay_tickets_export.${format}`);
  };

  const handleCommitImport = async () => {
    if (sourceRows.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: sourceRows, actorId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setSourceRows([]);
      setPreview([]);
      setFileName('');
      onImportComplete(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import rows.');
    } finally {
      setCommitting(false);
    }
  };

  const readyCount = preview.filter((p) => p.status === 'ready').length;
  const reroutedCount = preview.filter((p) => p.status === 'ready' && p.ghost_staff_rerouted).length;
  const skippedCount = preview.filter((p) => p.status !== 'ready').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#161c2d]">Import & Export Sheets</h1>
          <p className="text-xs text-[#869ab8] mt-1">
            Migrate Google Sheets, Excel (.xlsx), or CSV logs — auto-verifies Transaction IDs and replaces departed ghost staff
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleExportSystem('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#384c74] bg-white border border-[#E6EBF2] hover:bg-[#F7F9FC] rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportSystem('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#14426b] bg-[#F0F4F9] hover:bg-[#E4ECF5] rounded-lg transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Source Input Card */}
      <div className="card-surface rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#F2F5F9] rounded-lg">
            {(
              [
                { id: 'file', label: 'Excel / CSV File' },
                { id: 'google', label: 'Google Sheet URL' },
                { id: 'paste', label: 'Paste Rows' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMode(tab.id);
                  setError(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-white text-[#14426b] shadow-sm'
                    : 'text-[#506690] hover:text-[#161c2d]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplateXlsx}
            className="px-3 py-1.5 text-xs font-medium text-[#14426b] bg-[#F0F4F9] hover:bg-[#E4ECF5] rounded-lg transition-colors whitespace-nowrap"
          >
            Download Template .xlsx
          </button>
        </div>

        {mode === 'file' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileUpload(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-[#CBD5E1] hover:border-[#14426b] bg-[#FAFCFF] rounded-xl p-8 text-center cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <Upload className="w-6 h-6 text-[#14426b] mx-auto mb-2.5" />
            <div className="text-sm font-medium text-[#161c2d]">
              Drop Excel (.xlsx / .xls) or Google Sheet CSV here, or click to browse
            </div>
            <div className="text-xs text-[#869ab8] mt-1">
              Matches Transaction ID column automatically · Cross-checks ledger & active staff
            </div>
          </div>
        )}

        {mode === 'google' && (
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-[#869ab8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={googleUrl}
                  onChange={(e) => setGoogleUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
                />
              </div>
              <button
                type="button"
                disabled={loading || !googleUrl.trim()}
                onClick={handleGoogleFetch}
                className="px-4 py-2.5 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                {loading ? 'Fetching...' : 'Fetch Google Sheet'}
              </button>
            </div>
            <p className="text-xs text-[#869ab8]">
              Works for shared Google Sheets (Anyone with link). Private sheets can be exported via File → Download → Excel (.xlsx) and uploaded here.
            </p>
          </div>
        )}

        {mode === 'paste' && (
          <div className="space-y-3">
            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Transaction ID\tSender\tAssigned Officer\tStatus\tNotes\nJP-48213\tKwame Boateng\tKwesi Boateng\tIn Progress\tMTN MoMo delayed`}
              className="w-full p-3 text-xs font-mono bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={loading || !pasteText.trim()}
                onClick={handleParsePaste}
                className="px-4 py-2 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                Parse Pasted Rows
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-[#FFF5F5] rounded-lg text-xs text-[#C62828] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Audit Preview */}
      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-[#161c2d]">Migration Audit</span>
              {fileName && <span className="text-xs text-[#869ab8]">· {fileName}</span>}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreview([]);
                  setSourceRows([]);
                  setFileName('');
                }}
                className="px-3 py-1.5 text-xs font-medium text-[#506690] hover:text-[#161c2d] rounded-lg transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={committing || readyCount === 0}
                onClick={handleCommitImport}
                className="px-4 py-2 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                {committing ? 'Importing...' : `Import ${readyCount} Tickets`}
              </button>
            </div>
          </div>

          <div className="card-surface rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#EEF2F7]">
            <div className="p-4">
              <div className="text-xs text-[#506690]">Parsed Rows</div>
              <div className="text-xl font-semibold text-[#161c2d] mt-1 tabular-nums">
                {preview.length}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#506690]">Verified & Ready</div>
              <div className="text-xl font-semibold text-[#2E7D32] mt-1 tabular-nums">
                {readyCount}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#506690]">Ghost Staff Rerouted</div>
              <div className="text-xl font-semibold text-[#14426b] mt-1 tabular-nums">
                {reroutedCount}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#506690]">Duplicates / Skipped</div>
              <div className="text-xl font-semibold text-[#869ab8] mt-1 tabular-nums">
                {skippedCount}
              </div>
            </div>
          </div>

          <div className="card-surface rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EEF2F7] text-xs font-medium text-[#869ab8]">
                    <th className="py-3.5 px-5">Row</th>
                    <th className="py-3.5 px-5">Tx ID Normalized</th>
                    <th className="py-3.5 px-5">Verified Ledger Match</th>
                    <th className="py-3.5 px-5">Staff Sync</th>
                    <th className="py-3.5 px-5">Stage</th>
                    <th className="py-3.5 px-5 text-right">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-sm">
                  {preview.map((item) => (
                    <tr key={item.rowIndex} className="hover:bg-[#F9FBFE]">
                      <td className="py-3.5 px-5 text-xs text-[#869ab8] tabular-nums">
                        #{item.rowIndex}
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="font-mono text-xs font-medium text-[#14426b]">
                          {item.normalized_tx_id}
                        </div>
                        {item.raw_tx_id !== item.normalized_tx_id && (
                          <div className="text-[11px] text-[#869ab8] font-mono">
                            from "{item.raw_tx_id}"
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        {item.transfer ? (
                          <div>
                            <div className="font-medium text-[#161c2d] text-xs">
                              {item.transfer.sender_name} → {item.transfer.receiver_name}
                            </div>
                            <div className="text-xs text-[#869ab8]">
                              {item.transfer.receiver_network} · GHS{' '}
                              {item.transfer.ghs_amount.toLocaleString('en-GH')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[#C62828]">Not in ledger</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-xs">
                        {item.ghost_staff_rerouted ? (
                          <div className="flex items-center gap-1.5">
                            <span className="line-through text-[#C62828]">
                              {item.legacy_staff}
                            </span>
                            <ArrowRight className="w-3 h-3 text-[#869ab8]" />
                            <span className="font-medium text-[#14426b]">
                              {item.assigned_staff_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#161c2d]">{item.assigned_staff_name}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-[#506690] whitespace-nowrap">
                        {item.mapped_stage}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap text-xs">
                        {item.status === 'ready' && (
                          <span className="inline-flex items-center gap-1 font-medium text-[#2E7D32]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Ready</span>
                          </span>
                        )}
                        {item.status === 'duplicate' && (
                          <span className="text-[#869ab8]">Already logged</span>
                        )}
                        {item.status === 'unmatched' && (
                          <span className="text-[#C62828]">Unknown Tx ID</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
