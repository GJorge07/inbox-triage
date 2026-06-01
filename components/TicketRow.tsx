"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, Clock, AlertTriangle, Timer } from "lucide-react";
import {
  StatusBadge, PriorityBadge, SegmentBadge,
  ChannelBadge, TriageFlagBadge, RiskScore,
} from "@/components/Badges";
import type { Ticket, TriageFlag } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props { ticket: Ticket }

// SLA: ENT = 4h, MID = 8h (optional future use)
const ENT_SLA_HOURS = 4;

function getSlaIndicator(ticket: Ticket): { label: string; color: "green" | "yellow" | "red" } | null {
  if (ticket.customerSegment !== "ENT") return null;
  if (["RESOLVED", "CLOSED"].includes(ticket.status)) return null;

  // Has a recent agent reply → SLA met
  const hasAgentReply = ticket.lastReplyAt && ticket.lastReplyBy === "AGENT";
  if (hasAgentReply) return null;

  const hoursElapsed = (Date.now() - new Date(ticket.createdAt).getTime()) / 3_600_000;
  const remaining = ENT_SLA_HOURS - hoursElapsed;

  // Only show when within 2h of breach or already past
  if (remaining > 2) return null;

  const fmt = (h: number) =>
    h < 1 ? `${Math.round(h * 60)}min` : `${Math.floor(h)}h${Math.round((h % 1) * 60).toString().padStart(2, "0")}`;

  if (remaining <= 0) {
    return { label: `SLA +${fmt(Math.abs(remaining))}`, color: "red" };
  }
  return { label: `SLA ${fmt(remaining)}`, color: remaining < 1 ? "red" : "yellow" };
}

export default function TicketRow({ ticket }: Props) {
  const router = useRouter();
  const isCritical = ticket.riskScore >= 80;
  const isHigh     = ticket.riskScore >= 60;
  const sla        = getSlaIndicator(ticket);

  const timeAgo = formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true, locale: ptBR });
  const lastActivity = ticket.lastReplyAt
    ? formatDistanceToNow(new Date(ticket.lastReplyAt), { addSuffix: true, locale: ptBR })
    : "sem resposta";

  return (
    <div
      onClick={() => router.push(`/tickets/${ticket.ticketId}`)}
      className={cn(
        "ticket-row cursor-pointer border-b border-gray-100 px-4 py-3 hover:bg-gray-50 transition-colors",
        isCritical ? "border-l-4 border-l-red-500 bg-red-50/40" :
        isHigh     ? "border-l-4 border-l-orange-400 bg-orange-50/30" :
                     "border-l-4 border-l-transparent"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <RiskScore score={ticket.riskScore} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-gray-400 font-mono">{ticket.ticketId}</span>
                {isCritical && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                {/* SLA countdown badge */}
                {sla && (
                  <span className={cn(
                    "inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded",
                    sla.color === "red"    ? "bg-red-100 text-red-700" :
                    sla.color === "yellow" ? "bg-amber-100 text-amber-700" :
                                            "bg-green-100 text-green-700"
                  )}>
                    <Timer size={9} />
                    {sla.label}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{ticket.subject}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{ticket.bodyPreview}</p>
            </div>

            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <SegmentBadge segment={ticket.customerSegment} />
                <ChannelBadge channel={ticket.channel} />
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={10} />
                {timeAgo}
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.category && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{ticket.category}</span>
            )}
            <span className="text-xs text-gray-600 font-medium">{ticket.customerName}</span>
            {ticket.assignedTo && (
              <span className="text-xs text-gray-400">→ {ticket.assignedTo}</span>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
              <MessageSquare size={11} />
              {ticket.replyCount}
              <span className="text-gray-300">·</span>
              {lastActivity}
            </div>
          </div>

          {/* Triage flags */}
          {ticket.triageFlags.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {ticket.triageFlags.slice(0, 4).map((f) => (
                <TriageFlagBadge key={f} flag={f as TriageFlag} />
              ))}
              {ticket.triageFlags.length > 4 && (
                <span className="text-xs text-gray-400">+{ticket.triageFlags.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
