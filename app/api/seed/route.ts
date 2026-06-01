import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { parse } from "csv-parse/sync";
import { getDb, initSchema, isSeeded, logAudit } from "@/lib/db";
import { computeRiskScore, computeTriageFlags } from "@/lib/triage";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for seeding 8k records

export async function GET() {
  const seeded = await isSeeded();
  if (seeded) {
    const sql = getDb();
    const rows = await sql`SELECT COUNT(*) as n FROM tickets`;
    return Response.json({ seeded: true, ticketCount: Number(rows[0].n) });
  }
  return Response.json({ seeded: false, ticketCount: 0 });
}

export async function POST(_req: NextRequest) {
  // Ensure tables exist
  await initSchema();

  const seeded = await isSeeded();
  if (seeded) {
    const sql = getDb();
    const rows = await sql`SELECT COUNT(*) as n FROM tickets`;
    return Response.json({ ok: true, message: "Already seeded", ticketCount: Number(rows[0].n) });
  }

  const csvPath = path.join(process.cwd(), "data", "tickets.csv");
  if (!fs.existsSync(csvPath)) {
    return Response.json({ error: "tickets.csv not found in /data" }, { status: 404 });
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  // Build all rows with computed fields
  const rows = records.map((r) => {
    const input = {
      customerSegment: r.customerSegment || "SMB",
      plan: r.plan || "FREE",
      channel: r.channel || "EMAIL",
      status: r.status || "NEW",
      priority: r.priority || "MEDIUM",
      subject: r.subject || "",
      bodyPreview: r.bodyPreview || "",
      createdAt: r.createdAt || new Date().toISOString(),
      lastReplyAt: r.lastReplyAt || null,
      lastReplyBy: r.lastReplyBy || null,
      replyCount: parseInt(r.replyCount || "0", 10),
      previousOpenTicketsForCustomer: parseInt(r.previousOpenTicketsForCustomer || "0", 10),
    };
    return {
      ticketId: r.ticketId,
      customerId: r.customerId,
      customerName: r.customerName,
      customerSegment: input.customerSegment,
      plan: input.plan,
      channel: input.channel,
      subject: input.subject,
      bodyPreview: input.bodyPreview,
      createdAt: input.createdAt,
      lastReplyAt: input.lastReplyAt,
      lastReplyBy: input.lastReplyBy,
      replyCount: input.replyCount,
      status: input.status,
      priority: input.priority,
      assignedTo: r.assignedTo || null,
      category: r.category || null,
      previousOpenTicketsForCustomer: input.previousOpenTicketsForCustomer,
      riskScore: computeRiskScore(input),
      triageFlags: JSON.stringify(computeTriageFlags(input)),
    };
  });

  // Batch insert — 200 rows per request to stay within Vercel timeout
  const sql = getDb();
  const BATCH = 200;
  const cols = [
    "ticketId", "customerId", "customerName", "customerSegment", "plan", "channel",
    "subject", "bodyPreview", "createdAt", "lastReplyAt", "lastReplyBy",
    "replyCount", "status", "priority", "assignedTo", "category",
    "previousOpenTicketsForCustomer", "riskScore", "triageFlags",
  ];
  const quotedCols = cols.map((c) => /[A-Z]/.test(c) ? `"${c}"` : c).join(", ");

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const placeholders = batch.map((row, rowIdx) => {
      const base = rowIdx * cols.length;
      cols.forEach((col) => params.push((row as Record<string, unknown>)[col] ?? null));
      return `(${cols.map((_, colIdx) => `$${base + colIdx + 1}`).join(", ")})`;
    }).join(", ");

    await sql.query(
      `INSERT INTO tickets (${quotedCols}) VALUES ${placeholders} ON CONFLICT ("ticketId") DO NOTHING`,
      params
    );
  }

  await sql`
    INSERT INTO seed_meta (id, "seededAt", "ticketCount")
    VALUES (1, ${new Date().toISOString()}, ${rows.length})
    ON CONFLICT (id) DO NOTHING
  `;

  try {
    if (rows[0]?.ticketId) {
      await logAudit(rows[0].ticketId, "seed", "Sistema", "USER", null, { ticketCount: rows.length });
    }
  } catch { /* non-critical */ }

  return Response.json({ ok: true, message: `Seeded ${rows.length} tickets`, ticketCount: rows.length });
}
