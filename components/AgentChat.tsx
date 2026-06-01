"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Loader2, ChevronDown, ChevronUp,
  Zap, CheckCircle, ExternalLink, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface ToolResult {
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
}

const QUICK_PROMPTS = [
  "Quais os 10 tickets ENT sem resposta há mais de 4h?",
  "Resuma os sinais de churn ativos",
  "Qual agente está mais sobrecarregado?",
  "Liste tickets URGENT parados há mais de 24h",
  "Mostre estatísticas gerais da inbox",
];

export default function AgentChat({ onAction }: { onAction?: () => void }) {
  const [isOpen, setIsOpen]     = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sentDrafts, setSentDrafts]     = useState<Set<string>>(new Set());
  const [sendingDraft, setSendingDraft] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Send a drafted reply directly to the ticket (1-click)
  const handleSendDraft = useCallback(async (ticketId: string, draft: string) => {
    setSendingDraft(ticketId);
    try {
      await fetch(`/api/tickets/${ticketId}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor": "Agente de IA",
          "x-actor-type": "AI_AGENT",
        },
        body: JSON.stringify({ body: draft }),
      });
      setSentDrafts((prev) => new Set([...prev, ticketId]));
      onAction?.();
    } finally {
      setSendingDraft(null);
    }
  }, [onAction]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        const err = await res.text();
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(), role: "assistant",
          content: `Erro ao chamar o agente: ${err}`,
        }]);
        return;
      }

      const data = await res.json() as {
        message: string;
        toolResults: ToolResult[];
        usage?: unknown;
      };

      const hasAction = data.toolResults?.some(
        (tr) => !tr.result?.requiresConfirmation && !tr.result?.preview
      );
      if (hasAction) onAction?.();

      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message ?? "",
        toolResults: data.toolResults ?? [],
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "assistant",
        content: `Erro de rede: ${String(e)}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, onAction]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  const lastAssistant = !loading && messages.length > 0
    ? messages.findLast((m) => m.role === "assistant") : null;

  // Only show the generic confirm button for non-draftReply confirmations
  const hasPendingConfirmation = Boolean(
    lastAssistant?.toolResults?.some(
      (tr) => tr.result?.requiresConfirmation && tr.toolName !== "draftReply"
    )
  );

  const buildConfirmMessage = () => {
    const pending = lastAssistant?.toolResults?.filter(
      (tr) => tr.result?.requiresConfirmation && tr.toolName !== "draftReply"
    ) ?? [];
    if (!pending.length) return "sim, executar";

    const parts: string[] = ["sim, executar. Execute as ações planejadas com dryRun: false."];
    for (const tr of pending) {
      const r = tr.result as Record<string, unknown>;
      if (["bulkAssign", "bulkUpdateStatus", "bulkEscalate"].includes(tr.toolName)) {
        const ids = (r.ticketIds ?? r.willUpdate ?? r.willEscalate) as unknown[] | undefined;
        const idList = Array.isArray(ids)
          ? ids.map((x) => (typeof x === "string" ? x : (x as Record<string, string>).id)).join(", ")
          : "";
        if (idList) parts.push(`${tr.toolName}: tickets [${idList}]`);
      } else if (tr.toolName === "mergeTickets") {
        const p = r.primary as Record<string, string> | undefined;
        const s = r.secondary as Record<string, string> | undefined;
        parts.push(`mergeTickets: primary=${p?.ticketId ?? r.primaryId}, secondary=${s?.ticketId ?? r.secondaryId}`);
      } else if (tr.toolName === "updateTicketStatus") {
        parts.push(`updateTicketStatus: ticketId=${r.ticketId}, newStatus=${r.to}, dryRun: false`);
      }
    }
    return parts.join("\n");
  };

  return (
    <div className={cn("fixed bottom-4 right-4 z-50 flex flex-col", isOpen ? "w-[440px]" : "w-auto")}>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="self-end flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
      >
        <Bot size={16} />
        Agente de IA
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        {loading && <Loader2 size={14} className="animate-spin" />}
      </button>

      {isOpen && (
        <div className="mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col h-[560px]">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-indigo-50 rounded-t-xl">
            <Bot size={18} className="text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-indigo-900">Agente de Suporte</p>
              <p className="text-xs text-indigo-600">Claude Sonnet 4.5 · Tool Use ativo</p>
            </div>
          </div>

          {/* Quick prompts */}
          {messages.length === 0 && (
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Zap size={11} /> Ações rápidas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="text-xs px-2.5 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role !== "user" && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                    <Bot size={13} className="text-indigo-600" />
                  </div>
                )}

                <div className={cn(
                  "max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-50 text-gray-800 border border-gray-200"
                )}>
                  {m.role === "user" ? (
                    <p>{m.content}</p>
                  ) : (
                    <div className="agent-message" dangerouslySetInnerHTML={{ __html: formatAgentMessage(m.content) }} />
                  )}

                  {/* Tool results */}
                  {m.toolResults && m.toolResults.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {m.toolResults.map((tr, i) => {
                        // ── Draft Reply: card with 1-click send ──────────────
                        if (tr.toolName === "draftReply" && tr.result?.draft) {
                          const r = tr.result as {
                            ticketId: string; draft: string; customerName: string;
                            segment: string; plan: string; openTicketsForCustomer: number;
                            replyCount: number;
                          };
                          const isSent    = sentDrafts.has(r.ticketId);
                          const isSending = sendingDraft === r.ticketId;
                          return (
                            <div key={i} className="rounded-lg border border-indigo-200 overflow-hidden text-xs">
                              {/* Draft header */}
                              <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                                <div>
                                  <p className="font-semibold text-indigo-900">✉️ Rascunho — {r.ticketId}</p>
                                  <p className="text-indigo-600 mt-0.5">
                                    {r.customerName} · {r.segment}/{r.plan} · {r.openTicketsForCustomer} tickets abertos
                                  </p>
                                </div>
                                <a
                                  href={`/tickets/${r.ticketId}`}
                                  target="_blank"
                                  className="text-indigo-500 hover:text-indigo-700 ml-2 flex-shrink-0"
                                  title="Abrir ticket"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              </div>

                              {/* Draft text */}
                              <div className="px-3 py-2 bg-white max-h-44 overflow-y-auto">
                                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{r.draft}</p>
                              </div>

                              {/* Actions */}
                              <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex gap-2">
                                <button
                                  onClick={() => handleSendDraft(r.ticketId, r.draft)}
                                  disabled={isSending || isSent}
                                  className={cn(
                                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-semibold transition-colors",
                                    isSent
                                      ? "bg-green-50 text-green-700 border border-green-200 cursor-default"
                                      : "bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
                                  )}
                                >
                                  {isSending ? (
                                    <><Loader2 size={11} className="animate-spin" /> Enviando...</>
                                  ) : isSent ? (
                                    <><CheckCircle size={11} /> Enviado</>
                                  ) : (
                                    <><Send size={11} /> Enviar Resposta</>
                                  )}
                                </button>
                                <a
                                  href={`/tickets/${r.ticketId}`}
                                  target="_blank"
                                  className="px-3 py-1.5 rounded text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center gap-1"
                                >
                                  <ExternalLink size={11} /> Abrir ticket
                                </a>
                              </div>
                            </div>
                          );
                        }

                        // ── Bulk action preview: readable summary ─────────────
                        if (tr.result?.requiresConfirmation) {
                          return (
                            <BulkPreviewCard key={i} tr={tr} />
                          );
                        }

                        // ── Read-only tools: small pill ───────────────────────
                        const count =
                          tr.result?.count ??
                          (Array.isArray(tr.result?.tickets) ? (tr.result.tickets as unknown[]).length : null);
                        return (
                          <span key={i} className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 border border-gray-200 rounded px-2 py-0.5">
                            🔧 {tr.toolName}
                            {count != null ? ` · ${count} resultados` : ""}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {m.role === "user" && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center mt-0.5">
                    <User size={13} className="text-white" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Bot size={13} className="text-indigo-600" />
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Confirm button — only for non-draftReply pending actions */}
          {hasPendingConfirmation && (
            <div className="px-4 pb-2">
              <button
                onClick={() => sendMessage(buildConfirmMessage())}
                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                ✓ Confirmar e Executar
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-gray-100">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte ou dê uma instrução ao agente..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Readable preview card for bulk actions ───────────────────────────────────
function BulkPreviewCard({ tr }: { tr: ToolResult }) {
  const r = tr.result as Record<string, unknown>;
  const summary = r.summary as string | undefined;

  // Collect affected tickets into a readable list
  type TicketItem = { id: string; customerName?: string; status?: string };
  let items: TicketItem[] = [];

  if (tr.toolName === "bulkEscalate") {
    const list = r.willEscalate as { id: string; customerName: string; status: string }[] | undefined;
    items = list ?? [];
  } else if (tr.toolName === "bulkAssign") {
    const ids = r.ticketIds as string[] | undefined;
    items = (ids ?? []).map((id) => ({ id }));
  } else if (tr.toolName === "bulkUpdateStatus") {
    const ids = r.willUpdate as string[] | undefined;
    items = (ids ?? []).map((id) => ({ id }));
  } else if (tr.toolName === "mergeTickets") {
    const p = r.primary as Record<string, string> | undefined;
    const s = r.secondary as Record<string, string> | undefined;
    items = [
      { id: (p?.ticketId ?? "") as string, customerName: `${p?.subject ?? ""}` },
      { id: (s?.ticketId ?? "") as string, customerName: `${s?.subject ?? ""} → será fechado` },
    ];
  } else if (tr.toolName === "updateTicketStatus") {
    items = [{ id: r.ticketId as string, customerName: r.customerName as string, status: `${r.from} → ${r.to}` }];
  }

  const skipped = r.willSkip as { id: string; reason: string }[] | undefined;

  return (
    <div className="rounded-lg border border-amber-200 overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5">
        <AlertTriangle size={12} className="text-amber-600 flex-shrink-0" />
        <p className="font-semibold text-amber-900">Preview — {tr.toolName}</p>
      </div>

      {/* Summary */}
      {summary && (
        <div className="px-3 py-1.5 bg-white border-b border-amber-100">
          <p className="text-gray-700 font-medium">{summary}</p>
        </div>
      )}

      {/* Ticket list */}
      {items.length > 0 && (
        <div className="bg-white max-h-36 overflow-y-auto divide-y divide-gray-50">
          {items.slice(0, 15).map((item) => (
            <div key={item.id} className="px-3 py-1.5 flex items-center gap-2">
              <span className="font-mono text-gray-500 flex-shrink-0">{item.id}</span>
              {item.customerName && <span className="text-gray-700 truncate">{item.customerName}</span>}
              {item.status && <span className="ml-auto text-gray-400 flex-shrink-0">{item.status}</span>}
            </div>
          ))}
          {items.length > 15 && (
            <div className="px-3 py-1 text-gray-400 italic">+{items.length - 15} mais...</div>
          )}
        </div>
      )}

      {/* Skipped */}
      {skipped && skipped.length > 0 && (
        <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-gray-400">
          {skipped.length} ignorado(s) — transição inválida
        </div>
      )}

      {/* Note */}
      <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-amber-700">
        Clique em <strong>Confirmar e Executar</strong> para prosseguir
      </div>
    </div>
  );
}

function formatAgentMessage(content: string): string {
  if (!content) return "";
  return content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.*)/gm, '<h3 class="font-semibold text-sm mt-2 mb-1">$1</h3>')
    .replace(/^## (.*)/gm, '<h2 class="font-semibold text-base mt-2 mb-1">$1</h2>')
    .replace(/^- (.*)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n/g, "<br/>");
}
