# Inbox Triage                                                       Gabriel Dobrowolski Jorge 

Ferramenta de triagem de suporte para líderes de equipe em SaaS B2B. Desenvolvida como case técnico, o objetivo era transformar uma inbox de ~8.000 tickets numa fila inteligente — onde o agente mais crítico aparece no topo, não o que chegou primeiro.

**Demo:** https://inbox-triage-5r46ig1la-gjorge07s-projects.vercel.app


## Regras de triagem

Essa foi a parte que mais pensei no projeto. O desafio real não é listar tickets — é destacar os que precisam de ação agora, antes que virem um problema maior.

Cada ticket recebe automaticamente um **risk score de 0 a 100** e pode acumular até **11 flags de triagem**. Explico cada uma abaixo.

### Por que um score numérico?

Status e prioridade sozinhos não bastam. Um cliente ENT que abriu um ticket com prioridade LOW e escreveu "estou pensando em cancelar" é muito mais urgente do que um SMB que marcou URGENT porque não encontrou um botão. O score combina vários sinais para refletir o risco real ao negócio.

A lógica de pesos foi intencional:

| Fator | Peso | Motivo |
|---|---|---|
| Segmento ENT | +20 | Exposição de receita alta |
| Plano Enterprise | +20 | Valor contratual alto |
| Churn signal no texto | +35 | Maior risco financeiro imediato |
| Urgência oculta no texto | +20 | Sistema fora ou perda de dados real |
| Sem resposta há 48h+ | +20 | Abandono comprovado |
| Prioridade URGENT (com evidência) | +8 | Peso baixo intencionalmente — cliente sobre/sub-reporta |

A prioridade auto-declarada pelo cliente tem peso reduzido de propósito. O texto da mensagem e o contexto são sinais mais confiáveis.

### As 11 flags

**1. Risco de Churn (`churn_signal`)**
Detecta linguagem de saída no texto: "quero cancelar", "pensando em trocar", "vou embora", "refund", etc. Vale mais no score do que qualquer outra flag porque churn silencioso é a maior ameaça de receita — o cliente raramente abre um ticket diizendo que vai embora.

**2. SLA Enterprise (`ent_sla_breach`)**
Clientes ENT sem resposta do agente há mais de 4 horas. ENT tem SLA contratual, então isso é uma violação objetiva, não uma estimativa.

**3. Urgente Atrasado (`urgent_overdue`)**
Ticket marcado como URGENT pelo cliente e sem resposta há mais de 4 horas. Combina a declaração do cliente com o tempo real sem atendimento.

**4. Urgência Oculta (`hidden_urgency`)**
Esse foi um dos mais importantes. Detecta quando o cliente marcou prioridade LOW ou MEDIUM, mas o texto descreve uma situação crítica: sistema fora do ar, perda de dados, sem acesso, produção parada. O cliente simplesmente não prestou atenção ao campo de prioridade — o problema é real mesmo assim.

**5. Urgência Não Confirmada (`unverified_urgent`)**
O oposto: cliente marcou URGENT, mas o texto não tem nenhuma evidência objetiva. Nem churn, nem sistema fora, nem é ENT. Não quer dizer que não é urgente — quer dizer que o agente deve revisar antes de sair escalando.

**6. Cliente Repetido (`repeat_distress`)**
Cliente com 3 ou mais tickets abertos simultaneamente. Esse sinal indica uma conta em sofrimento, independente do assunto de cada ticket.

**7. Parado (`stale_new`)**
Ticket em status NEW há mais de 48 horas. Caiu entre as rachaduras — ninguém triou, ninguém atribuiu.

**8. Travado (`high_reply_no_resolution`)**
5 ou mais respostas trocadas sem o ticket ser resolvido. A conversa está rodando em círculos.

**9. Sem Resposta (`no_response`)**
Nenhuma resposta do agente ainda. Diferente do SLA ENT, essa flag cobre qualquer segmento.

**10. Enterprise (`enterprise_plan`)**
Plano Enterprise. Flag informativa para garantir visibilidade imediata do nível do cliente.

**11. Ligou (`phone_callback`)**
Cliente abriu o ticket pelo canal PHONE_CALLBACK. Alto esforço por parte do cliente — quem liga está mais frustrado do que quem manda um email ou um whatsapp.

## Decisões de design

### A lista de tickets

**Por que o score aparece como número à esquerda?**
É a âncora visual. O olho vai direto para o número antes de ler o nome do cliente. Vermelho/laranja/amarelo/verde deixa claro em menos de 1 segundo qual é a faixa de risco sem precisar ler nada.

**Por que tickets com score ≥ 80 têm fundo vermelho?**
Para que o líder de suporte consiga escanear a lista e identificar os casos críticos sem precisar ler cada linha. O fundo vermelho é um sinal visual passivo — não precisa clicar em nada para saber que aquele ticket precisa de atenção.

**Por que as flags são pontos discretos na lista (não blocos coloridos)?**
Numa inbox com centenas de tickets, blocos coloridos competem entre si e viram poluição visual. Pontos com texto são mais fáceis de ler em quantidade. Os blocos coloridos aparecem no detalhe do ticket, onde há espaço para respirar.

### Os filtros

O filtro padrão ordena por **risk score decrescente**. O ticket mais crítico fica no topo sempre, independente de quando chegou.

O painel de filtros fica colapsado por padrão para não poluir. Quando o líder precisar, ele abre — mas o fluxo normal é só rolar e agir.

Os botões de atalho no topo ("críticos" e "churn") foram criados para o fluxo de triagem matinal: o líder abre o sistema, vê os números, clica no que precisa de atenção imediata.

### A máquina de estados

Defini transições válidas entre status e o sistema rejeita as inválidas. Isso evita erros como marcar um ticket NEW como RESOLVED sem passar por nenhuma triagem, ou tentar mover um CLOSED de volta para IN_PROGRESS sem antes reabrir.

### O audit log

Toda ação — feita pelo humano ou pela IA — é registrada com timestamp, ator e o que mudou (antes → depois). Isso é importante pela rastreabilidade (quem fez o quê e quando) e confiança na IA (o líder pode auditar o que o agente fez). Há logos de diferenciação para sabermos quando a IA ou o agente mexeu.

---

## O agente de IA

O agente usa Claude Sonnet com **tool use** — ele não só responde perguntas, ele consegue agir diretamente na inbox. São 13 ferramentas:

| Tool | Tipo | O que faz |
|---|---|---|
| `searchTickets` | Leitura | Busca e filtra tickets com qualquer combinação de campos |
| `getTicket` | Leitura | Busca metadados de um ticket específico |
| `getInboxStats` | Leitura | Estatísticas gerais: abertos, churn, sem resposta, carga por agente |
| `getChurnSignals` | Leitura | Lista todos os tickets com sinal de churn ativos, por risco |
| `updateTicketStatus` | Escrita | Muda o status de um ticket. Exige confirmação para CLOSED/RESOLVED |
| `classifyTicket` | Escrita | Define categoria e/ou prioridade |
| `assignTicket` | Escrita | Atribui ou reatribui a um agente |
| `escalateTicket` | Escrita | Escala para ESCALATED com motivo |
| `draftReply` | Escrita | Gera rascunho de resposta personalizado com o tom certo para o segmento do cliente. Sempre retorna preview — nunca envia automaticamente |
| `bulkUpdateStatus` | Escrita em lote | Muda status de múltiplos tickets. Exige preview + confirmação |
| `bulkAssign` | Escrita em lote | Atribui múltiplos tickets a um agente. Exige preview + confirmação |
| `bulkEscalate` | Escrita em lote | Escala múltiplos tickets. Exige preview + confirmação |
| `mergeTickets` | Escrita | Mescla dois tickets (irreversível). Exige preview + confirmação |

**Human-in-the-loop:** todas as ações destrutivas ou em lote mostram um preview com o que será feito antes de executar. O agente nunca fecha, resolve, muda status em lote ou envia resposta sem confirmação explícita do líder.

O `draftReply` usa uma segunda chamada ao Claude com o corpo real do ticket, o histórico de conversa e o contexto do cliente (segmento, plano, tickets abertos). O tom muda automaticamente: formal para ENT, semi-formal para MID, direto para SMB.

## Dashboard

Além da inbox, há um dashboard com:

- **6 KPIs** no topo: abertos, churn signals, sem resposta, tempo mediano de 1ª resposta, abertos hoje, agentes ativos
- **Volume por dia** (90 dias) em gráfico de área
- **Distribuição por status** em pizza
- **Distribuição de risco** em barras de progresso (crítico / alto / médio / baixo)
- **Backlog por segmento** (ENT / MID / SMB)
- **Mix de categorias**
- **Top agentes** com barra de carga e indicador de sobrecarga
- **Top clientes** com mais tickets abertos
- **Balanceador de carga:** ferramenta para redistribuir tickets NEW do agente mais sobrecarregado para outro, diretamente pelo dashboard

## Modo Triagem

Botão "Triar (N)" no topo da inbox abre uma fila de triagem rápida com os N tickets em status NEW, ordenados por risk score. Para cada ticket, o líder pode classificar, atribuir, escalar ou pular — tudo com um clique, sem precisar abrir cada ticket individualmente.

## Bônus implementados

- **Risk score 0-100** com algoritmo de pesos explicado acima
- **Morning Briefing:** banner que aparece ao abrir o sistema mostrando o que aconteceu desde a última vez (tickets novos, ENT sem resposta, churn ativos, urgentes atrasados). Na segunda-feira retroage até sexta às 18h para cobrir o fim de semana.
- **Modo Triagem** para processar fila NEW rapidamente
- **Balanceador de carga** entre agentes no dashboard

## Bônus não implementados

**Auto-sugestão de categoria:** seria interessante o sistema sugerir a categoria automaticamente quando um ticket entra como NEW, com aceite/rejeição em 1 clique. Não implementei porque preferi garantir que as 11 flags e o score estivessem bem calibrados primeiro — sugestão automática ruim seria pior do que não ter.

**Playbooks:** workflows salvos do agente (ex: "triagem da segunda de manhã: pegar todos os tickets ENT sem resposta e escalá-los"). A estrutura de tools do agente já suportaria isso, mas o tempo não foi suficiente para construir uma UI de criação de playbooks.

**Autenticação:** o sistema não tem login. Seria interessante também, mas novamente o tempo nao foi suficiente para essa construção.

## Stack

- **Next.js 16** (App Router)
- **PostgreSQL** via Neon (serverless)
- **Anthropic API** — Claude Sonnet 4.5 com tool use
- **Tailwind CSS v4**
- **Recharts** para os gráficos
- **TypeScript**