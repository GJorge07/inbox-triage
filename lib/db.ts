import { neon } from "@neondatabase/serverless";

export type SqlClient = ReturnType<typeof neon>;

/* Retorna uma conexão com o banco Neon*/
export function getDb(): SqlClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local");
  }
  return neon(process.env.DATABASE_URL);
}

/* Converte placeholders estilo SQLite para estilo PostgreSQL */
export function toPos(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

export async function initSchema(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS tickets (
      "ticketId"                        TEXT PRIMARY KEY,
      "customerId"                      TEXT NOT NULL,
      "customerName"                    TEXT NOT NULL,
      "customerSegment"                 TEXT NOT NULL,
      plan                              TEXT NOT NULL,
      channel                           TEXT NOT NULL,
      subject                           TEXT NOT NULL,
      "bodyPreview"                     TEXT NOT NULL DEFAULT '',
      "createdAt"                       TEXT NOT NULL,
      "lastReplyAt"                     TEXT,
      "lastReplyBy"                     TEXT,
      "replyCount"                      INTEGER NOT NULL DEFAULT 0,
      status                            TEXT NOT NULL DEFAULT 'NEW',
      priority                          TEXT NOT NULL DEFAULT 'MEDIUM',
      "assignedTo"                      TEXT,
      category                          TEXT,
      "previousOpenTicketsForCustomer"  INTEGER NOT NULL DEFAULT 0,
      "riskScore"                       REAL NOT NULL DEFAULT 0,
      "triageFlags"                     TEXT NOT NULL DEFAULT '[]',
      "mergedIntoId"                    TEXT,
      "closeReason"                     TEXT
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tickets_segment  ON tickets("customerSegment")`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tickets_risk     ON tickets("riskScore" DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tickets_created  ON tickets("createdAt")`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets("customerId")`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets("assignedTo")`;

  await sql`
    CREATE TABLE IF NOT EXISTS replies (
      id            SERIAL PRIMARY KEY,
      "ticketId"    TEXT NOT NULL,
      author        TEXT NOT NULL,
      "authorType"  TEXT NOT NULL DEFAULT 'USER',
      body          TEXT NOT NULL,
      "createdAt"   TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_replies_ticket ON replies("ticketId")`;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id            SERIAL PRIMARY KEY,
      "ticketId"    TEXT NOT NULL,
      action        TEXT NOT NULL,
      actor         TEXT NOT NULL DEFAULT 'Sistema',
      "actorType"   TEXT NOT NULL DEFAULT 'USER',
      before        TEXT,
      after         TEXT,
      reason        TEXT,
      "createdAt"   TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_ticket  ON audit_log("ticketId")`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log("createdAt")`;

  await sql`
    CREATE TABLE IF NOT EXISTS seed_meta (
      id              INTEGER PRIMARY KEY,
      "seededAt"      TEXT NOT NULL,
      "ticketCount"   INTEGER NOT NULL
    )
  `;
}

export async function isSeeded(): Promise<boolean> {
  try {
    const sql = getDb();
    const rows = await sql`SELECT id FROM seed_meta LIMIT 1`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function logAudit(
  ticketId: string,
  action: string,
  actor: string,
  actorType: "USER" | "AI_AGENT",
  before: object | null,
  after: object | null,
  reason?: string
): Promise<void> {
  try {
    const sql = getDb();
    await sql`
      INSERT INTO audit_log ("ticketId", action, actor, "actorType", before, after, reason, "createdAt")
      VALUES (
        ${ticketId},
        ${action},
        ${actor},
        ${actorType},
        ${before ? JSON.stringify(before) : null},
        ${after ? JSON.stringify(after) : null},
        ${reason ?? null},
        ${new Date().toISOString()}
      )
    `;
  } catch (e) {
    console.error("[logAudit error]", e);
  }
}
