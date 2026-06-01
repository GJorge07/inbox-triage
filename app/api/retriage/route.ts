import { getDb } from "@/lib/db";
import { computeTriageFlags, computeRiskScore } from "@/lib/triage";
import { rowToTicket } from "@/app/api/tickets/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/retriage
 * Recalcula triageFlags e riskScore para todos os tickets.
 * Necessário quando novas regras de triagem são adicionadas.
 */
export async function POST() {
  const sql = getDb();
  const rows = await sql`SELECT * FROM tickets WHERE "mergedIntoId" IS NULL` as Record<string, unknown>[];

  let updated = 0;
  const BATCH = 50;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (row) => {
      const ticket = rowToTicket(row);
      const newFlags = computeTriageFlags(ticket);
      const newScore = computeRiskScore(ticket);
      await sql`
        UPDATE tickets
        SET "triageFlags" = ${JSON.stringify(newFlags)},
            "riskScore"   = ${newScore}
        WHERE "ticketId" = ${ticket.ticketId}
      `;
      updated++;
    }));
  }

  return Response.json({ ok: true, updated });
}
