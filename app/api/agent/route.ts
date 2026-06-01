import { generateText, stepCountIs } from "ai";
import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb, logAudit } from "@/lib/db";
import { isValidTransition } from "@/lib/triage";
import { rowToTicket } from "@/app/api/tickets/route";

export const dynamic = "force-dynamic";

const ACTOR = "Agente de IA";
const ACTOR_TYPE = "AI_AGENT" as const;

const SYSTEM = `Você é um assistente especializado em triagem de suporte ao cliente para uma SaaS B2B.
Você ajuda o(a) líder de suporte a gerenciar uma inbox de ~8.000 tickets.

REGRAS CRÍTICAS:
1. Nunca invente IDs de tickets, nomes de clientes ou fatos que não estão nos dados reais. Se não tiver os dados, pergunte ou recuse.
2. Para ações em MAIS DE UM ticket, merge ou respostas redigidas: use dryRun: true para preview e aguarde confirmação ANTES de executar.
3. Para FECHAR (CLOSED) ou RESOLVER (RESOLVED) qualquer ticket — mesmo um único — use SEMPRE dryRun: true primeiro. Fechamentos exigem confirmação explícita.
4. Para outras ações de ticket único (mudar status para não-fechamento, classificar, atribuir): pode executar diretamente.
5. Use as ferramentas disponíveis para buscar dados reais antes de responder.
6. Para redigir resposta a um ticket: chame DIRETAMENTE draftReply(ticketId). draftReply é a ÚNICA tool que acessa o corpo completo e o histórico de conversa — getTicket NÃO tem esses dados. Escrever a resposta diretamente no chat é PROIBIDO (bypassa o human-in-the-loop). Sempre use draftReply.
7. Quando o usuário disser "sim, executar" após um preview, chame a ferramenta com dryRun: false.

Responda sempre em português do Brasil.`;

export async function POST(req: Request) {
  let body: { messages: { role: string; content: string }[] };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY não configurada no servidor" }, { status: 500 });

  const { messages } = body;

  try {
    const result = await generateText({
      model: createAnthropic({ baseURL: "https://api.anthropic.com/v1", apiKey })("claude-sonnet-4-5"),
      system: SYSTEM,
      // @ts-expect-error – messages come from the client as plain objects
      messages,
      stopWhen: stepCountIs(8),
      tools: {

        // ─── READ TOOLS ─────────────────────────────────────────────────────────

        searchTickets: tool({
          description: "Busca e filtra tickets na inbox. Use para responder perguntas sobre tickets ou listar subconjuntos.",
          inputSchema: zodSchema(z.object({
            status:    z.string().optional(),
            segment:   z.string().optional().describe("SMB, MID ou ENT"),
            priority:  z.string().optional().describe("LOW, MEDIUM, HIGH, URGENT"),
            category:  z.string().optional(),
            channel:   z.string().optional(),
            assignedTo:z.string().optional(),
            flagged:   z.boolean().optional().describe("Somente tickets com flags de triagem"),
            search:    z.string().optional().describe("Texto livre para buscar em subject/body/cliente"),
            sortBy:    z.string().optional().describe("riskScore, createdAt, lastReplyAt, replyCount"),
            sortDir:   z.string().optional().describe("asc ou desc"),
            limit:     z.number().optional().describe("Máximo de tickets (padrão 20, máximo 50)"),
          })),
          execute: async (args) => {
            const sql = getDb();
            const conditions: string[] = ['"mergedIntoId" IS NULL'];
            const params: (string | number)[] = [];
            if (args.status)    { conditions.push(`status = ?`);               params.push(args.status); }
            if (args.segment)   { conditions.push(`"customerSegment" = ?`);    params.push(args.segment); }
            if (args.priority)  { conditions.push(`priority = ?`);             params.push(args.priority); }
            if (args.category)  { conditions.push(`category = ?`);             params.push(args.category); }
            if (args.channel)   { conditions.push(`channel = ?`);              params.push(args.channel); }
            if (args.assignedTo){ conditions.push(`"assignedTo" = ?`);         params.push(args.assignedTo); }
            if (args.flagged)   { conditions.push(`"triageFlags" != '[]'`); }
            if (args.search) {
              const like = `%${args.search}%`;
              conditions.push(`(subject LIKE ? OR "bodyPreview" LIKE ? OR "customerName" LIKE ? OR "ticketId" LIKE ?)`);
              params.push(like, like, like, like);
            }
            const SORT: Record<string, string> = { riskScore: '"riskScore"', createdAt: '"createdAt"', lastReplyAt: '"lastReplyAt"', replyCount: '"replyCount"' };
            const orderBy  = SORT[args.sortBy ?? "riskScore"] ?? '"riskScore"';
            const orderDir = args.sortDir === "asc" ? "ASC" : "DESC";
            const limit    = Math.min(args.limit ?? 20, 50);
            const where    = `WHERE ${conditions.join(" AND ")}`;

            const { toPos } = await import("@/lib/db");
            const [countRows, dataRows] = await Promise.all([
              sql.query(toPos(`SELECT COUNT(*) as n FROM tickets ${where}`), params) as Promise<{ n: number | string }[]>,
              sql.query(toPos(`SELECT "ticketId", subject, "customerName", "customerSegment", plan, channel, status, priority, "assignedTo", category, "riskScore", "triageFlags", "createdAt", "lastReplyAt", "replyCount", "bodyPreview" FROM tickets ${where} ORDER BY ${orderBy} ${orderDir} LIMIT ?`), [...params, limit]) as Promise<Record<string, unknown>[]>,
            ]);

            const total = Number(countRows[0]?.n ?? 0);
            return {
              total, showing: dataRows.length,
              tickets: dataRows.map((r) => {
                const t = rowToTicket(r);
                return {
                  ticketId: t.ticketId, subject: t.subject, customerName: t.customerName,
                  customerSegment: t.customerSegment, plan: t.plan, channel: t.channel,
                  status: t.status, priority: t.priority, assignedTo: t.assignedTo,
                  category: t.category, riskScore: t.riskScore, triageFlags: t.triageFlags,
                  createdAt: t.createdAt, lastReplyAt: t.lastReplyAt,
                  replyCount: t.replyCount, bodyPreview: t.bodyPreview.slice(0, 150),
                };
              }),
            };
          },
        }),

        getTicket: tool({
          description: "Busca metadados de um ticket pelo ID: status, prioridade, segmento, assignee, flags, etc. NÃO retorna histórico de replies nem corpo completo. ⚠️ Para qualquer pedido de REDIGIR ou ESCREVER uma resposta ao cliente, use draftReply() — NÃO esta tool.",
          inputSchema: zodSchema(z.object({ ticketId: z.string().describe("ID do ticket, ex: TKT-302239") })),
          execute: async ({ ticketId }) => {
            const sql = getDb();
            const rows = await sql`SELECT * FROM tickets WHERE "ticketId" = ${ticketId}`;
            if (!rows.length) return { error: `Ticket ${ticketId} não encontrado` };
            const ticket = rowToTicket(rows[0] as Record<string, unknown>);
            const replyCountRow = await sql`SELECT COUNT(*) as n FROM replies WHERE "ticketId" = ${ticketId}`;
            const replyCount = Number(replyCountRow[0]?.n ?? 0);
            const audit = await sql`SELECT action, actor, "createdAt", after FROM audit_log WHERE "ticketId" = ${ticketId} ORDER BY "createdAt" DESC LIMIT 5`;
            return { ticket, replyCount, recentAudit: audit };
          },
        }),

        getInboxStats: tool({
          description: "Retorna estatísticas da inbox: por segmento, agentes sobrecarregados, churn signals, etc.",
          inputSchema: zodSchema(z.object({})),
          execute: async () => {
            const sql = getDb();
            const [openRow, churnRow, unrepliedRow, entSlaRow, bySegment, agentLoad] = await Promise.all([
              sql`SELECT COUNT(*) as n FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`,
              sql`SELECT COUNT(*) as n FROM tickets WHERE "triageFlags" LIKE '%churn_signal%' AND status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`,
              sql`SELECT COUNT(*) as n FROM tickets WHERE "lastReplyAt" IS NULL AND status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`,
              sql`SELECT COUNT(*) as n FROM tickets WHERE "triageFlags" LIKE '%ent_sla_breach%' AND status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`,
              sql`SELECT "customerSegment" as segment, COUNT(*) as count FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL GROUP BY "customerSegment"`,
              sql`SELECT "assignedTo" as agent, COUNT(*) as open FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED') AND "assignedTo" IS NOT NULL AND "mergedIntoId" IS NULL GROUP BY "assignedTo" ORDER BY open DESC LIMIT 10`,
            ]);
            return {
              openTickets: Number(openRow[0]?.n ?? 0),
              churnSignals: Number(churnRow[0]?.n ?? 0),
              unreplied: Number(unrepliedRow[0]?.n ?? 0),
              entSlaBreach: Number(entSlaRow[0]?.n ?? 0),
              bySegment: bySegment.map((r) => ({ ...r, count: Number(r.count) })),
              agentLoad: agentLoad.map((r) => ({ ...r, open: Number(r.open) })),
            };
          },
        }),

        getChurnSignals: tool({
          description: "Lista todos os tickets com sinais de churn ativos, ordenados por risco.",
          inputSchema: zodSchema(z.object({ limit: z.number().optional() })),
          execute: async ({ limit = 20 }) => {
            const sql = getDb();
            const rows = await sql.query(
              `SELECT "ticketId", "customerName", "customerSegment", plan, subject, "bodyPreview", "riskScore", status, "assignedTo", "createdAt"
               FROM tickets WHERE "triageFlags" LIKE '%churn_signal%' AND status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL
               ORDER BY "riskScore" DESC LIMIT $1`,
              [limit]
            ) as Record<string, unknown>[];
            return { count: rows.length, tickets: rows };
          },
        }),

        // ─── WRITE TOOLS ─────────────────────────────────────────────────────────

        updateTicketStatus: tool({
          description: "Muda o status de um ticket único. Para CLOSED ou RESOLVED, use dryRun:true primeiro para mostrar preview — fechamentos exigem confirmação explícita.",
          inputSchema: zodSchema(z.object({
            ticketId:    z.string(),
            newStatus:   z.string().describe("NEW, TRIAGED, IN_PROGRESS, WAITING_CUSTOMER, RESOLVED, CLOSED, ESCALATED, REOPENED"),
            reason:      z.string().optional(),
            closeReason: z.string().optional().describe("Se CLOSED: RESOLVED_FIXED, RESOLVED_INFO, DUPLICATE, NOT_REPRODUCIBLE, WONT_FIX, CUSTOMER_NO_RESPONSE"),
            dryRun:      z.boolean().optional().describe("true = preview (obrigatório para CLOSED/RESOLVED), false = executar"),
          })),
          execute: async ({ ticketId, newStatus, reason, closeReason, dryRun }) => {
            const sql = getDb();
            const rows = await sql`SELECT * FROM tickets WHERE "ticketId" = ${ticketId}`;
            if (!rows.length) return { error: `Ticket ${ticketId} não encontrado` };
            const ticket = rowToTicket(rows[0] as Record<string, unknown>);
            if (!isValidTransition(ticket.status, newStatus)) return { error: `Transição inválida: ${ticket.status} → ${newStatus}` };

            const isClose = newStatus === "CLOSED" || newStatus === "RESOLVED";
            if (isClose && dryRun !== false) {
              return {
                preview: true, requiresConfirmation: true,
                ticketId, customerName: ticket.customerName,
                from: ticket.status, to: newStatus, closeReason: closeReason ?? null,
                summary: `Fechar ticket ${ticketId} (${ticket.customerName}) como ${newStatus}${closeReason ? ` — motivo: ${closeReason}` : ""}.`,
                note: "⚠️ PREVIEW — Confirme com 'sim, executar' para fechar.",
              };
            }

            if (isClose && closeReason) {
              await sql`UPDATE tickets SET status = ${newStatus}, "closeReason" = ${closeReason} WHERE "ticketId" = ${ticketId}`;
            } else {
              await sql`UPDATE tickets SET status = ${newStatus} WHERE "ticketId" = ${ticketId}`;
            }
            await logAudit(ticketId, "status_change", ACTOR, ACTOR_TYPE, { status: ticket.status }, { status: newStatus, closeReason }, reason);
            return { ok: true, ticketId, from: ticket.status, to: newStatus };
          },
        }),

        classifyTicket: tool({
          description: "Define ou altera a categoria e/ou prioridade de um ticket.",
          inputSchema: zodSchema(z.object({
            ticketId: z.string(),
            category: z.string().optional().describe("BILLING, BUG, FEATURE_REQUEST, HOW_TO, CHURN_SIGNAL, OTHER"),
            priority: z.string().optional().describe("LOW, MEDIUM, HIGH, URGENT"),
            reason:   z.string().optional(),
          })),
          execute: async ({ ticketId, category, priority, reason }) => {
            const sql = getDb();
            const rows = await sql`SELECT * FROM tickets WHERE "ticketId" = ${ticketId}`;
            if (!rows.length) return { error: `Ticket ${ticketId} não encontrado` };
            const sets: string[] = [];
            const vals: unknown[] = [];
            const before: Record<string, unknown> = {};
            const after: Record<string, unknown> = {};
            const row = rows[0] as Record<string, unknown>;
            if (category !== undefined) { sets.push(`category = $${vals.length + 1}`); vals.push(category); before.category = row.category; after.category = category; }
            if (priority !== undefined) { sets.push(`priority = $${vals.length + 1}`); vals.push(priority); before.priority = row.priority; after.priority = priority; }
            if (!sets.length) return { error: "Nenhum campo para atualizar" };
            vals.push(ticketId);
            await sql.query(`UPDATE tickets SET ${sets.join(", ")} WHERE "ticketId" = $${vals.length}`, vals);
            await logAudit(ticketId, "classify", ACTOR, ACTOR_TYPE, before, after, reason);
            return { ok: true, ticketId, changes: after };
          },
        }),

        assignTicket: tool({
          description: "Atribui ou reatribui um ticket a um agente. Executa imediatamente.",
          inputSchema: zodSchema(z.object({
            ticketId:  z.string(),
            agentName: z.string().describe("Nome do agente, string vazia para desatribuir"),
            reason:    z.string().optional(),
          })),
          execute: async ({ ticketId, agentName, reason }) => {
            const sql = getDb();
            const rows = await sql`SELECT "assignedTo" FROM tickets WHERE "ticketId" = ${ticketId}`;
            if (!rows.length) return { error: `Ticket ${ticketId} não encontrado` };
            const prev = (rows[0] as Record<string, unknown>).assignedTo;
            await sql`UPDATE tickets SET "assignedTo" = ${agentName || null} WHERE "ticketId" = ${ticketId}`;
            await logAudit(ticketId, "assign", ACTOR, ACTOR_TYPE, { assignedTo: prev }, { assignedTo: agentName }, reason);
            return { ok: true, ticketId, assignedTo: agentName };
          },
        }),

        escalateTicket: tool({
          description: "Escala um ticket para ESCALATED.",
          inputSchema: zodSchema(z.object({
            ticketId: z.string(),
            reason:   z.string().describe("Motivo da escalada"),
          })),
          execute: async ({ ticketId, reason }) => {
            const sql = getDb();
            const rows = await sql`SELECT status FROM tickets WHERE "ticketId" = ${ticketId}`;
            if (!rows.length) return { error: `Ticket ${ticketId} não encontrado` };
            const status = (rows[0] as Record<string, unknown>).status as string;
            if (!isValidTransition(status, "ESCALATED")) return { error: `Não é possível escalar a partir de ${status}` };
            await sql`UPDATE tickets SET status = 'ESCALATED' WHERE "ticketId" = ${ticketId}`;
            await logAudit(ticketId, "escalate", ACTOR, ACTOR_TYPE, { status }, { status: "ESCALATED" }, reason);
            return { ok: true, ticketId, reason };
          },
        }),

        draftReply: tool({
          description: "OBRIGATÓRIO para qualquer pedido de redigir/escrever/criar resposta a um ticket. Gera resposta personalizada usando o corpo real do ticket, histórico de replies e contexto do cliente via IA. Sempre retorna preview para confirmação — nunca envia automaticamente. Nunca escreva respostas de ticket diretamente no chat — sempre use esta tool.",
          inputSchema: zodSchema(z.object({
            ticketId:    z.string(),
            focusPoints: z.string().optional().describe("Pontos específicos para endereçar na resposta"),
          })),
          execute: async ({ ticketId, focusPoints }) => {
            const sql = getDb();
            const rows = await sql`SELECT * FROM tickets WHERE "ticketId" = ${ticketId}`;
            if (!rows.length) return { error: `Ticket ${ticketId} não encontrado` };
            const ticket = rowToTicket(rows[0] as Record<string, unknown>);

            const replies = await sql`SELECT body, author, "authorType", "createdAt" FROM replies WHERE "ticketId" = ${ticketId} ORDER BY "createdAt" ASC` as { body: string; author: string; authorType: string; createdAt: string }[];
            const openCountRow = await sql`SELECT COUNT(*) as n FROM tickets WHERE "customerId" = ${ticket.customerId} AND status NOT IN ('RESOLVED','CLOSED') AND "mergedIntoId" IS NULL`;
            const openCount = Number(openCountRow[0]?.n ?? 0);

            const tone = ticket.customerSegment === "ENT" ? "formal e profissional" : ticket.customerSegment === "MID" ? "semi-formal e cordial" : "amigável e direto";
            const sla  = ticket.customerSegment === "ENT" ? "2 horas úteis" : ticket.customerSegment === "MID" ? "4 horas úteis" : "1 dia útil";
            const replyHistory = replies.length > 0
              ? replies.map((r) => `[${r.authorType} - ${r.author}]: ${r.body}`).join("\n---\n")
              : "Nenhuma resposta ainda — este é o primeiro contato.";

            const prompt = `Você é um agente de suporte de uma SaaS B2B. Redija uma resposta de suporte personalizada em português do Brasil.

DADOS DO TICKET:
- ID: ${ticket.ticketId}
- Assunto: ${ticket.subject}
- Mensagem do cliente: ${ticket.bodyPreview}
- Categoria: ${ticket.category ?? "não classificado"}
- Prioridade: ${ticket.priority}
- Flags de triagem: ${ticket.triageFlags.join(", ") || "nenhuma"}

CONTEXTO DO CLIENTE:
- Empresa: ${ticket.customerName}
- Segmento: ${ticket.customerSegment} | Plano: ${ticket.plan}
- Tickets abertos desta empresa: ${openCount}
- Canal: ${ticket.channel}

HISTÓRICO DE CONVERSA:
${replyHistory}

${focusPoints ? `PONTOS ESPECÍFICOS A ENDEREÇAR: ${focusPoints}` : ""}

INSTRUÇÕES:
- Tom: ${tone}
- SLA de próxima resposta: ${sla}
- NÃO use templates genéricos — use os detalhes específicos do ticket
- Reconheça o problema exato mencionado pelo cliente
- Se for churn_signal: demonstre urgência em reter, ofereça contato direto com especialista
- Se for BUG: confirme que reproduziu/registrou o issue, dê timeline realista
- Se for BILLING: confirme recebimento e dê prazo específico do time financeiro
- Estabeleça expectativa clara de próxima resposta com o SLA acima
- Máximo 4 parágrafos
- Assine como: Time de Suporte`;

            const { text: draft } = await generateText({
              model: createAnthropic({ baseURL: "https://api.anthropic.com/v1", apiKey })("claude-sonnet-4-5"),
              prompt,
              maxTokens: 600,
            });

            return {
              preview: true, requiresConfirmation: true, ticketId,
              customerName: ticket.customerName,
              segment: ticket.customerSegment,
              plan: ticket.plan,
              openTicketsForCustomer: openCount,
              replyCount: replies.length,
              draft,
              note: "⚠️ PREVIEW — Esta resposta NÃO foi enviada. Revise e use a caixa de resposta no ticket para enviar.",
            };
          },
        }),

        bulkUpdateStatus: tool({
          description: "Muda o status de MÚLTIPLOS tickets. Use dryRun: true para preview; dryRun: false para executar após confirmação.",
          inputSchema: zodSchema(z.object({
            ticketIds: z.array(z.string()),
            newStatus: z.string(),
            reason:    z.string().optional(),
            dryRun:    z.boolean().describe("true = preview, false = executar"),
          })),
          execute: async ({ ticketIds, newStatus, reason, dryRun }) => {
            const sql = getDb();
            const valid: string[] = [];
            const invalid: { id: string; reason: string }[] = [];
            for (const id of ticketIds) {
              const rows = await sql`SELECT status FROM tickets WHERE "ticketId" = ${id}`;
              if (!rows.length) { invalid.push({ id, reason: "Não encontrado" }); continue; }
              const status = (rows[0] as Record<string, unknown>).status as string;
              if (!isValidTransition(status, newStatus)) { invalid.push({ id, reason: `${status} → ${newStatus} inválido` }); continue; }
              valid.push(id);
            }
            if (dryRun) return {
              preview: true, requiresConfirmation: true,
              summary: `${valid.length} tickets → "${newStatus}". ${invalid.length} inválidos ignorados.`,
              willUpdate: valid, willSkip: invalid,
              note: "⚠️ PREVIEW — Confirme com 'sim, executar' e chame com dryRun: false.",
            };
            for (const id of valid) {
              await sql`UPDATE tickets SET status = ${newStatus} WHERE "ticketId" = ${id}`;
              await logAudit(id, "status_change", ACTOR, ACTOR_TYPE, null, { status: newStatus }, reason ?? "Bulk update via agente");
            }
            return { ok: true, updated: valid.length, skipped: invalid.length };
          },
        }),

        bulkAssign: tool({
          description: "Atribui múltiplos tickets a um agente. Use dryRun: true para preview.",
          inputSchema: zodSchema(z.object({
            ticketIds: z.array(z.string()),
            agentName: z.string(),
            dryRun:    z.boolean(),
          })),
          execute: async ({ ticketIds, agentName, dryRun }) => {
            const sql = getDb();
            if (dryRun) return {
              preview: true, requiresConfirmation: true,
              summary: `${ticketIds.length} tickets → "${agentName}".`,
              ticketIds, agentName,
              note: "⚠️ PREVIEW — Confirme para executar.",
            };
            for (const id of ticketIds) {
              const rows = await sql`SELECT "assignedTo" FROM tickets WHERE "ticketId" = ${id}`;
              if (!rows.length) continue;
              const prev = (rows[0] as Record<string, unknown>).assignedTo;
              await sql`UPDATE tickets SET "assignedTo" = ${agentName} WHERE "ticketId" = ${id}`;
              await logAudit(id, "assign", ACTOR, ACTOR_TYPE, { assignedTo: prev }, { assignedTo: agentName }, "Bulk assign via agente");
            }
            return { ok: true, assigned: ticketIds.length, agentName };
          },
        }),

        bulkEscalate: tool({
          description: "Escala múltiplos tickets para ESCALATED. Use dryRun: true para preview antes de executar.",
          inputSchema: zodSchema(z.object({
            ticketIds: z.array(z.string()),
            reason:    z.string().describe("Motivo da escalada em massa"),
            dryRun:    z.boolean().describe("true = preview, false = executar"),
          })),
          execute: async ({ ticketIds, reason, dryRun }) => {
            const sql = getDb();
            const valid: string[] = [];
            const invalid: { id: string; reason: string }[] = [];
            const previews: { id: string; customerName: string; status: string }[] = [];
            for (const id of ticketIds) {
              const rows = await sql`SELECT status, "customerName" FROM tickets WHERE "ticketId" = ${id}`;
              if (!rows.length) { invalid.push({ id, reason: "Não encontrado" }); continue; }
              const row = rows[0] as Record<string, unknown>;
              const status = row.status as string;
              if (!isValidTransition(status, "ESCALATED")) { invalid.push({ id, reason: `${status} → ESCALATED inválido` }); continue; }
              valid.push(id);
              previews.push({ id, customerName: row.customerName as string, status });
            }
            if (dryRun) return {
              preview: true, requiresConfirmation: true,
              summary: `${valid.length} tickets serão escalados. ${invalid.length} inválidos ignorados.`,
              willEscalate: previews, willSkip: invalid, reason,
              note: "⚠️ PREVIEW — Confirme com 'sim, executar' para escalar.",
            };
            for (const id of valid) {
              await sql`UPDATE tickets SET status = 'ESCALATED' WHERE "ticketId" = ${id}`;
              await logAudit(id, "escalate", ACTOR, ACTOR_TYPE, null, { status: "ESCALATED" }, reason);
            }
            return { ok: true, escalated: valid.length, skipped: invalid.length };
          },
        }),

        mergeTickets: tool({
          description: "Mescla dois tickets. Use dryRun: true para preview — esta ação é IRREVERSÍVEL.",
          inputSchema: zodSchema(z.object({
            primaryId:   z.string(),
            secondaryId: z.string(),
            dryRun:      z.boolean().describe("true para preview, false para executar"),
          })),
          execute: async ({ primaryId, secondaryId, dryRun }) => {
            const sql = getDb();
            const [primRows, secRows] = await Promise.all([
              sql`SELECT "ticketId", "customerName", subject FROM tickets WHERE "ticketId" = ${primaryId}   AND "mergedIntoId" IS NULL`,
              sql`SELECT "ticketId", "customerName", subject FROM tickets WHERE "ticketId" = ${secondaryId} AND "mergedIntoId" IS NULL`,
            ]);
            if (!primRows.length) return { error: `${primaryId} não encontrado ou já mesclado` };
            if (!secRows.length)  return { error: `${secondaryId} não encontrado ou já mesclado` };
            const primary   = primRows[0] as Record<string, unknown>;
            const secondary = secRows[0]  as Record<string, unknown>;
            if (dryRun) return {
              preview: true, requiresConfirmation: true,
              summary: `Vai mesclar "${secondary.subject}" (${secondaryId}) no "${primary.subject}" (${primaryId}). ${secondaryId} será fechado como DUPLICATE.`,
              primary, secondary,
              note: "⚠️ IRREVERSÍVEL — Confirme para executar.",
            };
            await sql`UPDATE replies   SET "ticketId" = ${primaryId} WHERE "ticketId" = ${secondaryId}`;
            await sql`UPDATE audit_log SET "ticketId" = ${primaryId} WHERE "ticketId" = ${secondaryId}`;
            await sql`UPDATE tickets SET "mergedIntoId" = ${primaryId}, status = 'CLOSED', "closeReason" = 'DUPLICATE' WHERE "ticketId" = ${secondaryId}`;
            await sql`UPDATE tickets SET "replyCount" = (SELECT COUNT(*) FROM replies WHERE "ticketId" = ${primaryId}) WHERE "ticketId" = ${primaryId}`;
            await logAudit(primaryId, "merge", ACTOR, ACTOR_TYPE, { primaryId, secondaryId }, { mergedFrom: secondaryId }, `Merged ${secondaryId}`);
            return { ok: true, primaryId, secondaryId };
          },
        }),
      },
    });

    const toolResults = result.steps.flatMap((step) =>
      (step.toolResults ?? []).map((tr) => ({ toolName: tr.toolName, args: tr.input, result: tr.output }))
    );

    return Response.json({ message: result.text, toolResults, usage: result.usage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Agent Error]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
