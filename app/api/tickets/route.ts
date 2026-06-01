import { NextRequest } from "next/server";
import { getDb, toPos } from "@/lib/db";
import type { Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sql = getDb();
  const { searchParams } = req.nextUrl;

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  const status     = searchParams.get("status");
  const excludeResolved = searchParams.get("excludeResolved") === "true";
  const noAgentReply    = searchParams.get("noAgentReply")    === "true";
  const segment = searchParams.get("segment");
  const priority = searchParams.get("priority");
  const category = searchParams.get("category");
  const channel = searchParams.get("channel");
  const assignedTo = searchParams.get("assignedTo");
  const flagged      = searchParams.get("flagged") === "true";
  const flag         = searchParams.get("flag")?.trim();
  const minRiskScore = searchParams.get("minRiskScore") ? parseInt(searchParams.get("minRiskScore")!, 10) : null;         // flag específica, ex: "hidden_urgency"
  const search = searchParams.get("search")?.trim();
  const sortBy = searchParams.get("sortBy") ?? "riskScore";
  const sortDir = searchParams.get("sortDir") === "asc" ? "ASC" : "DESC";

  const SORT_COLS: Record<string, string> = {
    riskScore:    '"riskScore"',
    createdAt:    '"createdAt"',
    lastReplyAt:  '"lastReplyAt"',
    replyCount:   '"replyCount"',
    priority:     "priority",
    status:       "status",
    customerName: '"customerName"',
  };
  const orderCol = SORT_COLS[sortBy] ?? '"riskScore"';

  const conditions: string[] = ['"mergedIntoId" IS NULL'];
  const params: (string | number)[] = [];

  if (status)          { conditions.push(`status = ?`); params.push(status); }
  if (excludeResolved) { conditions.push(`status NOT IN ('RESOLVED','CLOSED')`); }
  if (noAgentReply)    { conditions.push(`("lastReplyAt" IS NULL OR "lastReplyBy" = 'CUSTOMER')`); }
  if (segment)    { conditions.push(`"customerSegment" = ?`);    params.push(segment); }
  if (priority)   { conditions.push(`priority = ?`);             params.push(priority); }
  if (category) {
    if (category === "null") { conditions.push(`category IS NULL`); }
    else                     { conditions.push(`category = ?`); params.push(category); }
  }
  if (channel)    { conditions.push(`channel = ?`);              params.push(channel); }
  if (assignedTo) {
    if (assignedTo === "unassigned") { conditions.push(`"assignedTo" IS NULL`); }
    else                              { conditions.push(`"assignedTo" = ?`); params.push(assignedTo); }
  }
  if (flagged)       { conditions.push(`"triageFlags" != '[]'`); }
  if (flag)          { conditions.push(`"triageFlags" LIKE ?`); params.push(`%${flag}%`); }
  if (minRiskScore !== null) { conditions.push(`"riskScore" >= ?`); params.push(minRiskScore); }
  if (search) {
    const like = `%${search}%`;
    conditions.push(`(subject LIKE ? OR "bodyPreview" LIKE ? OR "customerName" LIKE ? OR "ticketId" LIKE ?)`);
    params.push(like, like, like, like);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countRows = await sql.query(toPos(`SELECT COUNT(*) as n FROM tickets ${where}`), params) as { n: string | number }[];
  const dataRows  = await sql.query(
    toPos(`SELECT * FROM tickets ${where} ORDER BY ${orderCol} ${sortDir} LIMIT ? OFFSET ?`),
    [...params, limit, offset]
  ) as Record<string, unknown>[];

  const total   = Number(countRows[0]?.n ?? 0);
  const tickets = dataRows.map(rowToTicket);

  return Response.json({ tickets, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export function rowToTicket(row: Record<string, unknown>): Ticket {
  return {
    ticketId:                       row.ticketId as string,
    customerId:                     row.customerId as string,
    customerName:                   row.customerName as string,
    customerSegment:                row.customerSegment as Ticket["customerSegment"],
    plan:                           row.plan as Ticket["plan"],
    channel:                        row.channel as Ticket["channel"],
    subject:                        row.subject as string,
    bodyPreview:                    row.bodyPreview as string,
    createdAt:                      row.createdAt as string,
    lastReplyAt:                    (row.lastReplyAt as string) || null,
    lastReplyBy:                    (row.lastReplyBy as Ticket["lastReplyBy"]) || null,
    replyCount:                     Number(row.replyCount ?? 0),
    status:                         row.status as Ticket["status"],
    priority:                       row.priority as Ticket["priority"],
    assignedTo:                     (row.assignedTo as string) || null,
    category:                       (row.category as Ticket["category"]) || null,
    previousOpenTicketsForCustomer: Number(row.previousOpenTicketsForCustomer ?? 0),
    riskScore:                      Number(row.riskScore ?? 0),
    triageFlags:                    JSON.parse((row.triageFlags as string) || "[]"),
    mergedIntoId:                   (row.mergedIntoId as string) || null,
    closeReason:                    (row.closeReason as string) || null,
  };
}
