import type { TriageFlag } from "./types";

/* ──────────────────────────────────────────────────────────────────────────────
   SINAIS DE CHURN
   Palavras e expressões que indicam que o cliente está considerando cancelar
   ou migrar para um concorrente. Usadas tanto para a flag churn_signal quanto
   para aumentar o peso no risk score — churn é a maior ameaça de receita.
────────────────────────────────────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────────────────────────────────────
   URGÊNCIA OCULTA
   Sinais de criticidade real que independem da prioridade auto-declarada pelo
   cliente. Captura o caso clássico: "cliente marcou MEDIUM mas o sistema está
   fora do ar". Clientes frequentemente sub-reportam urgência por preguiça ou
   por não saberem a gravidade real do problema.
────────────────────────────────────────────────────────────────────────────── */
const HIDDEN_URGENCY_KEYWORDS = [
  /* Sistema indisponível */
  "sistema parado", "sistema fora", "fora do ar", "site fora", "app fora",
  "aplicativo fora", "plataforma fora", "parou de funcionar", "sistema caiu",
  "servidor fora", "serviço fora", "indisponível",
  /* Sem acesso */
  "não consigo acessar", "nao consigo acessar", "sem acesso", "perdemos acesso",
  "bloqueado completamente", "impossível trabalhar", "nao consigo entrar",
  "não consigo entrar", "travado", "não abre", "nao abre",
  /* Impacto operacional em equipe ou produção */
  "produção parada", "operação parada", "afetando todos", "todos os usuários",
  "toda a equipe", "equipe inteira", "nenhum usuário consegue",
  "impede o trabalho", "impossível operar",
  /* Perda de dados ou segurança */
  "perda de dados", "dados perdidos", "dados sumidos", "dados apagados",
  "vazamento", "brecha", "invasão", "acesso indevido",
  /* Cobrança incorreta */
  "cobrança indevida", "cobrado errado", "cobrado em dobro",
  "pagamento duplicado", "débito incorreto",
  /* Inglês */
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

/* ──────────────────────────────────────────────────────────────────────────────
   FLAGS DE TRIAGEM
   Cada flag representa um sinal de atenção específico e independente.
   Um ticket pode ter múltiplas flags simultaneamente — elas não são
   mutuamente exclusivas. O conjunto de flags explica *por que* o risk score
   é alto, servindo de justificativa legível para o agente de suporte.
────────────────────────────────────────────────────────────────────────────── */
export function computeTriageFlags(t: TicketInput): TriageFlag[] {
  const flags: TriageFlag[] = [];
  const text = `${t.subject} ${t.bodyPreview}`;
  const hoursOld = hoursSince(t.createdAt);
  const isActive = !["RESOLVED", "CLOSED"].includes(t.status);
  const hasNoAgentReply = t.lastReplyAt === null || t.lastReplyBy === "CUSTOMER";
  const isChurn = containsChurnSignal(text);
  const isHiddenUrgent = containsHiddenUrgency(text);

  if (isChurn) flags.push("churn_signal");

  /* SLA Enterprise: clientes ENT têm contrato de resposta em até 4h */
  if (t.customerSegment === "ENT" && isActive && hasNoAgentReply && hoursOld > 4)
    flags.push("ent_sla_breach");

  /* Ticket declarado URGENT pelo cliente e sem resposta há mais de 4h */
  if (t.priority === "URGENT" && isActive && hasNoAgentReply && hoursOld > 4)
    flags.push("urgent_overdue");

  /* Cliente com 3+ tickets abertos simultaneamente — conta em sofrimento */
  if (t.previousOpenTicketsForCustomer >= 3) flags.push("repeat_distress");

  /* Ticket parado em NEW há mais de 48h — caiu entre as rachaduras */
  if (t.status === "NEW" && hoursOld > 48) flags.push("stale_new");

  /* Muitas trocas de mensagem sem resolução — conversa travada */
  if (t.replyCount >= 5 && isActive) flags.push("high_reply_no_resolution");

  if (t.plan === "ENTERPRISE") flags.push("enterprise_plan");

  /* Nenhuma resposta enviada ainda */
  if (!t.lastReplyAt && isActive) flags.push("no_response");

  if (t.channel === "PHONE_CALLBACK") flags.push("phone_callback");

  /* Urgência real mascarada: cliente marcou LOW/MEDIUM mas o texto revela
     uma situação crítica (sistema fora, perda de dados, etc.) */
  if (isActive && ["LOW", "MEDIUM"].includes(t.priority) && isHiddenUrgent) {
    flags.push("hidden_urgency");
  }

  /* Prioridade inflada: URGENT declarado sem nenhuma evidência objetiva.
     Não significa que não é urgente — significa que o agente deve revisar
     antes de escalar, evitando desperdício de energia em falsos alarmes. */
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

/* ──────────────────────────────────────────────────────────────────────────────
   RISK SCORE (0–100)
   Score numérico que combina múltiplos fatores para ordenar tickets por
   impacto real no negócio. A lógica de pesos é intencional:

   - Segmento e plano têm peso alto: refletem exposição de receita
   - Churn signal tem o maior peso individual: cliente prestes a sair
     é o maior risco financeiro imediato
   - Tempo sem resposta cresce progressivamente: urgência aumenta com o tempo
   - Prioridade auto-declarada tem peso reduzido: clientes sobre e sub-reportam.
     O texto e o contexto são sinais mais confiáveis que o campo de prioridade.
────────────────────────────────────────────────────────────────────────────── */
export function computeRiskScore(t: TicketInput): number {
  let score = 0;
  const text = `${t.subject} ${t.bodyPreview}`;
  const hoursOld = hoursSince(t.createdAt);
  const isActive = !["RESOLVED", "CLOSED"].includes(t.status);
  const hasNoAgentReply = t.lastReplyAt === null || t.lastReplyBy === "CUSTOMER";

  /* Exposição de receita por segmento */
  if (t.customerSegment === "ENT") score += 20;
  else if (t.customerSegment === "MID") score += 10;
  else score += 3;

  /* Valor do contrato por plano */
  if (t.plan === "ENTERPRISE") score += 20;
  else if (t.plan === "GROWTH") score += 8;
  else if (t.plan === "STARTER") score += 3;

  /* Churn é o fator de maior impacto — cliente a ponto de sair */
  if (containsChurnSignal(text)) score += 35;

  /* Urgência real não declarada: sistema fora, perda de dados, etc. */
  if (containsHiddenUrgency(text)) score += 20;

  /* Tempo sem resposta do agente — penalidade progressiva */
  if (isActive && hasNoAgentReply) {
    if (hoursOld > 48)      score += 20;
    else if (hoursOld > 24) score += 15;
    else if (hoursOld > 8)  score += 10;
    else if (hoursOld > 4)  score += 7;
    else if (hoursOld > 2)  score += 3;
  }

  /* Prioridade auto-declarada com peso reduzido. Bônus só concedido se a
     urgência tiver evidência objetiva — evita que clientes inflem o score. */
  const flags = computeTriageFlags(t);
  const isUnverified = flags.includes("unverified_urgent");
  if (!isUnverified) {
    if (t.priority === "URGENT") score += 8;
    else if (t.priority === "HIGH") score += 5;
    else if (t.priority === "MEDIUM") score += 2;
  } else {
    score += 2; /* Bônus mínimo: não penaliza, mas não infla */
  }

  /* Conta em sofrimento: cliente com muitos tickets abertos */
  if (t.previousOpenTicketsForCustomer >= 5) score += 15;
  else if (t.previousOpenTicketsForCustomer >= 3) score += 10;
  else if (t.previousOpenTicketsForCustomer >= 1) score += 3;

  /* Conversa longa sem resolução: problema complexo ou travado */
  if (t.replyCount >= 8 && isActive) score += 12;
  else if (t.replyCount >= 5 && isActive) score += 8;

  /* Telefone = alto esforço do cliente, sinal de frustração real */
  if (t.channel === "PHONE_CALLBACK") score += 5;

  return Math.min(100, Math.round(score));
}

/* ──────────────────────────────────────────────────────────────────────────────
   MÁQUINA DE ESTADOS
   Define quais transições de status são válidas. Impede que o agente ou a UI
   movam um ticket para um estado incoerente (ex: NEW → RESOLVED sem triagem).
   REOPENED existe para quando o cliente reporta que o problema voltou após
   ter sido marcado como resolvido.
────────────────────────────────────────────────────────────────────────────── */
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
