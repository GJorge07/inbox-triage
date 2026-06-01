"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart3, RefreshCw, AlertTriangle, Inbox,
  Loader2, ChevronLeft, ChevronRight, Zap, X,
  Coffee, Users,
} from "lucide-react";
import TicketRow from "@/components/TicketRow";
import TicketFilters, { type Filters } from "@/components/TicketFilters";
import AgentChat from "@/components/AgentChat";
import TriageMode from "@/components/TriageMode";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/cn";

const DEFAULT_FILTERS: Filters = {
  status: "", segment: "", priority: "", category: "",
  channel: "", assignedTo: "", flagged: false, search: "",
  sortBy: "riskScore", sortDir: "desc",
};

interface BriefingData {
  since: string;
  newTickets: number;
  entNoResponse: number;
  churnActive: number;
  urgentOverdue: number;
  topAgents: { name: string; open: number }[];
}

export default function InboxPage() {
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [seeded, setSeeded]         = useState<boolean | null>(null);
  const [seeding, setSeeding]       = useState(false);
  const [filters, setFilters]       = useState<Filters>(DEFAULT_FILTERS);
  const [agents, setAgents]         = useState<string[]>([]);
  const [briefing, setBriefing]     = useState<BriefingData | null>(null);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [newCount, setNewCount]     = useState(0);

  const LIMIT = 50;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page), limit: String(LIMIT),
      sortBy: filters.sortBy, sortDir: filters.sortDir,
    });
    if (filters.status)     params.set("status",     filters.status);
    if (filters.segment)    params.set("segment",    filters.segment);
    if (filters.priority)   params.set("priority",   filters.priority);
    if (filters.category)   params.set("category",   filters.category);
    if (filters.channel)    params.set("channel",    filters.channel);
    if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
    if (filters.flagged)    params.set("flagged",    "true");
    if (filters.search)     params.set("search",     filters.search);
    try {
      const res = await fetch(`/api/tickets?${params}`);
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, filters]);

  const checkSeed = useCallback(async () => {
    const res = await fetch("/api/seed");
    const data = await res.json();
    setSeeded(data.seeded);
    return data.seeded as boolean;
  }, []);

  const seed = async () => {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    await checkSeed();
    setSeeding(false);
  };

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    const data = await res.json();
    setAgents((data.agents ?? []).map((a: { name: string }) => a.name));
  }, []);

  const fetchBriefing = useCallback(async () => {
    try {
      const res = await fetch("/api/briefing");
      const data: BriefingData = await res.json();
      setBriefing(data);
    } catch { /* non-critical */ }
  }, []);

  const fetchNewCount = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets?status=NEW&limit=1");
      const data = await res.json();
      setNewCount(data.total ?? 0);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    checkSeed().then((ok) => {
      if (ok) {
        fetchTickets();
        fetchAgents();
        fetchBriefing();
        fetchNewCount();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seeded) { fetchTickets(); }
  }, [seeded, fetchTickets]);

  const handleFilterChange = (f: Filters) => { setFilters(f); setPage(1); };

  const criticalCount  = tickets.filter((t) => t.riskScore >= 80).length;
  const churnCount     = tickets.filter((t) => t.triageFlags.includes("churn_signal")).length;
  const unrepliedCount = tickets.filter((t) => !t.lastReplyAt).length;

  const showBriefing = briefing && !briefingDismissed && (
    briefing.newTickets > 5 || briefing.entNoResponse > 0 || briefing.churnActive > 0
  );

  const sinceLabel = briefing ? (() => {
    const d = new Date(briefing.since);
    const day = d.toLocaleDateString("pt-BR", { weekday: "short" });
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${day} às ${time}`;
  })() : "";

  if (seeded === null) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-indigo-600" size={32} />
    </div>
  );

  if (!seeded) return (
    <div className="flex flex-col items-center justify-center h-screen gap-6">
      <div className="text-center">
        <Inbox size={48} className="text-indigo-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">Paggo Suporte</h1>
        <p className="text-gray-500 mt-2">Carregue os ~8.000 tickets para começar a triagem</p>
      </div>
      <button
        onClick={seed} disabled={seeding}
        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-lg transition-colors disabled:opacity-60"
      >
        {seeding ? <><Loader2 size={18} className="animate-spin" /> Carregando...</> : <><Inbox size={18} /> Carregar Dataset</>}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Inbox size={22} className="text-indigo-600" />
            <span className="font-bold text-gray-900 text-lg">Paggo Suporte</span>
          </div>
          <div className="flex gap-1">
            <Link href="/" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-50 text-indigo-700">
              Inbox
            </Link>
            <Link href="/dashboard" className="px-3 py-1.5 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100 flex items-center gap-1">
              <BarChart3 size={14} /> Dashboard
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex gap-2">
            {criticalCount > 0 && (
              <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
                <AlertTriangle size={11} /> {criticalCount} críticos
              </span>
            )}
            {churnCount > 0 && (
              <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full font-semibold">
                {churnCount} churn
              </span>
            )}
            {unrepliedCount > 0 && (
              <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
                {unrepliedCount} sem resposta
              </span>
            )}
          </div>

          {/* Triage Mode button */}
          {newCount > 0 && (
            <button
              onClick={() => setTriageOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Zap size={14} />
              Triar ({newCount})
            </button>
          )}

          <button
            onClick={fetchTickets} disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </nav>

      {/* Morning Briefing Banner */}
      {showBriefing && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Coffee size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  Resumo desde {sinceLabel}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {briefing!.newTickets > 0 && (
                    <span className="text-sm text-amber-800">
                      <strong>{briefing!.newTickets}</strong> novos tickets
                    </span>
                  )}
                  {briefing!.entNoResponse > 0 && (
                    <span className="text-sm text-red-700 font-semibold">
                      ⚡ {briefing!.entNoResponse} ENT sem resposta
                    </span>
                  )}
                  {briefing!.churnActive > 0 && (
                    <span className="text-sm text-orange-700">
                      ⚠️ {briefing!.churnActive} sinais de churn
                    </span>
                  )}
                  {briefing!.urgentOverdue > 0 && (
                    <span className="text-sm text-red-700">
                      🔴 {briefing!.urgentOverdue} urgentes atrasados
                    </span>
                  )}
                  {briefing!.topAgents[0] && (
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <Users size={12} />
                      {briefing!.topAgents[0].name} com {briefing!.topAgents[0].open} tickets abertos
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => { setTriageOpen(true); setBriefingDismissed(true); }}
                className="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors"
              >
                Iniciar Triagem →
              </button>
              <button
                onClick={() => setBriefingDismissed(true)}
                className="p-1 text-amber-500 hover:text-amber-700 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <TicketFilters filters={filters} onChange={handleFilterChange} agents={agents} />

      {/* List header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 flex-shrink-0">
        <span>
          {loading ? "Carregando..." : `${total.toLocaleString("pt-BR")} tickets`}
          {filters.flagged && " (sinalizados)"}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
            className="p-1 hover:bg-gray-200 rounded disabled:opacity-40">
            <ChevronLeft size={14} />
          </button>
          <span>{page}/{totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}
            className="p-1 hover:bg-gray-200 rounded disabled:opacity-40">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto">
        {loading && tickets.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="animate-spin text-indigo-400" size={24} />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Inbox size={32} className="mb-2" />
            <p>Nenhum ticket encontrado</p>
          </div>
        ) : (
          tickets.map((t) => <TicketRow key={t.ticketId} ticket={t} />)
        )}
      </div>

      {/* Triage Mode overlay */}
      {triageOpen && (
        <TriageMode
          onClose={() => { setTriageOpen(false); fetchNewCount(); }}
          onAction={() => { fetchTickets(); fetchNewCount(); }}
          agents={agents}
        />
      )}

      {/* AI Agent */}
      <AgentChat onAction={fetchTickets} />
    </div>
  );
}
