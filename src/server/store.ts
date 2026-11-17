import fs from 'fs';
import path from 'path';
import type {
  DashboardState,
  ImportPreviewItem,
  LegacyRowInput,
  Ticket,
  TicketPriority,
  TicketStage,
} from '../types.ts';
import { buildSeedState } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'jupay-state.json');

let state: DashboardState = loadInitialState();

function loadInitialState(): DashboardState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as DashboardState;
      if (parsed && Array.isArray(parsed.tickets) && Array.isArray(parsed.staff)) {
        return parsed;
      }
    }
  } catch {
    // Fall back to fresh seed state
  }
  const fresh = buildSeedState();
  persistState(fresh);
  return fresh;
}

function persistState(next: DashboardState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only environments
  }
}

export function getState(): DashboardState {
  return state;
}

export function resetState(): DashboardState {
  state = buildSeedState();
  persistState(state);
  return state;
}

export function findTransferById(id: string) {
  const normalized = id.trim().toUpperCase();
  return state.transfers.find((t) => t.id.toUpperCase() === normalized) ?? null;
}

export function searchTransfers(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return state.transfers;
  return state.transfers.filter(
    (t) =>
      t.id.toLowerCase().includes(q) ||
      t.sender_name.toLowerCase().includes(q) ||
      t.receiver_name.toLowerCase().includes(q) ||
      t.receiver_kyc_name.toLowerCase().includes(q) ||
      t.sender_phone.toLowerCase().includes(q) ||
      t.receiver_phone.toLowerCase().includes(q) ||
      t.receiver_network.toLowerCase().includes(q) ||
      t.destination_city.toLowerCase().includes(q)
  );
}

function findTransferByNameHint(hint: string) {
  const cleaned = hint
    .toLowerCase()
    .replace(/\b(uncle|auntie|aunty|dr\.?|mr\.?|mrs\.?|ms\.?)\b/g, '')
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 3);
  if (tokens.length === 0) return null;

  return (
    state.transfers.find((t) => {
      const haystack = `${t.sender_name} ${t.receiver_name} ${t.receiver_kyc_name}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    }) ?? null
  );
}

export function getActiveOnShiftStaff(preferredRole?: 'Operations' | 'Compliance' | 'CS Agent') {
  return state.staff.filter(
    (s) => s.is_active && s.on_shift && (!preferredRole || s.role === preferredRole)
  );
}

export function createTicket(input: {
  transaction_id: string;
  issue_category: string;
  summary: string;
  priority: TicketPriority;
  escalate_to_ops: boolean;
  assigned_to_id?: string | null;
  created_by_id: string;
}): { ticket?: Ticket; error?: string } {
  const transfer = findTransferById(input.transaction_id);
  if (!transfer) {
    return { error: `Transaction ID "${input.transaction_id}" was not found in the Jupay ledger.` };
  }

  const creator = state.staff.find((s) => s.id === input.created_by_id) ?? state.staff[0];
  let assignee = input.assigned_to_id
    ? state.staff.find((s) => s.id === input.assigned_to_id)
    : undefined;

  if (assignee && (!assignee.is_active || !assignee.on_shift)) {
    return {
      error: `${assignee.name} is inactive or off-shift and cannot receive tickets.`,
    };
  }

  if (input.escalate_to_ops && !assignee) {
    const preferredRole =
      transfer.flag_type === 'compliance_mismatch' ? 'Compliance' : 'Operations';
    const eligible = getActiveOnShiftStaff(preferredRole);
    const fallback = getActiveOnShiftStaff();
    assignee = eligible[0] ?? fallback[0];
  }

  const now = new Date();
  const slaMinutes =
    input.priority === 'Critical' ? 30 : input.escalate_to_ops ? 30 : 60;
  const deadline = new Date(now.getTime() + slaMinutes * 60_000).toISOString();
  const nextNum = 1043 + state.tickets.length;
  const ticketId = `TKT-${nextNum}`;

  const stage: TicketStage = input.escalate_to_ops ? 'In Progress (with Ops)' : 'Open';
  const pinned = input.escalate_to_ops || input.priority === 'Critical';

  const events = [
    {
      id: `EVT-${Date.now()}-1`,
      timestamp: now.toISOString(),
      actor_name: creator.name,
      actor_role: creator.role,
      action: 'Ticket Created via Transaction Auto-Fill',
      note: `Auto-filled ${transfer.id}: ${transfer.sender_name} (${transfer.sender_country}, ${transfer.sender_tier}) · GHS ${transfer.ghs_amount.toLocaleString()} via ${transfer.receiver_network}.`,
    },
  ];

  if (input.escalate_to_ops && assignee) {
    events.push({
      id: `EVT-${Date.now()}-2`,
      timestamp: now.toISOString(),
      actor_name: creator.name,
      actor_role: creator.role,
      action: `Escalated to ${assignee.role}`,
      note: `Auto-assigned to active on-duty officer ${assignee.name} with ${slaMinutes}-minute SLA timer.`,
    });

    state.smsLogs.unshift({
      id: `SMS-${Date.now()}`,
      ticket_id: ticketId,
      transaction_id: transfer.id,
      recipient_name: transfer.sender_name,
      recipient_phone: transfer.sender_phone,
      message: `Jupay Update: Ticket ${ticketId} opened for ${transfer.id} (GHS ${transfer.ghs_amount.toLocaleString()} to ${transfer.receiver_name} on ${transfer.receiver_network}). Active officer ${assignee.name} is resolving this now.`,
      trigger_event: 'Escalated to Ops',
      sent_at: now.toISOString(),
    });
  }

  const aiSummary =
    transfer.flag_type === 'compliance_mismatch'
      ? `Only minor beneficiary name variance ('${transfer.receiver_entered_name}' vs KYC '${transfer.receiver_kyc_name}'); DOB and ID verified.`
      : transfer.flag_type === 'network_delay'
        ? `${transfer.receiver_network} gateway delay confirmed. Sender KYC (${transfer.sender_tier}) clear; ready for immediate Ops payout re-trigger.`
        : undefined;

  const newTicket: Ticket = {
    id: ticketId,
    transaction_id: transfer.id,
    transfer,
    issue_category: input.issue_category,
    summary: input.summary.trim() || transfer.status_reason,
    ai_summary: aiSummary,
    priority: input.priority,
    stage,
    pinned_escalation: pinned,
    assigned_to_id: assignee?.id ?? null,
    assigned_to_name: assignee?.name ?? null,
    created_by_id: creator.id,
    created_by_name: creator.name,
    created_at: now.toISOString(),
    sla_minutes: slaMinutes,
    sla_deadline: deadline,
    events,
  };

  state.tickets.unshift(newTicket);
  persistState(state);
  return { ticket: newTicket };
}

export function updateTicketStage(
  ticketId: string,
  payload: {
    stage?: TicketStage;
    assigned_to_id?: string | null;
    actor_id?: string;
    note?: string;
  }
): { ticket?: Ticket; error?: string } {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) return { error: 'Ticket not found.' };

  const actor = state.staff.find((s) => s.id === payload.actor_id) ?? state.staff[0];

  if (payload.assigned_to_id !== undefined && payload.assigned_to_id !== null) {
    const target = state.staff.find((s) => s.id === payload.assigned_to_id);
    if (!target || !target.is_active || !target.on_shift) {
      return { error: 'Selected staff member is inactive or off-shift.' };
    }
    ticket.assigned_to_id = target.id;
    ticket.assigned_to_name = target.name;
  }

  if (payload.stage) {
    ticket.stage = payload.stage;
    const now = new Date().toISOString();
    if (payload.stage === 'Resolved') {
      ticket.resolved_at = now;
      ticket.pinned_escalation = false;
    } else if (payload.stage === 'Closed') {
      ticket.closed_at = now;
      ticket.pinned_escalation = false;
    }
  }

  ticket.events.push({
    id: `EVT-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor_name: actor.name,
    actor_role: actor.role,
    action: payload.stage ? `Stage → ${payload.stage}` : 'Assignment Updated',
    note:
      payload.note?.trim() ||
      (ticket.assigned_to_name
        ? `Assigned to ${ticket.assigned_to_name}.`
        : 'Updated ticket workflow.'),
  });

  persistState(state);
  return { ticket };
}

export function performTicketAction(
  ticketId: string,
  actionType: 'retrigger_payout' | 'confirm_compliance_release' | 'escalate_to_ops' | 'add_note',
  actorId: string,
  note?: string
): { ticket?: Ticket; error?: string } {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) return { error: 'Ticket not found.' };

  const actor = state.staff.find((s) => s.id === actorId) ?? state.staff[1];
  const now = new Date().toISOString();

  if (actionType === 'escalate_to_ops') {
    const opsStaff = getActiveOnShiftStaff('Operations')[0] ?? getActiveOnShiftStaff()[0];
    if (!opsStaff) return { error: 'No active on-shift Operations officer available.' };
    ticket.stage = 'In Progress (with Ops)';
    ticket.pinned_escalation = true;
    ticket.assigned_to_id = opsStaff.id;
    ticket.assigned_to_name = opsStaff.name;
    ticket.sla_minutes = 30;
    ticket.sla_deadline = new Date(Date.now() + 30 * 60_000).toISOString();
    ticket.events.push({
      id: `EVT-${Date.now()}`,
      timestamp: now,
      actor_name: actor.name,
      actor_role: actor.role,
      action: 'Escalated to Ops (30m SLA)',
      note: `Assigned to active on-duty officer ${opsStaff.name}.`,
    });
    state.smsLogs.unshift({
      id: `SMS-${Date.now()}`,
      ticket_id: ticket.id,
      transaction_id: ticket.transaction_id,
      recipient_name: ticket.transfer.sender_name,
      recipient_phone: ticket.transfer.sender_phone,
      message: `Jupay Update: ${ticket.transaction_id} escalated to Operations (${opsStaff.name}). Priority 30-min SLA active.`,
      trigger_event: 'Escalated to Ops',
      sent_at: now,
    });
  } else if (actionType === 'retrigger_payout') {
    const transfer = findTransferById(ticket.transaction_id);
    if (transfer) {
      transfer.transfer_status = 'Completed';
      transfer.status_reason = `${transfer.receiver_network} payout re-triggered by ${actor.name} and settled immediately.`;
      ticket.transfer = { ...transfer };
    }
    ticket.stage = 'Resolved';
    ticket.pinned_escalation = false;
    ticket.resolved_at = now;
    ticket.events.push({
      id: `EVT-${Date.now()}`,
      timestamp: now,
      actor_name: actor.name,
      actor_role: actor.role,
      action: `${ticket.transfer.receiver_network} Payout Re-triggered`,
      note: `GHS ${ticket.transfer.ghs_amount.toLocaleString()} credited to ${ticket.transfer.receiver_name} (${ticket.transfer.receiver_phone}). Automatic SMS sent to ${ticket.transfer.sender_name}.`,
    });
    state.smsLogs.unshift({
      id: `SMS-${Date.now()}`,
      ticket_id: ticket.id,
      transaction_id: ticket.transaction_id,
      recipient_name: ticket.transfer.sender_name,
      recipient_phone: ticket.transfer.sender_phone,
      message: `Jupay Confirmed: Your transfer ${ticket.transaction_id} (GHS ${ticket.transfer.ghs_amount.toLocaleString()}) has landed in ${ticket.transfer.receiver_name}'s ${ticket.transfer.receiver_network} wallet.`,
      trigger_event: 'Payout Re-triggered & Settled',
      sent_at: now,
    });
  } else if (actionType === 'confirm_compliance_release') {
    const transfer = findTransferById(ticket.transaction_id);
    if (transfer) {
      transfer.transfer_status = 'Completed';
      transfer.status_reason = `Compliance match confirmed by ${actor.name}; funds released to ${transfer.receiver_network} wallet.`;
      ticket.transfer = { ...transfer };
    }
    ticket.stage = 'Resolved';
    ticket.pinned_escalation = false;
    ticket.resolved_at = now;
    ticket.events.push({
      id: `EVT-${Date.now()}`,
      timestamp: now,
      actor_name: actor.name,
      actor_role: actor.role,
      action: 'Compliance Match Confirmed · Funds Released',
      note: `Verified DOB & Ghana Card ID match. Released GHS ${ticket.transfer.ghs_amount.toLocaleString()} to ${ticket.transfer.receiver_name} (${ticket.transfer.receiver_network}).`,
    });
    state.smsLogs.unshift({
      id: `SMS-${Date.now()}`,
      ticket_id: ticket.id,
      transaction_id: ticket.transaction_id,
      recipient_name: ticket.transfer.sender_name,
      recipient_phone: ticket.transfer.sender_phone,
      message: `Jupay Confirmed: Compliance check cleared for ${ticket.transaction_id}. GHS ${ticket.transfer.ghs_amount.toLocaleString()} released to ${ticket.transfer.receiver_name} (${ticket.transfer.receiver_network}).`,
      trigger_event: 'Compliance Release',
      sent_at: now,
    });
  } else if (actionType === 'add_note' && note?.trim()) {
    ticket.events.push({
      id: `EVT-${Date.now()}`,
      timestamp: now,
      actor_name: actor.name,
      actor_role: actor.role,
      action: 'Internal Note',
      note: note.trim(),
    });
  }

  persistState(state);
  return { ticket };
}

export function setTicketAiSummary(ticketId: string, aiSummary: string) {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) return null;
  ticket.ai_summary = aiSummary;
  persistState(state);
  return ticket;
}

export function toggleStaffStatus(
  staffId: string,
  updates: { is_active?: boolean; on_shift?: boolean }
) {
  const member = state.staff.find((s) => s.id === staffId);
  if (!member) return null;

  if (typeof updates.is_active === 'boolean') {
    member.is_active = updates.is_active;
    if (!updates.is_active) {
      member.on_shift = false;
      member.departed_note = 'Deactivated by Admin (Removed from assignment dropdowns)';
    } else {
      member.departed_note = undefined;
    }
  }
  if (typeof updates.on_shift === 'boolean') {
    member.on_shift = member.is_active ? updates.on_shift : false;
  }

  persistState(state);
  return member;
}

function normalizeTxId(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (/^JP\d+$/.test(cleaned)) {
    return `JP-${cleaned.slice(2)}`;
  }
  return raw.trim().toUpperCase().replace(/\s+/g, '-');
}

function mapLegacyStage(raw?: string): TicketStage {
  const val = (raw ?? '').trim().toLowerCase();
  if (val.includes('close')) return 'Closed';
  if (val.includes('resolv') || val.includes('done') || val.includes('settled') || val.includes('fix')) {
    return 'Resolved';
  }
  if (val.includes('progress') || val.includes('ops') || val.includes('escalat') || val.includes('hold')) {
    return 'In Progress (with Ops)';
  }
  return 'Open';
}

export function previewLegacySheetImport(rows: LegacyRowInput[]): ImportPreviewItem[] {
  return rows.map((row, idx) => {
    const rawTx = (row.transaction_id ?? '').trim();
    const normalizedTx = rawTx ? normalizeTxId(rawTx) : '';
    let transfer = normalizedTx ? findTransferById(normalizedTx) : null;
    if (!transfer && row.legacy_sender) {
      transfer = findTransferByNameHint(row.legacy_sender);
    }
    if (!transfer && rawTx) {
      transfer = findTransferByNameHint(rawTx);
    }
    const resolvedTxId = transfer?.id ?? normalizedTx;
    const alreadyExists = resolvedTxId
      ? state.tickets.some((t) => t.transaction_id.toUpperCase() === resolvedTxId.toUpperCase())
      : false;

    const legacyStaffName = (row.legacy_staff ?? '').trim();
    const matchedStaff = legacyStaffName
      ? state.staff.find((s) => s.name.toLowerCase() === legacyStaffName.toLowerCase())
      : undefined;

    let assignedStaff =
      matchedStaff && matchedStaff.is_active && matchedStaff.on_shift ? matchedStaff : undefined;
    let ghostRerouted = false;

    if (!assignedStaff) {
      if (legacyStaffName) {
        ghostRerouted = true;
      }
      const preferredRole =
        transfer?.flag_type === 'compliance_mismatch' ? 'Compliance' : 'Operations';
      assignedStaff =
        getActiveOnShiftStaff(preferredRole)[0] ?? getActiveOnShiftStaff()[0] ?? undefined;
    }

    const status: ImportPreviewItem['status'] = !transfer
      ? 'unmatched'
      : alreadyExists
        ? 'duplicate'
        : 'ready';

    const defaultCategory =
      row.issue_category?.trim() ||
      (transfer?.flag_type === 'compliance_mismatch'
        ? 'Compliance Name-Mismatch Hold'
        : transfer?.flag_type === 'interbank_clearing'
          ? 'Bank Clearing Delay'
          : 'Delayed Wallet Payout');

    return {
      rowIndex: idx + 1,
      raw_tx_id: rawTx || row.legacy_sender || '—',
      normalized_tx_id: resolvedTxId || '—',
      status,
      transfer,
      legacy_staff: legacyStaffName || 'Unassigned',
      ghost_staff_rerouted: ghostRerouted,
      assigned_staff_id: assignedStaff?.id ?? null,
      assigned_staff_name: assignedStaff?.name ?? null,
      mapped_stage: mapLegacyStage(row.legacy_status),
      issue_category: defaultCategory,
      notes: row.notes?.trim() || transfer?.status_reason || '',
    };
  });
}

export function commitLegacySheetImport(rows: LegacyRowInput[], actorId: string) {
  const preview = previewLegacySheetImport(rows);
  const actor = state.staff.find((s) => s.id === actorId) ?? state.staff[0];

  let importedCount = 0;
  let reroutedCount = 0;
  let skippedCount = 0;

  for (const item of preview) {
    if (item.status !== 'ready' || !item.transfer) {
      skippedCount += 1;
      continue;
    }

    const t = item.transfer;
    const now = new Date();
    const slaMinutes = t.flag_type === 'compliance_mismatch' ? 60 : 30;
    const deadline = new Date(now.getTime() + slaMinutes * 60_000).toISOString();
    const nextNum = 1043 + state.tickets.length;
    const ticketId = `TKT-${nextNum}`;
    const priority: TicketPriority =
      t.flag_type === 'compliance_mismatch'
        ? 'Critical'
        : t.flag_type === 'network_delay'
          ? 'High'
          : 'Normal';

    if (item.ghost_staff_rerouted) {
      reroutedCount += 1;
    }

    const migrationNote = item.ghost_staff_rerouted
      ? `Imported from legacy sheet. Replaced inactive/off-shift staff "${item.legacy_staff}" with active officer ${item.assigned_staff_name}.`
      : `Imported from legacy sheet and auto-verified against Jupay ledger (${t.id}).`;

    const ticket: Ticket = {
      id: ticketId,
      transaction_id: t.id,
      transfer: t,
      issue_category: item.issue_category,
      summary: item.notes || t.status_reason,
      ai_summary:
        t.flag_type === 'compliance_mismatch'
          ? `Only minor name variance ('${t.receiver_entered_name}' vs KYC '${t.receiver_kyc_name}'); DOB and ID verified.`
          : t.flag_type === 'network_delay'
            ? `${t.receiver_network} gateway delay verified from ledger. Ready for Ops payout re-trigger.`
            : undefined,
      priority,
      stage: item.mapped_stage,
      pinned_escalation:
        item.mapped_stage !== 'Resolved' &&
        item.mapped_stage !== 'Closed' &&
        (priority === 'Critical' || priority === 'High'),
      assigned_to_id: item.assigned_staff_id,
      assigned_to_name: item.assigned_staff_name,
      created_by_id: actor.id,
      created_by_name: actor.name,
      created_at: now.toISOString(),
      sla_minutes: slaMinutes,
      sla_deadline: deadline,
      events: [
        {
          id: `EVT-${Date.now()}-${item.rowIndex}`,
          timestamp: now.toISOString(),
          actor_name: actor.name,
          actor_role: actor.role,
          action: 'Migrated from Legacy Sheet',
          note: migrationNote,
        },
      ],
    };

    state.tickets.unshift(ticket);
    importedCount += 1;
  }

  persistState(state);
  return { importedCount, reroutedCount, skippedCount, state };
}

