import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();

  const [attention, noResponse, churn, newTickets, escalated] = await Promise.all([
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE status NOT IN ('RESOLVED','CLOSED')
        AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE status NOT IN ('RESOLVED','CLOSED')
        AND ("lastReplyAt" IS NULL OR "lastReplyBy" = 'CUSTOMER')
        AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE "triageFlags" LIKE '%churn_signal%'
        AND status NOT IN ('RESOLVED','CLOSED')
        AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE status = 'NEW'
        AND "mergedIntoId" IS NULL`,
    sql`SELECT COUNT(*) as n FROM tickets
        WHERE status = 'ESCALATED'
        AND "mergedIntoId" IS NULL`,
  ]);

  return Response.json({
    attention:  Number(attention[0]?.n  ?? 0),
    noResponse: Number(noResponse[0]?.n ?? 0),
    churn:      Number(churn[0]?.n      ?? 0),
    newTickets: Number(newTickets[0]?.n ?? 0),
    escalated:  Number(escalated[0]?.n  ?? 0),
  });
}
