"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Inbox,
  BarChart3,
  AlertTriangle,
  MessageSquare,
  Clock,
  TrendingDown,
  Users,
  Loader2,
} from "lucide-react";
import type { DashboardStats } from "@/lib/types";
import AgentChat from "@/components/AgentChat";

/* Paleta de cores sequenciais para os gráficos de barra e pizza */
const COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a78bfa", "#fb923c"];

/* Cor fixa por status para o gráfico de pizza — garante consistência visual */
const STATUS_COLORS: Record<string, string> = {
  NEW: "#3b82f6",
  TRIAGED: "#6366f1",
  IN_PROGRESS: "#f59e0b",
  WAITING_CUSTOMER: "#fb923c",
  ESCALATED: "#ef4444",
  RESOLVED: "#22c55e",
  CLOSED: "#9ca3af",
  REOPENED: "#a78bfa",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); });
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-indigo-500" size={28} />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Barra de navegação */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Inbox size={22} className="text-indigo-600" />
          <span className="font-bold text-gray-900 text-lg">Inbox Triage</span>
        </div>
        <div className="flex gap-1">
          <Link
            href="/"
            className="px-3 py-1.5 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100"
          >
            Inbox
          </Link>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-50 text-indigo-700 flex items-center gap-1"
          >
            <BarChart3 size={14} />
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        <h1 className="text-xl font-bold text-gray-900">Dashboard de Suporte</h1>

        {/* Cards de KPI — métricas principais da inbox */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={<Inbox size={18} className="text-indigo-600" />}
            label="Em Aberto"
            value={stats.totalOpen.toLocaleString("pt-BR")}
            bg="bg-indigo-50"
          />
          <KpiCard
            icon={<AlertTriangle size={18} className="text-red-500" />}
            label="Churn Signals"
            value={stats.churnSignalCount.toLocaleString("pt-BR")}
            bg="bg-red-50"
            valueColor="text-red-600"
          />
          <KpiCard
            icon={<MessageSquare size={18} className="text-orange-500" />}
            label="Sem Resposta"
            value={stats.unrepliedCount.toLocaleString("pt-BR")}
            bg="bg-orange-50"
            valueColor="text-orange-600"
          />
          <KpiCard
            icon={<Clock size={18} className="text-blue-500" />}
            label="1ª Resposta (mediana)"
            value={
              stats.medianFirstResponseHours !== null
                ? `${stats.medianFirstResponseHours}h`
                : "—"
            }
            bg="bg-blue-50"
          />
          <KpiCard
            icon={<TrendingDown size={18} className="text-green-600" />}
            label="Abertos Hoje"
            value={stats.newToday.toLocaleString("pt-BR")}
            bg="bg-green-50"
          />
          <KpiCard
            icon={<Users size={18} className="text-purple-600" />}
            label="Agentes Ativos"
            value={stats.topAgents.length.toString()}
            bg="bg-purple-50"
          />
        </div>

        {/* Seção: volume de tickets e distribuição por status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gráfico de área — volume de tickets criados nos últimos 90 dias */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Volume por Dia (90 dias)</h2>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats.volumeByDay}>
                <defs>
                  <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#vol)" strokeWidth={2} name="Tickets" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de pizza — distribuição dos tickets por status */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Distribuição por Status</h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={stats.byStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  innerRadius={35}
                >
                  {stats.byStatus.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLORS[entry.status] ?? "#9ca3af"}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Seção: distribuição de risco, segmento e categoria */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Barras de progresso por faixa de risco (crítico / alto / médio / baixo) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Distribuição de Risco</h2>
            <div className="space-y-2">
              {stats.riskDistribution.map((r, i) => (
                <div key={r.range}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{r.range}</span>
                    <span className="font-semibold">{r.count.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((r.count / (stats.totalOpen || 1)) * 100)}%`,
                        backgroundColor: ["#ef4444", "#f97316", "#f59e0b", "#22c55e"][i],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gráfico de barras horizontais — tickets abertos por segmento */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Backlog por Segmento</h2>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={stats.bySegment} layout="vertical" barSize={20}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="segment" tick={{ fontSize: 11 }} tickLine={false} width={30} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" name="Tickets" radius={[0, 3, 3, 0]}>
                  {stats.bySegment.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de barras horizontais — distribuição por categoria */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Mix de Categorias</h2>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={stats.byCategory.slice(0, 7)} layout="vertical" barSize={14}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} tickLine={false} width={80} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" name="Tickets" radius={[0, 3, 3, 0]}>
                  {stats.byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Seção: ranking de agentes e clientes com mais tickets abertos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lista de agentes com barra de carga e ferramenta de balanceamento */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Top Agentes (tickets abertos)</h2>
              <AgentBalancer agents={stats.topAgents} />
            </div>
            <div className="space-y-2">
              {stats.topAgents.slice(0, 8).map((a, i) => {
                const maxOpen = stats.topAgents[0]?.open ?? 1;
                const pct = Math.round((a.open / maxOpen) * 100);
                /* Destaca em vermelho se o agente no topo tiver 50% mais tickets que o segundo */
                const isOverloaded = i === 0 && a.open > (stats.topAgents[1]?.open ?? 0) * 1.5;
                return (
                  <div key={a.agent}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm text-gray-700 flex-1 truncate">{a.agent}</span>
                      <div className="flex gap-1 text-xs">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${isOverloaded ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {a.open} abertos
                        </span>
                        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{a.resolved} resolvidos</span>
                      </div>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOverloaded ? "bg-red-400" : "bg-yellow-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clientes com maior volume de tickets abertos */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Top Clientes (tickets abertos)
            </h2>
            <div className="space-y-2">
              {stats.topCustomers.map((c) => (
                <div key={c.customerId} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{c.customerName}</p>
                    <p className="text-xs text-gray-400">{c.segment}</p>
                  </div>
                  <span className="text-sm font-bold text-indigo-600">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AgentChat />
    </div>
  );
}

/* ── Balanceador de carga entre agentes ─────────────────────────────────────
   Permite redistribuir tickets NEW do agente mais sobrecarregado para outro.
   Move apenas tickets com status NEW para não interromper atendimentos em curso. */
function AgentBalancer({ agents }: { agents: { agent: string; open: number; resolved: number }[] }) {
  const [open, setOpen]       = useState(false);
  const [from, setFrom]       = useState("");
  const [to, setTo]           = useState("");
  const [count, setCount]     = useState(5);
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState<string | null>(null);

  const eligible = agents.filter((a) => a.open > 0);

  const handleBalance = useCallback(async () => {
    if (!from || !to || from === to) return;
    setLoading(true);
    try {
      /* Busca os tickets do agente origem e redistribui para o destino em paralelo */
      const res = await fetch(`/api/tickets?assignedTo=${encodeURIComponent(from)}&status=NEW&limit=${count}&sortBy=riskScore`);
      const data = await res.json();
      const ids: string[] = (data.tickets ?? []).map((t: { ticketId: string }) => t.ticketId);
      if (!ids.length) { setDone("Nenhum ticket NEW para mover."); setLoading(false); return; }
      await Promise.all(ids.map((id) =>
        fetch(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-actor": "Líder de Suporte" },
          body: JSON.stringify({ assignedTo: to }),
        })
      ));
      setDone(`✓ ${ids.length} tickets movidos de ${from.split(" ")[0]} para ${to.split(" ")[0]}`);
      setTimeout(() => { setDone(null); setOpen(false); }, 3000);
    } finally { setLoading(false); }
  }, [from, to, count]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-medium transition-colors"
      >
        ⚖️ Balancear
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72">
          <p className="text-xs font-semibold text-gray-700 mb-3">Redistribuir tickets</p>

          {done ? (
            <p className="text-sm text-green-700 font-medium py-2">{done}</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">De (agente sobrecarregado)</label>
                <select value={from} onChange={(e) => setFrom(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Selecione...</option>
                  {eligible.map((a) => (
                    <option key={a.agent} value={a.agent}>{a.agent} ({a.open} abertos)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Para (agente disponível)</label>
                <select value={to} onChange={(e) => setTo(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Selecione...</option>
                  {eligible.filter((a) => a.agent !== from).map((a) => (
                    <option key={a.agent} value={a.agent}>{a.agent} ({a.open} abertos)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Quantos tickets mover</label>
                <input type="number" value={count} min={1} max={20}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <button
                onClick={handleBalance}
                disabled={!from || !to || from === to || loading}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {loading ? "Movendo..." : "Redistribuir tickets"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Card de KPI reutilizável com ícone, valor e label */
function KpiCard({
  icon,
  label,
  value,
  bg = "bg-gray-50",
  valueColor = "text-gray-900",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
