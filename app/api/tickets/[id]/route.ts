import { NextRequest } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { isValidTransition, computeRiskScore, computeTriageFlags, STATE_TRANSITIONS } from "@/lib/triage";
import { rowToTicket } from "@/app/api/tickets/route";
import type { Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const sql = getDb();

  const rows = await sql`SELECT * FROM tickets WHERE "ticketId" = ${id}`;
  if (!rows.length) return Response.json({ error: "Ticket not found" }, { status: 404 });

  const ticket = rowToTicket(rows[0] as Record<string, unknown>);
  const replies  = await sql`SELECT * FROM replies   WHERE "ticketId" = ${id} ORDER BY "createdAt" ASC`;
  const audit    = await sql`SELECT * FROM audit_log WHERE "ticketId" = ${id} ORDER BY "createdAt" DESC LIMIT 100`;

  return Response.json({ ticket, replies, audit });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const sql = getDb();
  const actor     = req.headers.get("x-actor")      || "Líder de Suporte";
  const actorType = (req.headers.get("x-actor-type") || "USER") as "USER" | "AI_AGENT";

  const rows = await sql`SELECT * FROM tickets WHERE "ticketId" = ${id}`;
  if (!rows.length) return Response.json({ error: "Ticket not found" }, { status: 404 });

  const before = rowToTicket(rows[0] as Record<string, unknown>);
  const body   = await req.json() as Record<string, unknown>;

  const sets: string[] = [];
  const vals: unknown[] = [];
  const changes: Record<string, unknown> = {};

  // Status transition
  if (body.status !== undefined && body.status !== before.status) {
    const newStatus = body.status as string;
    if (!isValidTransition(before.status, newStatus)) {
      return Response.json(
        { error: `Invalid transition: ${before.status} → ${newStatus}`, validTransitions: STATE_TRANSITIONS[before.status] ?? [] },
        { status: 422 }
      );
    }
    sets.push(`status = $${vals.length + 1}`); vals.push(newStatus);
    changes.status = { from: before.status, to: newStatus };

    if ((newStatus === "CLOSED" || newStatus === "RESOLVED") && body.closeReason) {
      sets.push(`"closeReason" = $${vals.length + 1}`); vals.push(body.closeReason);
      changes.closeReason = body.closeReason;
    }
  }

  if (body.category !== undefined && body.category !== before.category) {
    sets.push(`category = $${vals.length + 1}`); vals.push(body.category || null);
    changes.category = { from: before.category, to: body.category };
  }
  if (body.priority !== undefined && body.priority !== before.priority) {
    sets.push(`priority = $${vals.length + 1}`); vals.push(body.priority);
    changes.priority = { from: before.priority, to: body.priority };
  }
  if (body.assignedTo !== undefined && body.assignedTo !== before.assignedTo) {
    sets.push(`"assignedTo" = $${vals.length + 1}`); vals.push(body.assignedTo || null);
    changes.assignedTo = { from: before.assignedTo, to: body.assignedTo };
  }
  if (body.closeReason !== undefined && body.closeReason !== before.closeReason && !changes.closeReason) {
    sets.push(`"closeReason" = $${vals.length + 1}`); vals.push(body.closeReason || null);
    changes.closeReason = body.closeReason;
  }

  if (sets.length === 0) return Response.json({ ok: true, ticket: before });

  // Recompute risk + flags
  const merged = {
    ...before,
    ...Object.fromEntries(
      Object.entries(changes).map(([k, v]) => [k, typeof v === "object" && v !== null && "to" in (v as object) ? (v as { to: unknown }).to : v])
    ),
  } as Ticket;

  const newRisk  = computeRiskScore(merged);
  const newFlags = computeTriageFlags(merged);
  sets.push(`"riskScore" = $${vals.length + 1}`);   vals.push(newRisk);
  sets.push(`"triageFlags" = $${vals.length + 1}`); vals.push(JSON.stringify(newFlags));

  vals.push(id);
  await sql.query(`UPDATE tickets SET ${sets.join(", ")} WHERE "ticketId" = $${vals.length}`, vals);

  const updated = await sql`SELECT * FROM tickets WHERE "ticketId" = ${id}`;
  const after   = rowToTicket(updated[0] as Record<string, unknown>);

  await logAudit(id, Object.keys(changes).join(","), actor, actorType, before as unknown as object, changes, (body.reason as string) || undefined);

  return Response.json({ ok: true, ticket: after });
}
