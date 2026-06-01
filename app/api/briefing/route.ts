import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  const now = new Date();

  /* Segunda-feira: retroage até sexta às 18h para cobrir o fim de semana.
     Outros dias: últimas 24h. */
  const dayOfWeek = now.getDay(); // 0=Dom, 1=Seg
  let sinceDate: Date;
  if (dayOfWeek === 1) {
    // Segunda — mostra desde sexta às 18:00
    sinceDate = new Date(now);
    sinceDate.setDate(now.getDate() - 3);
    sinceDate.setHours(18, 0, 0, 0);
  } else if (dayOfWeek === 0) {
    // Domingo — mostra desde sexta às 18:00
    sinceDate = new Date(now);
    sinceDate.setDate(now.getDate() - 2);
    sinceDate.setHours(18, 0, 0, 0);
  } else {
    // Dia útil — últimas 24h
    sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const sinceIso = sinceDate.toISOString();

  const [newRow, entRow, churnRow, urgentRow, criticalRow, agentLoad] = await Promise.all([
    sql`SELECT COUNT(*) as n FROM tickets WHERE "createdAt" > ${sinceIso} AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE "customerSegment" = 'ENT'
          AND status NOT IN ('RESOLVED','CLOSED')
          AND ("lastReplyAt" IS NULL OR "lastReplyBy" = 'CUSTOMER')
          AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE "triageFlags" LIKE '%churn_signal%'
          AND status NOT IN ('RESOLVED','CLOSED')
          AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE "triageFlags" LIKE '%urgent_overdue%'
          AND status NOT IN ('RESOLVED','CLOSED')
          AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE "riskScore" >= 80
          AND status NOT IN ('RESOLVED','CLOSED')
          AND "mergedIntoId" IS NULL`,
    sql`SELECT "assignedTo" as agent, COUNT(*) as open
        FROM tickets
        WHERE status NOT IN ('RESOLVED','CLOSED')
          AND "assignedTo" IS NOT NULL
          AND "mergedIntoId" IS NULL
        GROUP BY "assignedTo"
        ORDER BY open DESC
        LIMIT 3`,
  ]);

  return Response.json({
    since: sinceIso,
    newTickets:    Number(newRow[0]?.n      ?? 0),
    entNoResponse: Number(entRow[0]?.n     ?? 0),
    churnActive:   Number(churnRow[0]?.n   ?? 0),
    urgentOverdue: Number(urgentRow[0]?.n  ?? 0),
    criticalCount: Number(criticalRow[0]?.n ?? 0),
    topAgents: agentLoad.map((r) => ({
      name: r.agent as string,
      open: Number(r.open),
    })),
  });
}
