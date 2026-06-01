"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, Zap, AlertTriangle, User, Tag, ExternalLink, Loader2, CheckCircle } from "lucide-react";
import { SegmentBadge, PriorityBadge, TriageFlagBadge } from "@/components/Badges";
import type { Ticket, TriageFlag } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props {
  onClose: () => void;
  onAction: () => void;
  agents: string[];
}

/* Opções de categoria e prioridade disponíveis no painel de classificação */
const CATEGORIES: [string, string][] = [
  ["BUG",             "🐛 Bug"],
  ["BILLING",         "💳 Financeiro"],
  ["FEATURE_REQUEST", "✨ Funcionalidade"],
  ["HOW_TO",          "❓ Como fazer"],
  ["CHURN_SIGNAL",    "⚠️ Risco de churn"],
  ["OTHER",           "📋 Outro"],
];
const PRIORITIES: [string, string][] = [
  ["URGENT", "🔴 Urgente"],
  ["HIGH",   "🟠 Alta"],
  ["MEDIUM", "🟡 Média"],
  ["LOW",    "🟢 Baixa"],
];

/* Painel ativo no momento: classificar, atribuir ou nenhum */
type Panel = "classify" | "assign" | null;

export default function TriageMode({ onClose, onAction, agents }: Props) {
  const [tickets, setTickets]         = useState<Ticket[]>([]);
  const [index, setIndex]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [acting, setActing]           = useState(false);
  const [triaged, setTriaged]         = useState(0);
  const [panel, setPanel]             = useState<Panel>(null);
  const [category, setCategory]       = useState("");
  const [priority, setPriority]       = useState("");
  const [agent, setAgent]             = useState("");
  const [lastAction, setLastAction]   = useState<string | null>(null);

  /* Carrega os 50 tickets NEW com maior risk score para triagem */
  useEffect(() => {
    fetch("/api/tickets?status=NEW&limit=50&sortBy=riskScore&sortDir=desc")
      .then((r) => r.json())
      .then((d) => { setTickets(d.tickets ?? []); setLoading(false); });
  }, []);

  const ticket = tickets[index];
  const total  = tickets.length;

  /* Exibe uma mensagem de confirmação por 2,5 segundos após cada ação */
  const showLastAction = (msg: string) => {
    setLastAction(msg);
    setTimeout(() => setLastAction(null), 2500);
  };

  /* Avança para o próximo ticket, resetando o estado local do painel */
  const advance = useCallback(() => {
    setPanel(null);
    setCategory("");
    setPriority("");
    setAgent("");
    setTriaged((t) => t + 1);
    if (index + 1 >= total) { onClose(); onAction(); return; }
    setIndex((i) => i + 1);
  }, [index, total, onClose, onAction]);

  /* Pula o ticket sem realizar nenhuma ação */
  const skip = () => {
    setPanel(null);
    if (index + 1 >= total) { onClose(); return; }
    setIndex((i) => i + 1);
  };

  /* Envia um PATCH para o ticket e avança para o próximo */
  const patch = async (data: Record<string, unknown>, label: string) => {
    if (!ticket) return;
    setActing(true);
    await fetch(`/api/tickets/${ticket.ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor": "Líder de Suporte" },
      body: JSON.stringify(data),
    });
    setActing(false);
    onAction();
    showLastAction(label);
    advance();
  };

  /* Classifica o ticket com categoria e prioridade selecionadas */
  const handleClassify = () => {
    if (!category) return;
    patch(
      { category, ...(priority ? { priority } : {}) },
      `✓ Classificado como ${category}${priority ? ` · ${priority}` : ""}`
    );
  };

  /* Atribui o ticket ao agente selecionado e muda status para TRIAGED */
  const handleAssign = () => {
    if (!agent) return;
    patch(
      { assignedTo: agent, status: "TRIAGED" },
      `✓ Atribuído a ${agent}`
    );
  };

  const handleEscalate = () => {
    patch({ status: "ESCALATED" }, "✓ Escalado");
  };

  if (loading) return (
    <Overlay>
      <div className="bg-white rounded-2xl p-10 text-center shadow-2xl">
        <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={28} />
        <p className="text-gray-600">Carregando tickets para triagem...</p>
      </div>
    </Overlay>
  );

  if (total === 0 || !ticket) return (
    <Overlay>
      <div className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-sm w-full">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Inbox em dia!</h3>
        <p className="text-gray-500 mb-6">Nenhum ticket NEW encontrado para triar.</p>
        <button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-semibold">
          Fechar
        </button>
      </div>
    </Overlay>
  );

  /* Progresso em percentual para a barra visual */
  const progress = Math.round((index / total) * 100);

  return (
    <Overlay>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Cabeçalho com contador de progresso */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Zap size={18} className="text-indigo-600" />
            <span className="font-bold text-gray-900">Modo Triagem</span>
            <span className="text-sm text-gray-400">
              {index + 1}/{total} · {triaged} triados
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Barra de progresso */}
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Toast com confirmação da última ação */}
        {lastAction && (
          <div className="mx-6 mt-3 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-3 py-2 rounded-lg">
            <CheckCircle size={14} />
            {lastAction}
          </div>
        )}

        {/* Conteúdo do ticket atual */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Risk score e flags de triagem */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "text-xs font-bold px-2.5 py-1 rounded-full",
              ticket.riskScore >= 80 ? "bg-red-100 text-red-700" :
              ticket.riskScore >= 60 ? "bg-orange-100 text-orange-700" :
                                       "bg-gray-100 text-gray-600"
            )}>
              Risco {ticket.riskScore}
            </span>
            {ticket.triageFlags.map((f) => (
              <TriageFlagBadge key={f} flag={f as TriageFlag} />
            ))}
          </div>

          {/* Título, segmento, prioridade e dados do cliente */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-gray-400 mb-1">{ticket.ticketId}</p>
              <h2 className="text-lg font-bold text-gray-900 leading-snug">{ticket.subject}</h2>
            </div>
            <div className="flex-shrink-0 text-right space-y-1">
              <div className="flex gap-1.5 justify-end">
                <SegmentBadge segment={ticket.customerSegment} />
                <PriorityBadge priority={ticket.priority} />
              </div>
              <p className="text-sm font-medium text-gray-700">{ticket.customerName}</p>
              <p className="text-xs text-gray-400">{ticket.plan} · {ticket.channel}</p>
            </div>
          </div>

          {/* Corpo da mensagem do cliente */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <p className="text-sm text-gray-700 leading-relaxed">{ticket.bodyPreview}</p>
          </div>

          {/* Painel de classificação — aparece ao clicar em "Classificar" */}
          {panel === "classify" && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">Classificar</p>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setCategory(val)}
                    className={cn(
                      "text-xs px-2 py-2 rounded-lg border font-medium transition-all text-left",
                      category === val
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Prioridade (opcional)</p>
                <div className="flex gap-2">
                  {PRIORITIES.map(([val, label]) => (
                    <button
                      key={val}
                      /* Toggle: clica de novo para desmarcar */
                      onClick={() => setPriority(priority === val ? "" : val)}
                      className={cn(
                        "text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all",
                        priority === val
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleClassify}
                disabled={!category || acting}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {acting ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Confirmar e próximo →"}
              </button>
            </div>
          )}

          {/* Painel de atribuição — aparece ao clicar em "Atribuir" */}
          {panel === "assign" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Atribuir a um agente</p>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                {agents.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAgent(a)}
                    className={cn(
                      "text-xs px-3 py-2 rounded-lg border font-medium transition-all text-left truncate",
                      agent === a
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white border-gray-200 text-gray-700 hover:border-emerald-300"
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <button
                onClick={handleAssign}
                disabled={!agent || acting}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {acting ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Atribuir e próximo →"}
              </button>
            </div>
          )}
        </div>

        {/* Barra de ações: classificar, atribuir, escalar ou pular */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <div className="grid grid-cols-4 gap-2 mb-3">
            <ActionButton
              icon={<Tag size={15} />}
              label="Classificar"
              active={panel === "classify"}
              color="indigo"
              onClick={() => setPanel(panel === "classify" ? null : "classify")}
            />
            <ActionButton
              icon={<User size={15} />}
              label="Atribuir"
              active={panel === "assign"}
              color="emerald"
              onClick={() => setPanel(panel === "assign" ? null : "assign")}
            />
            <ActionButton
              icon={<AlertTriangle size={15} />}
              label="Escalar"
              active={false}
              color="red"
              onClick={handleEscalate}
              disabled={acting}
            />
            <ActionButton
              icon={<ChevronRight size={15} />}
              label="Pular"
              active={false}
              color="gray"
              onClick={skip}
            />
          </div>
          <a
            href={`/tickets/${ticket.ticketId}`}
            target="_blank"
            className="flex items-center justify-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <ExternalLink size={11} /> Abrir ticket completo
          </a>
        </div>
      </div>
    </Overlay>
  );
}

/* Overlay escuro que cobre a tela durante o modo triagem */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      {children}
    </div>
  );
}

/* Botão de ação reutilizável com suporte a estado ativo e variantes de cor */
function ActionButton({
  icon, label, active, color, onClick, disabled,
}: {
  icon: React.ReactNode; label: string; active: boolean;
  color: "indigo" | "emerald" | "red" | "gray";
  onClick: () => void; disabled?: boolean;
}) {
  const activeClasses = {
    indigo:  "bg-indigo-600 text-white border-indigo-600",
    emerald: "bg-emerald-600 text-white border-emerald-600",
    red:     "bg-red-600 text-white border-red-600",
    gray:    "bg-gray-200 text-gray-600 border-gray-200",
  };
  const hoverClasses = {
    indigo:  "hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700",
    emerald: "hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700",
    red:     "hover:bg-red-50 hover:border-red-300 hover:text-red-700",
    gray:    "hover:bg-gray-100 hover:text-gray-600",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40",
        active
          ? activeClasses[color]
          : cn("bg-white border-gray-200 text-gray-600", hoverClasses[color])
      )}
    >
      {icon}
      {label}
    </button>
  );
}
