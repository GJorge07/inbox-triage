import type { TriageFlag } from "./types";

const CHURN_KEYWORDS = [
  "cancelar",
  "cancela",
  "cancelamento",
  "cancel",
  "trocar",
  "trocando",
  "vou trocar",
  "switch",
  "reembolso",
  "reembolsar",
  "refund",
  "desistir",
  "desisti",
  "encerrar conta",
  "encerrar minha conta",
  "unhappy",
  "disappointed",
  "leaving",
  "alternative",
  "competitor",
  "too expensive",
  "caro demais",
  "não vou renovar",
  "nao vou renovar",
  "pensando em cancelar",
  "pensando em trocar",
  "considerando outras",
  "vou cancelar",
  "quero cancelar",
  "thinking of switching",
  "considering alternatives",
  "frustrado",
  "insatisfeito",
  "muito ruim",
  "péssimo serviço",
  "reconsiderando",
];

export function containsChurnSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return CHURN_KEYWORDS.some((kw) => lower.includes(kw));
}

function hoursSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3_600_000;
}

interface TicketInput {
  customerSegment: string;
  plan: string;
  channel: string;
  status: string;
  priority: string;
  subject: string;
  bodyPreview: string;
  createdAt: string;
  lastReplyAt: string | null;
  lastReplyBy: string | null;
  replyCount: number;
  previousOpenTicketsForCustomer: number;
}

export function computeTriageFlags(t: TicketInput): TriageFlag[] {
  const flags: TriageFlag[] = [];
  const text = `${t.subject} ${t.bodyPreview}`;
  const hoursOld = hoursSince(t.createdAt);
  const isActive = !["RESOLVED", "CLOSED"].includes(t.status);
  const hasNoAgentReply =
    t.lastReplyAt === null || t.lastReplyBy === "CUSTOMER";

  if (containsChurnSignal(text)) flags.push("churn_signal");

  // ENT SLA breach: >4h without any agent reply
  if (t.customerSegment === "ENT" && isActive && hasNoAgentReply && hoursOld > 4)
    flags.push("ent_sla_breach");

  // URGENT ticket sitting >4h unreplied
  if (t.priority === "URGENT" && isActive && hasNoAgentReply && hoursOld > 4)
    flags.push("urgent_overdue");

  // Customer opened 3+ tickets — systemic issue or at-risk account
  if (t.previousOpenTicketsForCustomer >= 3) flags.push("repeat_distress");

  // Sitting in NEW for >48h — nobody picked it up
  if (t.status === "NEW" && hoursOld > 48) flags.push("stale_new");

  // Many back-and-forths with no resolution
  if (t.replyCount >= 5 && isActive) flags.push("high_reply_no_resolution");

  // Enterprise plan always warrants attention
  if (t.plan === "ENTERPRISE") flags.push("enterprise_plan");

  // Never received any reply
  if (!t.lastReplyAt && isActive) flags.push("no_response");

  // Phone callback = customer tried harder than email
  if (t.channel === "PHONE_CALLBACK") flags.push("phone_callback");

  return flags;
}

export function computeRiskScore(t: TicketInput): number {
  let score = 0;
  const text = `${t.subject} ${t.bodyPreview}`;
  const hoursOld = hoursSince(t.createdAt);
  const isActive = !["RESOLVED", "CLOSED"].includes(t.status);
  const hasNoAgentReply =
    t.lastReplyAt === null || t.lastReplyBy === "CUSTOMER";

  // Segment (revenue exposure)
  if (t.customerSegment === "ENT") score += 20;
  else if (t.customerSegment === "MID") score += 10;
  else score += 3;

  // Plan (contract value proxy)
  if (t.plan === "ENTERPRISE") score += 20;
  else if (t.plan === "GROWTH") score += 8;
  else if (t.plan === "STARTER") score += 3;

  // Churn signal is the highest-impact single factor
  if (containsChurnSignal(text)) score += 35;

  // Time without agent response (urgency degrades fast)
  if (isActive && hasNoAgentReply) {
    if (hoursOld > 48) score += 20;
    else if (hoursOld > 24) score += 15;
    else if (hoursOld > 8) score += 10;
    else if (hoursOld > 4) score += 7;
    else if (hoursOld > 2) score += 3;
  }

  // Self-reported priority — adjusted because customers over/under-report
  if (t.priority === "URGENT") score += 8;
  else if (t.priority === "HIGH") score += 5;
  else if (t.priority === "MEDIUM") score += 2;

  // Repeat opener = distressed account
  if (t.previousOpenTicketsForCustomer >= 5) score += 15;
  else if (t.previousOpenTicketsForCustomer >= 3) score += 10;
  else if (t.previousOpenTicketsForCustomer >= 1) score += 3;

  // Stuck with lots of replies but no resolution
  if (t.replyCount >= 8 && isActive) score += 12;
  else if (t.replyCount >= 5 && isActive) score += 8;

  // Phone callback = high customer effort, deserves faster response
  if (t.channel === "PHONE_CALLBACK") score += 5;

  return Math.min(100, Math.round(score));
}

// Valid state machine transitions
export const STATE_TRANSITIONS: Record<string, string[]> = {
  NEW: ["TRIAGED", "IN_PROGRESS", "ESCALATED", "CLOSED"],
  TRIAGED: ["IN_PROGRESS", "ESCALATED", "CLOSED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "RESOLVED", "ESCALATED"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "WAITING_CUSTOMER"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "TRIAGED"],
};

export function isValidTransition(from: string, to: string): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const TRIAGE_FLAG_LABELS: Record<TriageFlag, string> = {
  churn_signal: "Risco de Churn",
  ent_sla_breach: "SLA Enterprise",
  urgent_overdue: "Urgente Atrasado",
  repeat_distress: "Cliente Repetido",
  stale_new: "Parado",
  high_reply_no_resolution: "Travado",
  enterprise_plan: "Enterprise",
  no_response: "Sem Resposta",
  phone_callback: "Ligou",
};
