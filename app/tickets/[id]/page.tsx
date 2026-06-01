"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  MessageSquare,
  Clock,
  User,
  Bot,
  Merge,
  AlertTriangle,
  CheckCircle,
  Send,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  StatusBadge,
  PriorityBadge,
  SegmentBadge,
  ChannelBadge,
  TriageFlagBadge,
  RiskScore,
} from "@/components/Badges";
import AgentChat from "@/components/AgentChat";
import type { Ticket, Reply, AuditEvent, TriageFlag } from "@/lib/types";
import { STATE_TRANSITIONS } from "@/lib/triage";
import { cn } from "@/lib/cn";

const CATEGORIES = [
  "BILLING",
  "BUG",
  "FEATURE_REQUEST",
  "HOW_TO",
  "CHURN_SIGNAL",
  "OTHER",
];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const CLOSE_REASONS = [
  "RESOLVED_FIXED",
  "RESOLVED_INFO",
  "DUPLICATE",
  "NOT_REPRODUCIBLE",
  "WONT_FIX",
  "CUSTOMER_NO_RESPONSE",
];

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mergeId, setMergeId] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);

  const fetchData = async () => {
    setLoading(true);
    const [ticketRes, agentsRes] = await Promise.all([
      fetch(`/api/tickets/${id}`),
      fetch("/api/agents"),
    ]);
    const ticketData = await ticketRes.json();
    const agentsData = await agentsRes.json();
    setTicket(ticketData.ticket);
    setReplies(ticketData.replies ?? []);
    setAudit(ticketData.audit ?? []);
    setAgents((agentsData.agents ?? []).map((a: { name: string }) => a.name));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const patch = async (updates: Record<string, unknown>) => {
    setSaving(true);
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor": "Líder de Suporte" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.ticket) setTicket(data.ticket);
    await fetchData();
    setSaving(false);
  };

  const sendReply = async () => {
    if (!replyBody.trim()) return;
    setSendingReply(true);
    await fetch(`/api/tickets/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor": "Líder de Suporte" },
      body: JSON.stringify({ body: replyBody }),
    });
    setReplyBody("");
    await fetchData();
    setSendingReply(false);
  };

  const mergeTicket = async () => {
    if (!mergeId.trim()) return;
    await fetch(`/api/tickets/${id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor": "Líder de Suporte" },
      body: JSON.stringify({ secondaryId: mergeId }),
    });
    setShowMerge(false);
    setMergeId("");
    await fetchData();
  };

  const closeTicket = async () => {
    if (!closeReason) return;
    await patch({ status: "CLOSED", closeReason });
    setShowCloseModal(false);
  };

  if (loading || !ticket) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-indigo-500" size={28} />
      </div>
    );
  }

  const validTransitions = STATE_TRANSITIONS[ticket.status] ?? [];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{ticket.ticketId}</span>
            {ticket.riskScore >= 80 && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                <AlertTriangle size={12} /> Crítico
              </span>
            )}
          </div>
          <h1 className="text-base font-semibold text-gray-900 truncate">{ticket.subject}</h1>
        </div>
        <RiskScore score={ticket.riskScore} />
        {saving && <Loader2 size={16} className="animate-spin text-indigo-400" />}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ticket flags & meta */}
          {ticket.triageFlags.length > 0 && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex gap-1.5 flex-wrap">
              {ticket.triageFlags.map((f) => (
                <TriageFlagBadge key={f} flag={f as TriageFlag} />
              ))}
            </div>
          )}

          {/* Body preview */}
          <div className="px-4 py-4 bg-white border-b border-gray-100">
            <p className="text-sm text-gray-700 leading-relaxed">{ticket.bodyPreview}</p>
          </div>

          {/* Replies */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Histórico ({replies.length})
            </h3>
            {replies.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "rounded-lg p-3 text-sm",
                  r.authorType === "CUSTOMER"
                    ? "bg-blue-50 border border-blue-100 ml-4"
                    : r.authorType === "AI_AGENT"
                    ? "bg-purple-50 border border-purple-100 mr-4"
                    : "bg-gray-50 border border-gray-100 mr-4"
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {r.authorType === "AI_AGENT" ? (
                    <Bot size={13} className="text-purple-500" />
                  ) : r.authorType === "CUSTOMER" ? (
                    <User size={13} className="text-blue-500" />
                  ) : (
                    <User size={13} className="text-gray-500" />
                  )}
                  <span className="font-medium text-gray-700">{r.author}</span>
                  {r.authorType === "AI_AGENT" && (
                    <span className="text-xs text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">IA</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {format(new Date(r.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{r.body}</p>
              </div>
            ))}

            {replies.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma resposta ainda</p>
            )}
          </div>

          {/* Reply input */}
          <div className="border-t border-gray-200 bg-white p-3">
            <div className="flex gap-2">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Escreva uma resposta..."
                rows={2}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={sendReply}
                disabled={sendingReply || !replyBody.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {sendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-72 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-5">
            {/* Customer info */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Cliente
              </h3>
              <div className="space-y-1.5 text-sm">
                <p className="font-semibold text-gray-900">{ticket.customerName}</p>
                <div className="flex gap-1.5 flex-wrap">
                  <SegmentBadge segment={ticket.customerSegment} />
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{ticket.plan}</span>
                  <ChannelBadge channel={ticket.channel} />
                </div>
                {ticket.previousOpenTicketsForCustomer > 0 && (
                  <p className="text-xs text-amber-600 font-medium">
                    ⚠ {ticket.previousOpenTicketsForCustomer} outros tickets abertos
                  </p>
                )}
              </div>
            </section>

            {/* Status actions */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Status
              </h3>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {validTransitions
                  .filter((s) => s !== "CLOSED")
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => patch({ status: s })}
                      className="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                    >
                      → {s}
                    </button>
                  ))}
                {validTransitions.includes("CLOSED") && (
                  <button
                    onClick={() => setShowCloseModal(true)}
                    className="text-xs px-2.5 py-1 rounded border border-red-200 hover:bg-red-50 text-red-600 transition-colors flex items-center gap-1"
                  >
                    <CheckCircle size={11} />
                    Fechar
                  </button>
                )}
              </div>
            </section>

            {/* Classify */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Classificação
              </h3>
              <div className="space-y-2">
                <select
                  value={ticket.category ?? ""}
                  onChange={(e) => patch({ category: e.target.value || null })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">Sem categoria</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={ticket.priority}
                  onChange={(e) => patch({ priority: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* Assign */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Agente
              </h3>
              <select
                value={ticket.assignedTo ?? ""}
                onChange={(e) => patch({ assignedTo: e.target.value || null })}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Não atribuído</option>
                {agents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </section>

            {/* Merge */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Mesclar
              </h3>
              <button
                onClick={() => setShowMerge((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Merge size={13} />
                Mesclar com duplicata
                <ChevronDown size={12} className={cn("transition-transform", showMerge && "rotate-180")} />
              </button>
              {showMerge && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={mergeId}
                    onChange={(e) => setMergeId(e.target.value)}
                    placeholder="TKT-XXXXXX"
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={mergeTicket}
                    disabled={!mergeId.trim()}
                    className="text-xs px-2 py-1 bg-indigo-600 text-white rounded disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              )}
            </section>

            {/* Ticket meta */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Meta
              </h3>
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Clock size={11} />
                  Criado:{" "}
                  {formatDistanceToNow(new Date(ticket.createdAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </div>
                <div className="flex items-center gap-1">
                  <MessageSquare size={11} />
                  {ticket.replyCount} respostas
                </div>
                {ticket.lastReplyAt && (
                  <div className="flex items-center gap-1">
                    <Clock size={11} />
                    Última:{" "}
                    {formatDistanceToNow(new Date(ticket.lastReplyAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}{" "}
                    por {ticket.lastReplyBy}
                  </div>
                )}
                {ticket.closeReason && (
                  <div className="text-gray-500">
                    Fechado: {ticket.closeReason}
                  </div>
                )}
              </div>
            </section>

            {/* Audit log */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Audit Log
              </h3>
              <div className="space-y-2">
                {audit.slice(0, 15).map((e) => (
                  <AuditEntry key={e.id} event={e} />
                ))}
                {audit.length === 0 && (
                  <p className="text-gray-400 text-xs">Sem histórico ainda</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Close modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-80">
            <h3 className="font-semibold text-gray-900 mb-3">Fechar ticket</h3>
            <p className="text-sm text-gray-500 mb-4">Selecione o motivo do fechamento:</p>
            <div className="space-y-2 mb-4">
              {CLOSE_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="closeReason"
                    value={r}
                    checked={closeReason === r}
                    onChange={() => setCloseReason(r)}
                    className="text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{r}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={closeTicket}
                disabled={!closeReason}
                className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Agent */}
      <AgentChat onAction={fetchData} />
    </div>
  );
}

// ── Audit log entry with human-readable formatting ───────────────────────────

const ACTION_LABELS: Record<string, string> = {
  status_change:        "Status alterado",
  "status,closeReason": "Ticket fechado",
  status:               "Status alterado",
  assign:               "Atribuído",
  escalate:             "Escalado",
  classify:             "Classificado",
  "category,priority":  "Classificado",
  category:             "Categoria alterada",
  priority:             "Prioridade alterada",
  merge:                "Mesclado",
  merged_into:          "Mesclado em outro",
  reply:                "Resposta enviada",
  seed:                 "Dataset carregado",
};

const STATUS_PT: Record<string, string> = {
  NEW: "Novo", TRIAGED: "Triado", IN_PROGRESS: "Em andamento",
  WAITING_CUSTOMER: "Aguard. cliente", ESCALATED: "Escalado",
  RESOLVED: "Resolvido", CLOSED: "Fechado", REOPENED: "Reaberto",
};

function parseSafe(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function AuditEntry({ event: e }: { event: AuditEvent }) {
  const after  = parseSafe(e.after);
  const before = parseSafe(e.before);
  const isAI   = e.actorType === "AI_AGENT";

  // Monta uma linha legível mostrando o que mudou (antes → depois)
  let diff: string | null = null;
  if (after) {
    const toStatus   = (after.status ?? after.to)   as string | undefined;
    const fromStatus = (before?.status ?? before?.from) as string | undefined;
    if (toStatus || fromStatus) {
      const f = fromStatus ? (STATUS_PT[fromStatus] ?? fromStatus) : null;
      const t = toStatus   ? (STATUS_PT[toStatus]   ?? toStatus)   : null;
      diff = f && t ? `${f} → ${t}` : (t ?? f ?? null);
    } else if (after.assignedTo !== undefined) {
      const from = (before?.assignedTo as string) ?? "sem agente";
      const to   = (after.assignedTo  as string)  || "sem agente";
      diff = `${from} → ${to}`;
    } else if (after.category || after.priority) {
      const parts: string[] = [];
      if (after.category) parts.push(`Categoria: ${after.category as string}`);
      if (after.priority) parts.push(`Prioridade: ${after.priority as string}`);
      diff = parts.join(" · ");
    } else if (after.closeReason) {
      diff = `Motivo: ${after.closeReason as string}`;
    } else if (after.mergedFrom) {
      diff = `Recebeu: ${after.mergedFrom as string}`;
    } else if (after.mergedInto) {
      diff = `Para: ${after.mergedInto as string}`;
    } else if (after.preview) {
      diff = `"${String(after.preview).slice(0, 60)}${String(after.preview).length > 60 ? "…" : ""}"`;
    }
  }

  const label = ACTION_LABELS[e.action] ?? e.action;

  return (
    <div className={cn(
      "text-xs rounded-md px-2 py-1.5 border-l-2",
      isAI
        ? "border-purple-300 bg-purple-50"
        : "border-gray-200 bg-gray-50"
    )}>
      {/* Actor row */}
      <div className="flex items-center gap-1 mb-0.5">
        {isAI
          ? <Bot size={10} className="text-purple-500 flex-shrink-0" />
          : <User size={10} className="text-gray-400 flex-shrink-0" />}
        <span className={cn("font-semibold truncate", isAI ? "text-purple-700" : "text-gray-700")}>
          {e.actor}
        </span>
        {isAI && (
          <span className="ml-auto flex-shrink-0 text-purple-500 bg-purple-100 px-1 rounded text-[10px] font-medium">IA</span>
        )}
      </div>

      {/* Action */}
      <p className="text-gray-700 font-medium">{label}</p>

      {/* Diff — the most useful line */}
      {diff && (
        <p className="text-gray-500 mt-0.5">{diff}</p>
      )}

      {/* Reason (only if not already shown as diff) */}
      {e.reason && !diff?.includes(e.reason) && (
        <p className="text-gray-400 mt-0.5 italic truncate" title={e.reason}>
          {e.reason.slice(0, 60)}{e.reason.length > 60 ? "…" : ""}
        </p>
      )}

      {/* Timestamp */}
      <p className="text-gray-400 mt-0.5">
        {format(new Date(e.createdAt), "dd/MM HH:mm", { locale: ptBR })}
      </p>
    </div>
  );
}
