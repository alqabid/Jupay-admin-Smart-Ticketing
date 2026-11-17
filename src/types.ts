export type CountryCode = 'UK' | 'CA' | 'USA';

export type ReceiverNetwork = 'MTN MoMo' | 'Telecel Cash' | 'AirtelTigo' | 'Bank';

export type TransferStatus =
  | 'Completed'
  | 'Network Delay'
  | 'Compliance Hold'
  | 'Pending Payout';

export type TicketStage =
  | 'Open'
  | 'In Progress (with Ops)'
  | 'Resolved'
  | 'Closed';

export type TicketPriority = 'Critical' | 'High' | 'Normal';

export type StaffRole = 'CS Agent' | 'Operations' | 'Compliance';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  department: string;
  is_active: boolean;
  on_shift: boolean;
  shift_label: string;
  departed_note?: string;
}

export interface TransferRecord {
  id: string;
  sender_name: string;
  sender_phone: string;
  sender_country: CountryCode;
  sender_tier: 'Tier 1' | 'Tier 2' | 'Tier 3';
  source_currency: 'GBP' | 'CAD' | 'USD';
  source_amount: number;
  ghs_amount: number;
  receiver_name: string;
  receiver_entered_name: string;
  receiver_kyc_name: string;
  receiver_phone: string;
  receiver_network: ReceiverNetwork;
  destination_city: string;
  transfer_status: TransferStatus;
  status_reason: string;
  dob_verified: boolean;
  id_verified: boolean;
  flag_type: 'network_delay' | 'compliance_mismatch' | 'interbank_clearing' | 'none';
  created_at: string;
}

export interface TicketEvent {
  id: string;
  timestamp: string;
  actor_name: string;
  actor_role: string;
  action: string;
  note: string;
}

export interface SmsNotification {
  id: string;
  ticket_id: string;
  transaction_id: string;
  recipient_name: string;
  recipient_phone: string;
  message: string;
  trigger_event: string;
  sent_at: string;
}

export interface Ticket {
  id: string;
  transaction_id: string;
  transfer: TransferRecord;
  issue_category: string;
  summary: string;
  ai_summary?: string;
  priority: TicketPriority;
  stage: TicketStage;
  pinned_escalation: boolean;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  sla_minutes: number;
  sla_deadline: string;
  resolved_at?: string;
  closed_at?: string;
  events: TicketEvent[];
}

export interface DashboardState {
  transfers: TransferRecord[];
  staff: StaffMember[];
  tickets: Ticket[];
  smsLogs: SmsNotification[];
}

export interface LegacyRowInput {
  transaction_id: string;
  legacy_sender?: string;
  legacy_amount?: string;
  legacy_network?: string;
  legacy_staff?: string;
  legacy_status?: string;
  issue_category?: string;
  notes?: string;
}

export interface ImportPreviewItem {
  rowIndex: number;
  raw_tx_id: string;
  normalized_tx_id: string;
  status: 'ready' | 'duplicate' | 'unmatched';
  transfer: TransferRecord | null;
  legacy_staff: string;
  ghost_staff_rerouted: boolean;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  mapped_stage: TicketStage;
  issue_category: string;
  notes: string;
}

