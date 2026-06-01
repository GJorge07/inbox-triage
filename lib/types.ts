export type CustomerSegment = "SMB" | "MID" | "ENT";
export type Plan = "FREE" | "STARTER" | "GROWTH" | "ENTERPRISE";
export type Channel = "EMAIL" | "CHAT" | "WHATSAPP" | "PHONE_CALLBACK";
export type TicketStatus =
  | "NEW"
  | "TRIAGED"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED"
  | "ESCALATED"
  | "REOPENED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type Category =
  | "BILLING"
  | "BUG"
  | "FEATURE_REQUEST"
  | "HOW_TO"
  | "CHURN_SIGNAL"
  | "OTHER";
export type LastReplyBy = "CUSTOMER" | "AGENT";
export type CloseReason =
  | "RESOLVED_FIXED"
  | "RESOLVED_INFO"
  | "DUPLICATE"
  | "NOT_REPRODUCIBLE"
  | "WONT_FIX"
  | "CUSTOMER_NO_RESPONSE";

export type TriageFlag =
  | "churn_signal"
  | "ent_sla_breach"
  | "urgent_overdue"
  | "repeat_distress"
  | "stale_new"
  | "high_reply_no_resolution"
  | "enterprise_plan"
  | "no_response"
  | "phone_callback";

export interface Ticket {
  ticketId: string;
  customerId: string;
  customerName: string;
  customerSegment: CustomerSegment;
  plan: Plan;
  channel: Channel;
  subject: string;
  bodyPreview: string;
  createdAt: string;
  lastReplyAt: string | null;
  lastReplyBy: LastReplyBy | null;
  replyCount: number;
  status: TicketStatus;
  priority: Priority;
  assignedTo: string | null;
  category: Category | null;
  previousOpenTicketsForCustomer: number;
  riskScore: number;
  triageFlags: TriageFlag[];
  mergedIntoId: string | null;
  closeReason: string | null;
}

export interface Reply {
  id: number;
  ticketId: string;
  author: string;
  authorType: "USER" | "AI_AGENT" | "CUSTOMER";
  body: string;
  createdAt: string;
}

export interface AuditEvent {
  id: number;
  ticketId: string;
  action: string;
  actor: string;
  actorType: "USER" | "AI_AGENT";
  before: string | null;
  after: string | null;
  reason: string | null;
  createdAt: string;
}

export interface TicketListResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  totalOpen: number;
  newToday: number;
  resolvedToday: number;
  churnSignalCount: number;
  unrepliedCount: number;
  medianFirstResponseHours: number | null;
  bySegment: { segment: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byChannel: { channel: string; count: number }[];
  volumeByDay: { date: string; count: number }[];
  topAgents: { agent: string; open: number; resolved: number }[];
  topCustomers: {
    customerId: string;
    customerName: string;
    segment: string;
    count: number;
  }[];
  riskDistribution: { range: string; count: number }[];
}
