import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  const agents = await sql`
    SELECT "assignedTo" as name,
           COUNT(*) as total,
           SUM(CASE WHEN status NOT IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) as open
    FROM tickets
    WHERE "assignedTo" IS NOT NULL AND "mergedIntoId" IS NULL
    GROUP BY "assignedTo"
    ORDER BY open DESC
  `;
  return Response.json({ agents });
}
