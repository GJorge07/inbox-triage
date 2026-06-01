"use client";

import { useState } from "react";
import { Search, X, Filter } from "lucide-react";
import { cn } from "@/lib/cn";

/* Representa o estado completo dos filtros da inbox.
   minRiskScore e excludeResolved são filtros programáticos (usados por atalhos
   como os botões "críticos" e "churn") e não aparecem no contador de filtros ativos. */
export interface Filters {
  status: string;
  segment: string;
  priority: string;
  category: string;
  channel: string;
  assignedTo: string;
  flagged: boolean;        /* true = exibe apenas tickets com alguma flag */
  flag: string;            /* filtra por uma flag específica, ex: "churn_signal" */
  search: string;
  sortBy: string;
  sortDir: string;
  minRiskScore?: number;   /* filtra por risk score mínimo — usado pelos atalhos do nav */
  excludeResolved?: boolean; /* exclui RESOLVED e CLOSED da listagem */
}

const DEFAULT_FILTERS: Filters = {
  status: "",
  segment: "",
  priority: "",
  category: "",
  channel: "",
  assignedTo: "",
  flagged: false,
  flag: "",
  search: "",
  sortBy: "riskScore",
  sortDir: "desc",
};

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  agents: string[];
}

export default function TicketFilters({ filters, onChange, agents }: Props) {
  const [showMore, setShowMore] = useState(false);

  const update = (key: keyof Filters, value: string | boolean) => {
    onChange({ ...filters, [key]: value });
  };

  const reset = () => onChange(DEFAULT_FILTERS);

  /* Conta quantos filtros estão ativos para exibir o badge no botão.
     Ignora campos de ordenação e filtros programáticos que o usuário não controla. */
  const activeCount = Object.entries(filters).filter(([k, v]) => {
    if (k === "sortBy" || k === "sortDir" || k === "minRiskScore" || k === "excludeResolved") return false;
    return v !== "" && v !== false;
  }).length;

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-2">
      {/* Search + toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Buscar por assunto, cliente, ticket ID..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
          />
          {filters.search && (
            <button onClick={() => update("search", "")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowMore((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors",
            showMore
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
          )}
        >
          <Filter size={14} />
          Filtros
          {activeCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button
            onClick={reset}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showMore && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v)}
            options={[
              ["", "Todos status"],
              ["NEW", "Novo"],
              ["TRIAGED", "Triado"],
              ["IN_PROGRESS", "Em Andamento"],
              ["WAITING_CUSTOMER", "Aguard. Cliente"],
              ["ESCALATED", "Escalado"],
              ["RESOLVED", "Resolvido"],
              ["CLOSED", "Fechado"],
              ["REOPENED", "Reaberto"],
            ]}
          />
          <Select
            label="Segmento"
            value={filters.segment}
            onChange={(v) => update("segment", v)}
            options={[["", "Todos"], ["ENT", "Enterprise"], ["MID", "Mid-Market"], ["SMB", "SMB"]]}
          />
          <Select
            label="Prioridade"
            value={filters.priority}
            onChange={(v) => update("priority", v)}
            options={[["", "Todas"], ["URGENT", "Urgente"], ["HIGH", "Alta"], ["MEDIUM", "Média"], ["LOW", "Baixa"]]}
          />
          <Select
            label="Categoria"
            value={filters.category}
            onChange={(v) => update("category", v)}
            options={[
              ["", "Todas"],
              ["CHURN_SIGNAL", "Churn Signal"],
              ["BUG", "Bug"],
              ["BILLING", "Financeiro"],
              ["FEATURE_REQUEST", "Funcionalidade"],
              ["HOW_TO", "Como fazer"],
              ["OTHER", "Outro"],
              ["null", "Sem categoria"],
            ]}
          />
          <Select
            label="Canal"
            value={filters.channel}
            onChange={(v) => update("channel", v)}
            options={[["", "Todos"], ["EMAIL", "Email"], ["CHAT", "Chat"], ["WHATSAPP", "WhatsApp"], ["PHONE_CALLBACK", "Telefone"]]}
          />
          <Select
            label="Agente"
            value={filters.assignedTo}
            onChange={(v) => update("assignedTo", v)}
            options={[["", "Todos"], ["unassigned", "Sem atribuição"], ...agents.map((a) => [a, a] as [string, string])]}
          />

          {/* Filtro por flag específica — mutuamente exclusivo com "Só sinalizados" */}
          <Select
            label="Flag de triagem"
            value={filters.flag}
            onChange={(v) => onChange({ ...filters, flag: v, flagged: v ? false : filters.flagged })}
            options={[
              ["", "Todas"],
              ["churn_signal",             "⚠ Risco de Churn"],
              ["ent_sla_breach",           "⏱ SLA Enterprise"],
              ["urgent_overdue",           "🔴 Urgente Atrasado"],
              ["hidden_urgency",           "⚠ Urgência Oculta"],
              ["unverified_urgent",        "? Urgência Não Confirmada"],
              ["repeat_distress",          "👥 Cliente Repetido"],
              ["stale_new",                "🕐 Parado"],
              ["high_reply_no_resolution", "💬 Travado"],
              ["no_response",              "📭 Sem Resposta"],
              ["phone_callback",           "📞 Ligou"],
              ["enterprise_plan",          "🏢 Enterprise"],
            ]}
          />

          <div className="flex items-center gap-2 col-span-2 sm:col-span-3 lg:col-span-2">
            <Select
              label="Ordenar por"
              value={filters.sortBy}
              onChange={(v) => update("sortBy", v)}
              options={[
                ["riskScore", "Risco"],
                ["createdAt", "Data criação"],
                ["lastReplyAt", "Última resposta"],
                ["replyCount", "Nº respostas"],
                ["priority", "Prioridade"],
                ["customerName", "Cliente"],
              ]}
            />
            <Select
              label="Direção"
              value={filters.sortDir}
              onChange={(v) => update("sortDir", v)}
              options={[["desc", "Decrescente"], ["asc", "Crescente"]]}
            />
          </div>

          {/* Checkbox que exibe apenas tickets com qualquer flag de triagem ativa.
              Ao marcar, limpa o filtro de flag específica para evitar conflito. */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.flagged}
              onChange={(e) => onChange({ ...filters, flagged: e.target.checked, flag: e.target.checked ? "" : filters.flag })}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
            />
            <span className="text-sm text-gray-700">Só sinalizados</span>
          </label>
        </div>
      )}
    </div>
  );
}

/* Select reutilizável para todos os filtros do painel avançado */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
      >
        {options.map(([val, label]) => (
          <option key={val} value={val}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
