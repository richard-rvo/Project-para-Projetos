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
| 7 | Gantt · Onda D — escala | ✅ Concluída |
| 8 | Views restantes | ✅ Concluída |
| 9 | Documentação | ✅ Concluída |

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

## ✅ Fase 7 — Gantt · Onda D (escala)

**Critério atingido:** 1.000 tarefas a **60 FPS**, 29 linhas no DOM em vez de 1.000, 1.424 nós no canvas contra ~30.000, e 40 eventos de arrasto processados em 1ms.

- Virtualização de linhas por spacers (não `transform`, que criaria um bloco de contenção e perturbaria o `sticky` da planilha), com corte de setas de dependência e de ticks fora da janela
- Zoom contínuo: a granularidade do eixo decorre da largura do dia, não de presets. "Ajustar" encaixou 17.716px de timeline em 1.536px de viewport; ⌘+scroll mantém sob o cursor o mesmo dia
- Filtros (texto, status, só críticas, só atrasadas) e agrupamento por status/grupo/recursos
- Minimapa com janela arrastável, que se esconde quando tudo já cabe na tela
- Colunas redimensionáveis, persistidas **por projeto**

**Bugs corrigidos:** o fallback da virtualização renderizava TODAS as linhas antes de o scroller ser medido, travando a thread no primeiro paint — exatamente o que a virtualização existe para evitar; e uma colisão de nomes (o `const from` do corte contra o `const from` das bordas, no mesmo bloco) criava um *temporal dead zone* que derrubava a camada de dependências inteira.

**Deixado de fora, de propósito:**
- *Ordenação por coluna* — em um Gantt a ordem das linhas **é** o plano, definida por arrasto e por hierarquia. Ordenar por outra chave briga com as duas, e resolver esse conflito é uma decisão de produto, não de implementação.
- *Presets de view* — depende de definir o que um preset guarda (colunas? filtros? zoom? densidade?), e essa escolha ainda não foi feita.

## ✅ Fase 8 — Views restantes

As seis telas que ainda usavam o CSS legado foram reescritas. **O `legacy.css` foi deletado**: das 315 classes que ele definia, 295 já estavam mortas e as 20 restantes pertenciam a cinco componentes pequenos, migrados aqui. O monolito de 3.492 linhas com que este redesign começou não existe mais.

| View | O que mudou |
|---|---|
| Curva S | ~240 linhas de SVG à mão viraram `<CurveChart>` — o mesmo componente da Visão Geral e do relatório. Ganhou seletor de período e export CSV. |
| Tabela | Consome as MESMAS colunas do Gantt (`ganttConfig.COLUMNS`). Antes cada tela tinha a sua lista: uma mostrava "Responsável", a outra "Recursos", e nenhuma mostrava o que a outra mostrava. Ordenação, filtros e ações em massa. |
| Quadro | Colunas com contador, arrastar entre status, cards compactos com prazo e atraso. Mover para "Concluída" marca 100% — um card concluído com 40% é uma contradição. |
| Anomalias | Split view (lista densa + detalhe) num `AnomalyBoard` compartilhado pela central global e pela tela do projeto — eram duas telas com código quase igual. Formulário de 4 passos extraído para componente próprio. |
| Relatórios | Pré-visualização A4 real: folha branca com sombra sobre mesa recuada. O que está na tela é o que sai na impressora. |
| Configurações | Duas colunas estilo Ajustes do macOS, com "Apagar tudo" isolado numa zona de risco em vez de lado a lado com "Tema". |

**Bug corrigido:** o `@media print` nomeava `.app-sidebar`, `.app-header` e `.page-container` — todos removidos na Fase 1. A regra deixara de casar com qualquer coisa, e **imprimir saía com o trilho e a barra superior na folha**. O novo `styles/print.css` esconde tudo e revela apenas a folha, sem citar o shell, então nenhuma mudança futura de layout pode quebrá-lo de novo.

Também: `ConfirmDialog` e `Toast` reescritos sobre Radix e tokens; `Modal`, `Badge` e `ProgressBar` deletados por falta de uso.

## ✅ Fase 9 — Documentação

`PRD.md` e `DESIGN.md` reescritos. Os dois descreviam o app anterior ao redesign e já contradiziam o código:

- O PRD exigia **"CSS vanilla puro, nenhum framework externo"** — falso desde a Fase 0.
- O PRD descrevia a navegação em sidebar de dois níveis que a Fase 1 substituiu, e não registrava o Quadro (Kanban), que existia no código.
- O DESIGN descrevia o **drag-to-connect com linha elástica como se existisse** — o comportamento só passou a existir na Fase 3.
- Ambos listavam tokens, raios e cores que não são mais os do produto.

O `DESIGN.md` agora termina com **regras para código novo**, para que a próxima pessoa não reintroduza o que este redesign removeu: nada de cor literal, marca só nos quatro lugares permitidos, overlays sempre sobre Radix, uma instância de tooltip e não uma por linha.

---

## Resultado

| Medida | Antes | Depois |
|---|---|---|
| Chrome acima do conteúdo | ~330px em 5 barras | **96px em 2** |
| CSS monolítico | 3.492 linhas | **0** (deletado) |
| Caminhos de edição de tarefa | 4 | **1** |
| Scrollers do Gantt | 2, dessincronizados | **1** |
| Desvio planilha × barras | 2px por linha, acumulando | **0** |
| 1.000 tarefas | ~30.000 nós | **1.424 nós, 60 FPS** |
| CPM | meio (só late finish) | **forward + backward, com folga** |
| Cópias do cálculo da Curva S | 2 divergentes | **1** |
| Cópias dos helpers de data | 4 divergentes | **1** |

### Bugs de dados encontrados no caminho

Nenhum destes foi procurado — todos apareceram ao reescrever ou ao verificar:

1. **Corrupção silenciosa em tarefas-resumo** — tornar uma tarefa "pai" apagava as datas guardadas dela, e desindentá-la não as trazia de volta.
2. **Duração divergente** entre Gantt e Curva S: a mesma tarefa tinha durações diferentes conforme a tela.
3. **"Hoje" errado por 3 horas todo dia** em GMT-3, contaminando os filtros de "próximas" e "atrasadas".
4. **Desalinhamento acumulativo** de 2px por linha: na linha 20, a barra pertencia visualmente à tarefa errada.
5. **Impressão quebrada** desde a Fase 1: o `@media print` nomeava elementos do shell que deixaram de existir.
6. **Drawer que gravaria lixo** — escrevia em cinco campos que não existem no modelo.

---
## Verificação

Cada fase é verificada rodando o app de verdade com Puppeteer e dados semeados — não só `npm run build`. O padrão:

1. `npm run build` sem erro
2. Percorrer as rotas críticas: Portfólio → projeto → Gantt; criar tarefa → indentar → ligar dependência → mover predecessora
3. Alternar claro/escuro e Confortável/Compacto
4. Zero erros de console

Verificações específicas ficam registradas nas mensagens de commit de cada fase.
