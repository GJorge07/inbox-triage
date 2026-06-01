import { NextRequest } from "next/server";
import { getDb, logAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: primaryId } = await params;
  const sql = getDb();
  const actor     = req.headers.get("x-actor")      || "Líder de Suporte";
  const actorType = (req.headers.get("x-actor-type") || "USER") as "USER" | "AI_AGENT";

  const { secondaryId } = await req.json() as { secondaryId: string };
  if (!secondaryId)           return Response.json({ error: "secondaryId required" }, { status: 400 });
  if (primaryId === secondaryId) return Response.json({ error: "Cannot merge a ticket with itself" }, { status: 400 });

  const [primary]   = await sql`SELECT "ticketId", "customerName", subject FROM tickets WHERE "ticketId" = ${primaryId}   AND "mergedIntoId" IS NULL`;
  const [secondary] = await sql`SELECT "ticketId", "customerName", subject FROM tickets WHERE "ticketId" = ${secondaryId} AND "mergedIntoId" IS NULL`;

  if (!primary)   return Response.json({ error: "Primary ticket not found or already merged" },   { status: 404 });
  if (!secondary) return Response.json({ error: "Secondary ticket not found or already merged" }, { status: 404 });

  // Sequential updates (atomic enough for demo purposes)
  await sql`UPDATE replies   SET "ticketId" = ${primaryId} WHERE "ticketId" = ${secondaryId}`;
  await sql`UPDATE audit_log SET "ticketId" = ${primaryId} WHERE "ticketId" = ${secondaryId}`;
  await sql`
    UPDATE tickets
    SET "mergedIntoId" = ${primaryId},
        status         = 'CLOSED',
        "closeReason"  = 'DUPLICATE'
    WHERE "ticketId" = ${secondaryId}
  `;
  await sql`
    UPDATE tickets
    SET "replyCount" = (SELECT COUNT(*) FROM replies WHERE "ticketId" = ${primaryId})
    WHERE "ticketId" = ${primaryId}
  `;

  await logAudit(primaryId,   "merge",       actor, actorType, { primaryId, secondaryId }, { mergedFrom: secondaryId }, `Ticket ${secondaryId} merged into ${primaryId}`);
  await logAudit(secondaryId, "merged_into", actor, actorType, null, { mergedInto: primaryId }, `Merged into ${primaryId}`);

  return Response.json({ ok: true, primaryId, secondaryId });
}
