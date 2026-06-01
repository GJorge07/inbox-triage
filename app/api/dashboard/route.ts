import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const [
    openRow, todayRow, resolvedRow, churnRow, unrepliedRow,
    bySegment, byStatus, byCategory, byChannel, volumeByDay,
    topAgents, topCustomers,
    crit, high, med, low,
    responseData,
  ] = await Promise.all([
    sql`SELECT COUNT(*) as n FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets WHERE LEFT("createdAt", 10) = ${today} AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets WHERE status IN ('RESOLVED','CLOSED') AND LEFT("createdAt", 10) = ${today} AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets WHERE "triageFlags" LIKE '%churn_signal%' AND status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets WHERE "lastReplyAt" IS NULL AND status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`,

    sql`SELECT "customerSegment" as segment, COUNT(*) as count FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL GROUP BY "customerSegment" ORDER BY count DESC`,
    sql`SELECT status, COUNT(*) as count FROM tickets WHERE "mergedIntoId" IS NULL GROUP BY status ORDER BY count DESC`,
    sql`SELECT COALESCE(category,'Sem Categoria') as category, COUNT(*) as count FROM tickets WHERE "mergedIntoId" IS NULL GROUP BY category ORDER BY count DESC`,
    sql`SELECT channel, COUNT(*) as count FROM tickets WHERE "mergedIntoId" IS NULL GROUP BY channel ORDER BY count DESC`,
    sql`SELECT LEFT("createdAt", 10) as date, COUNT(*) as count FROM tickets WHERE "mergedIntoId" IS NULL GROUP BY LEFT("createdAt", 10) ORDER BY date DESC LIMIT 90`,

    sql`
      SELECT "assignedTo" as agent,
             SUM(CASE WHEN status NOT IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) as open,
             SUM(CASE WHEN status IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) as resolved
      FROM tickets
      WHERE "assignedTo" IS NOT NULL AND "mergedIntoId" IS NULL
      GROUP BY "assignedTo"
      ORDER BY open DESC
      LIMIT 10
    `,
    sql`
      SELECT "customerId", "customerName", "customerSegment" as segment, COUNT(*) as count
      FROM tickets
      WHERE status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL
      GROUP BY "customerId", "customerName", "customerSegment"
      ORDER BY count DESC
      LIMIT 10
    `,

    // Risk distribution
    sql`SELECT COUNT(*) as n FROM tickets WHERE "riskScore" >= 80 AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets WHERE "riskScore" >= 60 AND "riskScore" < 80 AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets WHERE "riskScore" >= 40 AND "riskScore" < 60 AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets WHERE "riskScore" < 40 AND "mergedIntoId" IS NULL`,

    // First response time: diff in hours between createdAt and lastReplyAt for AGENT replies
    sql`
      SELECT
        EXTRACT(EPOCH FROM (
          CAST("lastReplyAt" AS TIMESTAMP) - CAST("createdAt" AS TIMESTAMP)
        )) / 3600 AS "hoursToFirstReply"
      FROM tickets
      WHERE "lastReplyAt" IS NOT NULL AND "lastReplyBy" = 'AGENT' AND "mergedIntoId" IS NULL
      ORDER BY "hoursToFirstReply"
      LIMIT 1000
    `,
  ]);

  const riskDistribution = [
    { range: "Crítico (80-100)", count: Number(crit[0]?.n ?? 0) },
    { range: "Alto (60-79)",     count: Number(high[0]?.n ?? 0) },
    { range: "Médio (40-59)",    count: Number(med[0]?.n  ?? 0) },
    { range: "Baixo (0-39)",     count: Number(low[0]?.n  ?? 0) },
  ];

  let medianFirstResponseHours: number | null = null;
  if (responseData.length > 0) {
    const mid = Math.floor(responseData.length / 2);
    const val = Number((responseData[mid] as { hoursToFirstReply: number }).hoursToFirstReply);
    medianFirstResponseHours = isNaN(val) ? null : parseFloat(val.toFixed(1));
  }

  return Response.json({
    totalOpen:                Number(openRow[0]?.n      ?? 0),
    newToday:                 Number(todayRow[0]?.n     ?? 0),
    resolvedToday:            Number(resolvedRow[0]?.n  ?? 0),
    churnSignalCount:         Number(churnRow[0]?.n     ?? 0),
    unrepliedCount:           Number(unrepliedRow[0]?.n ?? 0),
    medianFirstResponseHours,
    bySegment:      bySegment.map((r) => ({ ...r, count: Number(r.count) })),
    byStatus:       byStatus.map((r)  => ({ ...r, count: Number(r.count) })),
    byCategory:     byCategory.map((r)=> ({ ...r, count: Number(r.count) })),
    byChannel:      byChannel.map((r) => ({ ...r, count: Number(r.count) })),
    volumeByDay:    ([...volumeByDay].reverse()).map((r) => ({ ...r, count: Number(r.count) })),
    topAgents:      topAgents.map((r) => ({ ...r, open: Number(r.open), resolved: Number(r.resolved) })),
    topCustomers:   topCustomers.map((r) => ({ ...r, count: Number(r.count) })),
    riskDistribution,
  });
}
