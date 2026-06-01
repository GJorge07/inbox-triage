"use client";

import { cn } from "@/lib/cn";
import type { TriageFlag } from "@/lib/types";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  NEW: { label: "Novo", cls: "bg-blue-100 text-blue-800" },
  TRIAGED: { label: "Triado", cls: "bg-indigo-100 text-indigo-800" },
  IN_PROGRESS: { label: "Em Andamento", cls: "bg-yellow-100 text-yellow-800" },
  WAITING_CUSTOMER: { label: "Aguard. Cliente", cls: "bg-orange-100 text-orange-800" },
  RESOLVED: { label: "Resolvido", cls: "bg-green-100 text-green-800" },
  CLOSED: { label: "Fechado", cls: "bg-gray-100 text-gray-600" },
  ESCALATED: { label: "Escalado", cls: "bg-red-100 text-red-800" },
  REOPENED: { label: "Reaberto", cls: "bg-purple-100 text-purple-800" },
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  LOW: { label: "Baixa", cls: "bg-gray-100 text-gray-600" },
  MEDIUM: { label: "Média", cls: "bg-yellow-100 text-yellow-700" },
  HIGH: { label: "Alta", cls: "bg-orange-100 text-orange-700" },
  URGENT: { label: "Urgente", cls: "bg-red-100 text-red-700 font-semibold" },
};

const SEGMENT_CONFIG: Record<string, { label: string; cls: string }> = {
  SMB: { label: "SMB", cls: "bg-gray-100 text-gray-700" },
  MID: { label: "MID", cls: "bg-blue-100 text-blue-700" },
  ENT: { label: "ENT", cls: "bg-purple-100 text-purple-800 font-semibold" },
};

const CHANNEL_CONFIG: Record<string, { label: string; cls: string }> = {
  EMAIL: { label: "Email", cls: "bg-sky-100 text-sky-700" },
  CHAT: { label: "Chat", cls: "bg-teal-100 text-teal-700" },
  WHATSAPP: { label: "WhatsApp", cls: "bg-green-100 text-green-700" },
  PHONE_CALLBACK: { label: "Telefone", cls: "bg-rose-100 text-rose-700" },
};

const FLAG_CONFIG: Record<TriageFlag, { label: string; cls: string }> = {
  churn_signal: { label: "Risco Churn", cls: "bg-red-500 text-white" },
  ent_sla_breach: { label: "SLA ENT", cls: "bg-orange-500 text-white" },
  urgent_overdue: { label: "Urgente Atrasado", cls: "bg-red-400 text-white" },
  repeat_distress: { label: "Cliente Repetido", cls: "bg-purple-500 text-white" },
  stale_new: { label: "Parado", cls: "bg-amber-500 text-white" },
  high_reply_no_resolution: { label: "Travado", cls: "bg-blue-500 text-white" },
  enterprise_plan: { label: "Enterprise", cls: "bg-indigo-500 text-white" },
  no_response: { label: "Sem Resposta", cls: "bg-red-600 text-white" },
  phone_callback: { label: "Ligou", cls: "bg-teal-500 text-white" },
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        cls
      )}
    >
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <Badge label={cfg.label} cls={cfg.cls} />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? { label: priority, cls: "bg-gray-100 text-gray-600" };
  return <Badge label={cfg.label} cls={cfg.cls} />;
}

export function SegmentBadge({ segment }: { segment: string }) {
  const cfg = SEGMENT_CONFIG[segment] ?? { label: segment, cls: "bg-gray-100 text-gray-600" };
  return <Badge label={cfg.label} cls={cfg.cls} />;
}

export function ChannelBadge({ channel }: { channel: string }) {
  const cfg = CHANNEL_CONFIG[channel] ?? { label: channel, cls: "bg-gray-100 text-gray-600" };
  return <Badge label={cfg.label} cls={cfg.cls} />;
}

export function TriageFlagBadge({ flag }: { flag: TriageFlag }) {
  const cfg = FLAG_CONFIG[flag] ?? { label: flag, cls: "bg-gray-400 text-white" };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

export function RiskScore({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-red-600"
      : score >= 60
      ? "text-orange-500"
      : score >= 40
      ? "text-yellow-600"
      : "text-green-600";
  const bgColor =
    score >= 80
      ? "bg-red-50 border-red-200"
      : score >= 60
      ? "bg-orange-50 border-orange-200"
      : score >= 40
      ? "bg-yellow-50 border-yellow-200"
      : "bg-green-50 border-green-200";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-9 h-7 rounded border text-xs font-bold",
        color,
        bgColor
      )}
      title={`Risk score: ${score}/100`}
    >
      {score}
    </span>
  );
}
