import type { TriageFlag } from "./types";

// ── Churn keywords ────────────────────────────────────────────────────────────
const CHURN_KEYWORDS = [
  "cancelar", "cancela", "cancelamento", "cancel",
  "trocar", "trocando", "vou trocar", "switch",
  "reembolso", "reembolsar", "refund",
  "desistir", "desisti", "encerrar conta", "encerrar minha conta",
  "unhappy", "disappointed", "leaving", "alternative", "competitor",
  "too expensive", "caro demais",
  "não vou renovar", "nao vou renovar",
  "pensando em cancelar", "pensando em trocar", "considerando outras",
  "vou cancelar", "quero cancelar",
  "thinking of switching", "considering alternatives",
  "frustrado", "insatisfeito", "muito ruim", "péssimo serviço", "reconsiderando",
];

export function containsChurnSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return CHURN_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Hidden urgency keywords ───────────────────────────────────────────────────
// Sinais de criticidade real que independem da prioridade declarada pelo cliente.
// Captura o caso: "cliente marcou Médio mas o sistema está fora do ar".
const HIDDEN_URGENCY_KEYWORDS = [
  // Sistema fora
  "sistema parado", "sistema fora", "fora do ar", "site fora", "app fora",
  "aplicativo fora", "plataforma fora", "parou de funcionar", "sistema caiu",
  "servidor fora", "serviço fora", "indisponível",
  // Sem acesso
  "não consigo acessar", "nao consigo acessar", "sem acesso", "perdemos acesso",
  "bloqueado completamente", "impossível trabalhar", "nao consigo entrar",
  "não consigo entrar", "travado", "não abre", "nao abre",
  // Impacto operacional
  "produção parada", "operação parada", "afetando todos", "todos os usuários",
  "toda a equipe", "equipe inteira", "nenhum usuário consegue",
  "impede o trabalho", "impossível operar",
  // Perda de dados / segurança
  "perda de dados", "dados perdidos", "dados sumidos", "dados apagados",
  "vazamento", "brecha", "invasão", "acesso indevido",
  // Impacto financeiro direto
  "cobrança indevida", "cobrado errado", "cobrado em dobro",
  "pagamento duplicado", "débito incorreto",
  // Inglês
  "down", "outage", "production down", "critical error", "data loss",
  "security breach", "cannot access", "system crashed", "no access",
];

export function containsHiddenUrgency(text: string): boolean {
  const lower = text.toLowerCase();
  return HIDDEN_URGENCY_KEYWORDS.some((kw) => lower.includes(kw));
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
  const hasNoAgentReply = t.lastReplyAt === null || t.lastReplyBy === "CUSTOMER";
  const isChurn = containsChurnSignal(text);
  const isHiddenUrgent = containsHiddenUrgency(text);

  // ── Existentes ─────────────────────────────────────────────────────────────

  if (isChurn) flags.push("churn_signal");

  if (t.customerSegment === "ENT" && isActive && hasNoAgentReply && hoursOld > 4)
    flags.push("ent_sla_breach");

  if (t.priority === "URGENT" && isActive && hasNoAgentReply && hoursOld > 4)
    flags.push("urgent_overdue");

  if (t.previousOpenTicketsForCustomer >= 3) flags.push("repeat_distress");

  if (t.status === "NEW" && hoursOld > 48) flags.push("stale_new");

  if (t.replyCount >= 5 && isActive) flags.push("high_reply_no_resolution");

  if (t.plan === "ENTERPRISE") flags.push("enterprise_plan");

  if (!t.lastReplyAt && isActive) flags.push("no_response");

  if (t.channel === "PHONE_CALLBACK") flags.push("phone_callback");

  // ── Novas flags ────────────────────────────────────────────────────────────

  // CASO 2: Urgência real mas prioridade sub-declarada.
  // Cliente marcou LOW ou MEDIUM, mas o texto descreve uma situação crítica
  // (sistema fora, sem acesso, perda de dados, etc.).
  // O cliente simplesmente não percebeu ou não se deu ao trabalho de marcar corretamente.
  if (
    isActive &&
    ["LOW", "MEDIUM"].includes(t.priority) &&
    isHiddenUrgent
  ) {
    flags.push("hidden_urgency");
  }

  // CASO 1: Prioridade inflada — cliente marcou URGENT mas sem evidência objetiva.
  // Dispara quando:
  //   - prioridade = URGENT
  //   - sem palavras de churn (que justificariam urgência)
  //   - sem palavras de urgência real no texto
  //   - não é ENT (que tem SLA contratual que justifica urgência)
  //   - plano não é Enterprise
  //   - não ligou (que seria sinal de esforço real)
  //   - ticket ainda novo (replyCount baixo — não é urgência estabelecida por histórico)
  // Aviso informativo: não significa que não é urgente, significa que não há
  // evidência objetiva confirmando. O agente deve revisar antes de agir.
  if (
    isActive &&
    t.priority === "URGENT" &&
    !isChurn &&
    !isHiddenUrgent &&
    t.customerSegment !== "ENT" &&
    t.plan !== "ENTERPRISE" &&
    t.channel !== "PHONE_CALLBACK" &&
    t.replyCount < 3
  ) {
    flags.push("unverified_urgent");
  }

  return flags;
}

export function computeRiskScore(t: TicketInput): number {
  let score = 0;
  const text = `${t.subject} ${t.bodyPreview}`;
  const hoursOld = hoursSince(t.createdAt);
  const isActive = !["RESOLVED", "CLOSED"].includes(t.status);
  const hasNoAgentReply = t.lastReplyAt === null || t.lastReplyBy === "CUSTOMER";

  // Segmento (exposição de receita)
  if (t.customerSegment === "ENT") score += 20;
  else if (t.customerSegment === "MID") score += 10;
  else score += 3;

  // Plano (proxy de valor do contrato)
  if (t.plan === "ENTERPRISE") score += 20;
  else if (t.plan === "GROWTH") score += 8;
  else if (t.plan === "STARTER") score += 3;

  // Churn signal é o fator de maior impacto
  if (containsChurnSignal(text)) score += 35;

  // Urgência real não declarada: sistema fora, perda de dados, etc.
  // Vale tanto quanto churn — impacto operacional imediato.
  if (containsHiddenUrgency(text)) score += 20;

  // Tempo sem resposta do agente
  if (isActive && hasNoAgentReply) {
    if (hoursOld > 48)     score += 20;
    else if (hoursOld > 24) score += 15;
    else if (hoursOld > 8)  score += 10;
    else if (hoursOld > 4)  score += 7;
    else if (hoursOld > 2)  score += 3;
  }

  // Prioridade auto-declarada — peso reduzido intencionalmente
  // porque clientes sobre e sub-reportam. O texto e o tempo são mais confiáveis.
  // Bônus só se NÃO for unverified_urgent (sem evidência objetiva)
  const flags = computeTriageFlags(t);
  const isUnverified = flags.includes("unverified_urgent");
  if (!isUnverified) {
    if (t.priority === "URGENT") score += 8;
    else if (t.priority === "HIGH") score += 5;
    else if (t.priority === "MEDIUM") score += 2;
  } else {
    // URGENT sem evidência: bônus mínimo (não penaliza, mas não infla)
    score += 2;
  }

  // Cliente repetido = conta em sofrimento
  if (t.previousOpenTicketsForCustomer >= 5) score += 15;
  else if (t.previousOpenTicketsForCustomer >= 3) score += 10;
  else if (t.previousOpenTicketsForCustomer >= 1) score += 3;

  // Muitas respostas sem resolução
  if (t.replyCount >= 8 && isActive) score += 12;
  else if (t.replyCount >= 5 && isActive) score += 8;

  // Telefone = alto esforço do cliente
  if (t.channel === "PHONE_CALLBACK") score += 5;

  return Math.min(100, Math.round(score));
}

// ── Máquina de estados ────────────────────────────────────────────────────────
export const STATE_TRANSITIONS: Record<string, string[]> = {
  NEW:              ["TRIAGED", "IN_PROGRESS", "ESCALATED", "CLOSED"],
  TRIAGED:          ["IN_PROGRESS", "ESCALATED", "CLOSED"],
  IN_PROGRESS:      ["WAITING_CUSTOMER", "RESOLVED", "ESCALATED"],
  ESCALATED:        ["IN_PROGRESS", "RESOLVED", "WAITING_CUSTOMER"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED:         ["CLOSED", "REOPENED"],
  CLOSED:           ["REOPENED"],
  REOPENED:         ["IN_PROGRESS", "TRIAGED"],
};

export function isValidTransition(from: string, to: string): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const TRIAGE_FLAG_LABELS: Record<TriageFlag, string> = {
  churn_signal:              "Risco de Churn",
  ent_sla_breach:            "SLA Enterprise",
  urgent_overdue:            "Urgente Atrasado",
  repeat_distress:           "Cliente Repetido",
  stale_new:                 "Parado",
  high_reply_no_resolution:  "Travado",
  enterprise_plan:           "Enterprise",
  no_response:               "Sem Resposta",
  phone_callback:            "Ligou",
  hidden_urgency:            "Urgência Oculta",
  unverified_urgent:         "Urgência Não Confirmada",
};
