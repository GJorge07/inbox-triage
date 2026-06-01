"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare } from "lucide-react";
import { StatusBadge, SegmentBadge, RiskScore } from "@/components/Badges";
import type { Ticket, TriageFlag } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props { ticket: Ticket }

// Flags que já estão cobertas visualmente por outros elementos da linha
const SUPPRESSED_FLAGS = new Set<TriageFlag>(["enterprise_plan", "phone_callback"]);

const FLAG_DOT: Record<TriageFlag, { label: string; dot: string; text: string }> = {
  churn_signal:             { label: "Risco de Churn",          dot: "bg-red-500",    text: "text-red-700" },
  ent_sla_breach:           { label: "SLA ENT",                 dot: "bg-orange-500", text: "text-orange-700" },
  urgent_overdue:           { label: "Urgente Atrasado",        dot: "bg-red-400",    text: "text-red-600" },
  hidden_urgency:           { label: "Urgência Oculta",         dot: "bg-red-600",    text: "text-red-700" },
  repeat_distress:          { label: "Cliente Repetido",        dot: "bg-purple-400", text: "text-purple-700" },
  stale_new:                { label: "Parado",                  dot: "bg-amber-400",  text: "text-amber-700" },
  high_reply_no_resolution: { label: "Travado",                 dot: "bg-blue-400",   text: "text-blue-700" },
  no_response:              { label: "Sem Resposta",            dot: "bg-gray-400",   text: "text-gray-600" },
  unverified_urgent:        { label: "Urgência não confirmada", dot: "bg-yellow-400", text: "text-yellow-700" },
  enterprise_plan:          { label: "Enterprise",              dot: "bg-indigo-400", text: "text-indigo-700" },
  phone_callback:           { label: "Ligou",                   dot: "bg-teal-400",   text: "text-teal-700" },
};

export default function TicketRow({ ticket }: Props) {
  const router     = useRouter();
  const isCritical = ticket.riskScore >= 80;
  const isHigh     = ticket.riskScore >= 60;

  const visibleFlags = ticket.triageFlags.filter((f) => !SUPPRESSED_FLAGS.has(f as TriageFlag));

  const lastActivity = ticket.lastReplyAt
    ? formatDistanceToNow(new Date(ticket.lastReplyAt), { addSuffix: true, locale: ptBR })
    : "sem resposta";

  return (
    <div
      onClick={() => router.push(`/tickets/${ticket.ticketId}`)}
      className={cn(
        "cursor-pointer border-b border-gray-100 px-4 py-3 hover:bg-gray-50 transition-colors",
        isCritical ? "border-l-4 border-l-red-500 bg-red-50/30" :
        isHigh     ? "border-l-4 border-l-orange-400 bg-orange-50/20" :
                     "border-l-4 border-l-transparent"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <RiskScore score={ticket.riskScore} />
        </div>

        <div className="flex-1 min-w-0 space-y-1">

          {/* Linha 1: Cliente + segmento + tempo */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {ticket.customerName}
              </span>
              <SegmentBadge segment={ticket.customerSegment} />
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
              <MessageSquare size={11} />
              {ticket.replyCount}
              <span className="mx-0.5">·</span>
              {lastActivity}
            </div>
          </div>

          {/* Linha 2: Assunto */}
          <p className="text-sm text-gray-800 truncate">{ticket.subject}</p>

          {/* Linha 3: Status + assignee */}
          <div className="flex items-center gap-2">
            <StatusBadge status={ticket.status} />
            {ticket.assignedTo && (
              <span className="text-xs text-gray-400">→ {ticket.assignedTo}</span>
            )}
          </div>

          {/* Linha 4: Flags discretas */}
          {visibleFlags.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {visibleFlags.slice(0, 3).map((f) => {
                const cfg = FLAG_DOT[f as TriageFlag];
                if (!cfg) return null;
                return (
                  <span key={f} className={cn("flex items-center gap-1 text-xs", cfg.text)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />
                    {cfg.label}
                  </span>
                );
              })}
              {visibleFlags.length > 3 && (
                <span className="text-xs text-gray-400">+{visibleFlags.length - 3}</span>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
