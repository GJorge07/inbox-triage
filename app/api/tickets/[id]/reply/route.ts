import { NextRequest } from "next/server";
import { getDb, logAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const sql = getDb();
  const replies = await sql`SELECT * FROM replies WHERE "ticketId" = ${id} ORDER BY "createdAt" ASC`;
  return Response.json({ replies });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const sql = getDb();
  const actor     = req.headers.get("x-actor")      || "Líder de Suporte";
  const actorType = (req.headers.get("x-actor-type") || "USER") as "USER" | "AI_AGENT";

  const tickets = await sql`SELECT "ticketId", status FROM tickets WHERE "ticketId" = ${id}`;
  if (!tickets.length) return Response.json({ error: "Ticket not found" }, { status: 404 });

  const { body } = await req.json() as { body: string };
  if (!body?.trim()) return Response.json({ error: "Reply body required" }, { status: 400 });

  const now = new Date().toISOString();

  const [inserted] = await sql`
    INSERT INTO replies ("ticketId", author, "authorType", body, "createdAt")
    VALUES (${id}, ${actor}, ${actorType}, ${body.trim()}, ${now})
    RETURNING *
  `;

  await sql`
    UPDATE tickets
    SET "replyCount" = "replyCount" + 1,
        "lastReplyAt" = ${now},
        "lastReplyBy" = 'AGENT'
    WHERE "ticketId" = ${id}
  `;

  await logAudit(
    id, "reply", actor, actorType,
    null,
    { preview: body.trim().slice(0, 100) },
    actorType === "AI_AGENT" ? "Resposta redigida pelo agente de IA" : undefined
  );

  return Response.json({ ok: true, reply: inserted });
}
