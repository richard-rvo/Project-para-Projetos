# Redesign UX/UI — "Precision Calm"

> Documento vivo. Acompanha a reestruturação completa de UX/UI do Projeta.
> Branch: `redesign/precision-calm`

---

## Contexto

O app funcionava, mas a organização visual estava ruim por razões **estruturais**, não estéticas. O levantamento inicial encontrou:

- **5 camadas de chrome empilhadas** antes do conteúdo, consumindo ~330px de altura
- **Duplicação de navegação** — o mesmo contexto aparecia três vezes na tela
- **Dashboard e Projetos** eram a mesma tela com nomes diferentes
- **Nenhuma hierarquia visual** — `glass-card` em tudo, nada se destacava
- **4 caminhos de edição** da mesma tarefa
- **Gantt incompleto** — dois scrollers dessincronizados, sem teclado, sem virtualização, CPM pela metade

## Conceito

**Apple** (calma, hierarquia, material) × **MS Project** (densidade, rigor de cronograma) × **ClickUp** (velocidade, comando, views).

### Princípios

1. **Um chrome só** — uma barra de contexto por nível, nunca três empilhadas
2. **Cor é informação** — superfícies neutras; cor reservada para estado de cronograma
3. **Densidade adaptativa** — Confortável/Compacto via token
4. **O Gantt manda** — todo o resto cede altura para ele
5. **Teclado primeiro** — toda ação do Gantt alcançável sem mouse

### Decisões travadas

| Decisão | Escolha |
|---|---|
| Estratégia | Fundação → Gantt → resto |
| Marca | Base neutra; gradiente laranja→roxo só como acento raro |
| Stack | **Híbrido**: Tailwind v4 + shadcn no app; miolo do Gantt em CSS semântico com vars dos mesmos tokens |
| Escopo Gantt | Ondas A + B + C + D (completo) |

---

## Status das fases

| # | Fase | Status |
|---|---|---|
| 0 | Fundação técnica | ✅ Concluída |
| 1 | Shell de navegação | ✅ Concluída |
| 2 | Gantt · Onda A — estrutura e visual | ✅ Concluída |
| 3 | Gantt · Onda B — interação | ✅ Concluída |
| 4 | Inspector único | ✅ Concluída |
| 5 | Portfólio e Visão Geral | ✅ Concluída |
| 6 | Gantt · Onda C — rigor de cronograma | ✅ Concluída |
| 7 | Gantt · Onda D — escala | ⬜ Pendente |
| 8 | Views restantes | ⬜ Pendente |
| 9 | Documentação | ⬜ Pendente |

---

## ✅ Fase 0 — Fundação técnica

Tailwind v4 + shadcn/ui sobre primitivos Radix. `index.css` de 3.492 linhas quebrado em `tokens.css` + `base.css` + `legacy.css` + `views/gantt.css`.

`tokens.css`: superfícies 0–3, texto 1–3, hairlines, 8 estados de cronograma com variante *soft*, marca como acento, 4 elevações, raios 6/10/14, escala tipográfica SF-first, movimento, densidade e ponte shadcn.

**Bugs corrigidos:** duração divergente entre 4 cópias de helpers de data (Gantt contava inclusivo, o resto exclusivo — a Curva S discordava do cronograma); `today()` retornava data UTC, então em GMT-3 o app achava que já era amanhã das 21h à meia-noite; 4 CSS vars referenciadas e nunca definidas; cores de status hardcoded fora de token.

## ✅ Fase 1 — Shell de navegação

De 5 barras de chrome para **2** (52px + 44px = 96px, contra ~330px).

- `AppRail` 64px, expande em overlay no hover (não empurra o layout), fixável
- `TopBar` único substituindo header + breadcrumb + tab bar + `<h2>` da página
- `ViewBar` 44px com peças reutilizáveis
- `PagePortfolio` funde Dashboard + Projetos
- Command Palette sobre cmdk

**Bugs corrigidos:** desalinhamento de 2px por linha entre planilha e barras do Gantt (na linha 20 a barra alinhava com a tarefa errada); `legacy.css` fora de `@layer`, então seus seletores de elemento venciam todo utilitário Tailwind; `tailwind-merge` descartando tokens de tipografia por confundi-los com cor.

## ✅ Fase 2 — Gantt · Onda A

`PageGantt` de 1.230 linhas → `src/views/gantt/` com 8 módulos.

**Defeito estrutural resolvido:** existiam **dois scrollers verticais independentes**. Agora há **um scroller para os dois eixos**, com cabeçalho `sticky top` e planilha `sticky left` — sem uma linha de JS de sincronização.

Verificado com 300 tarefas: desvio 0 em todas as linhas, sticky segurando nos dois eixos após scroll profundo.

Também: hover atravessando as duas metades, colchete de resumo, progresso como faixa interna, rótulo fora da barra quando não cabe, pílula "Hoje", tooltip próprio, fim de semana por gradiente (365 nós de DOM → zero).

## ✅ Fase 3 — Gantt · Onda B

Teclado completo, drag-to-connect com linha elástica, undo/redo, menu de contexto, clipboard, alça de progresso.

**Bug de corrupção de dados (anterior à reescrita):** o rollup de tarefa-resumo escrevia datas calculadas **direto nos campos** do objeto, e toda edição partia dali. Tornar uma tarefa "pai" apagava silenciosamente as datas guardadas dela. Corrigido com campo `rollup` separado + barreira `stripComputed()` em toda escrita.

Também: updater impuro que o StrictMode executava duas vezes; teclado morto porque clicar num `div` não move o foco.

## ✅ Fase 4 — Inspector único

Eram **quatro** caminhos de edição — a lista de tarefas tinha "Editar Modal" ao lado de "Inspecionar".

O drawer não estava só desconectado, estava **errado**: gravava em `predecessors`, `resource`, `duration`, `isMilestone` e status em snake_case, campos que não existem no modelo. Reescrito sobre o schema real.

**Bug:** `⌘Z` parava de funcionar com o Inspector aberto — undo estava preso ao teclado do Gantt. Movido para `useGlobalShortcuts` no nível do app.

## ✅ Fase 5 — Portfólio e Visão Geral

Timeline de portfólio (todos os projetos lado a lado) e Visão Geral em grade de 12 colunas.

Peças compartilhadas para não duplicar: `MiniTimeline`, `CurveChart`, `utils/scurve.js`.

**Duplicação eliminada:** o cálculo da Curva S existia em `PageSCurve` e `PageReports` como cópias quase idênticas — o mesmo projeto podia render curvas diferentes na tela e no relatório.

**Bugs:** `useMemo` chamado após returns condicionais (violação das regras de hooks); `GanttChartSquare` usado sem import.

## ✅ Fase 6 — Gantt · Onda C

**Migração IndexedDB v2 → v3.** `dependsOn` de CSV para `[{ id, type, lag }]`; projetos ganham calendário de trabalho. O CSV original é preservado em `dependsOnLegacy`.

- `utils/calendar.js` — dias úteis, feriados, duração em dias úteis
- `utils/dependencies.js` — FS/SS/FF/SF com lag, lê os dois formatos, detecta ciclos
- `utils/cpm.js` — forward + backward pass reais, folga total e livre

Conferido contra rede calculada à mão: ES/EF/LS/LF exatos, caminho crítico correto, sexta→segunda, lag e feriado.

> ⚠️ **Mudança de semântica:** duração agora conta **dias úteis**. Nenhuma data foi reescrita; o que mudou é a contagem. Uma tarefa que mostrava "16d" mostra "12d" para o mesmo intervalo.

---

## ⬜ Fase 7 — Gantt · Onda D (escala)

- Virtualização de linhas e da timeline por chunks
- "Fit to project", ⌘+scroll para zoom, minimapa
- Filtros, agrupamento (responsável, grupo, status) e ordenação — reusando a engine de colunas
- Colunas redimensionáveis e reordenáveis, persistidas por projeto

**Pronto quando:** 1.000 tarefas rolam a 60fps e o drag de barra não engasga.

## ⬜ Fase 8 — Views restantes

| View | Mudança |
|---|---|
| Tabela | Mesma engine de colunas do Gantt; agrupamento, filtro salvo, edição inline |
| Quadro | Colunas com contador, cards compactos, WIP visual |
| Curva S | Eixos limpos, área tingida por desvio, tooltip ancorado, seletor de período |
| Anomalias | Split view: lista densa + detalhe; bottom sheet no mobile |
| Relatórios | Preview A4 real; também acessível de dentro do projeto |
| Configurações | Duas colunas estilo Ajustes do macOS |

## ⬜ Fase 9 — Documentação

Atualizar `PRD.md` e `DESIGN.md`: novo stack (o PRD ainda exige "CSS vanilla puro"), nova arquitetura de navegação, tokens novos, remover do DESIGN o que descreve funcionalidade inexistente, registrar o Kanban.

---

## Verificação

Cada fase é verificada rodando o app de verdade com Puppeteer e dados semeados — não só `npm run build`. O padrão:

1. `npm run build` sem erro
2. Percorrer as rotas críticas: Portfólio → projeto → Gantt; criar tarefa → indentar → ligar dependência → mover predecessora
3. Alternar claro/escuro e Confortável/Compacto
4. Zero erros de console

Verificações específicas ficam registradas nas mensagens de commit de cada fase.
