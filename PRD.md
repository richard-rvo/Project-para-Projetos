# Product Requirements Document (PRD)
## Projeta — Sistema de Gestão de Projetos

> **Versão**: 3.0 · **Atualizado**: agosto de 2026
> Histórico do redesign e estado por fase: [`docs/REDESIGN.md`](docs/REDESIGN.md)

---

## 1. Visão geral

O **Projeta** é uma aplicação web para gestão executiva de múltiplos projetos em ambientes industriais e corporativos. O objetivo é entregar o rigor de cronograma do Microsoft Project com a calma visual e a velocidade de uma ferramenta moderna.

Opera **100% no navegador (local-first)**: privacidade total, resposta imediata e funcionamento sem servidor ou internet.

---

## 2. Público-alvo

- Gerentes de projeto e engenheiros de planejamento e controle
- Coordenadores de equipes de campo e de escritório
- Inspetores e técnicos que registram anomalias em campo, pelo celular
- Diretores que precisam de visão consolidada de portfólio

---

## 3. Objetivos

- Planejar cronogramas com rigor real — dependências tipadas, calendário de trabalho e caminho crítico calculado, não aproximado
- Operar o Gantt inteiramente pelo teclado, sem tocar o mouse
- Escalar para milhares de tarefas sem degradar
- Registrar anomalias direto do celular, com fotos
- Gerar relatórios executivos em PDF sem dependências externas
- Manter os dados no dispositivo do usuário

---

## 4. Arquitetura de navegação

Dois níveis, com **no máximo duas barras de chrome** entre o topo da janela e o conteúdo.

### Nível 0 — Trilho global (`AppRail`, 64px)

Ícones sempre visíveis; expande para 232px ao passar o mouse, **sobrepondo** o conteúdo em vez de empurrá-lo. Pode ser fixado.

| Item | Conteúdo |
|---|---|
| **Portfólio** | Todos os projetos em Cards, Tabela ou Timeline |
| **Anomalias** | Central global de todos os projetos |
| **Relatórios** | Geração e impressão |
| **Configurações** | Aparência, backup, dados |

Também carrega os controles de tema, densidade e fixação.

### Nível 1 — Barra de contexto (`TopBar`, 52px)

Uma linha só: `[← ] [Projeto ⌄] [Visão Geral · Gantt · Quadro · Curva S · Tarefas · Anomalias] [busca ⌘K] [notificações]`

### Nível 2 — Barra da view (`ViewBar`, 44px)

Ações da view ativa. **Regra de divisão:** o TopBar diz *onde você está*; a ViewBar diz *o que dá para fazer aqui*. Nenhuma das duas repete o título da outra.

### Nível 3 — Inspector (drawer 380px)

O **único** caminho de edição de detalhe de tarefa. A edição inline nas células cobre as colunas da grade; o Inspector cobre o resto.

---

## 5. Funcionalidades

### 5.1 Portfólio

Funde o antigo Dashboard com a lista de Projetos. Faixa de métricas (projetos, em andamento, progresso médio, vencendo em 7 dias, atrasadas, anomalias abertas) e três modos:

- **Cards** — saúde, progresso com marca do planejado, status, período
- **Tabela** — comparação linha a linha
- **Timeline** — mini-Gantt de todos os projetos lado a lado, revelando sobreposição e concentração de trabalho

### 5.2 Gantt

O bloco estratégico do produto. Um **único scroller** para os dois eixos: o cabeçalho gruda no topo e a planilha à esquerda, sem sincronização em JS.

**Estrutura e visual**
- Seleção atravessando planilha e timeline na mesma linha (sem realce de hover: o ponteiro cruza dezenas de linhas a caminho da barra que interessa)
- Tarefas-resumo como colchete, colapsáveis
- Progresso como faixa interna mais escura; rótulo sai da barra quando não cabe
- Marcos em losango, linha e pílula "Hoje", fins de semana e feriados sombreados
- Baseline com desvio, folga como barra fantasma

**Interação**
- Teclado completo: setas navegam, `F2`/`Enter` edita, `Tab`/`Shift+Tab` indenta, `Del` remove
- Arrastar barras, redimensionar, arrastar o progresso pela alça. O arrasto anda em
  **tempo útil**: nenhuma barra para em fim de semana, feriado ou fora do turno
- Predecessora se define pela coluna **Pred.** (`2FS+3`, notação do MS Project) ou pelo
  Inspetor. Não existe ligação por arrasto na barra — ela custava dois alvos de clique de
  11px em cada barra e disputava o gesto de mover, que é o que se faz o tempo todo
- Desfazer/refazer (`⌘Z` / `⇧⌘Z`) em toda edição de tarefa, válido em qualquer tela
- Menu de contexto, copiar/colar/duplicar
- Seleção simples e múltipla

**Rigor de cronograma**
- **Instantes, não datas**: início e término carregam hora (`13/08/26 08:00`). O término é o
  instante em que o trabalho para, e a parte-data dele continua sendo o último dia inclusivo
- **Biblioteca de calendários por projeto**, atribuível por tarefa — as *base calendars* do
  MS Project. Cada calendário tem dias úteis, **jornada** (turnos, com intervalo) e feriados.
  Uma tarefa que termina sexta 17:00 libera a sucessora segunda 08:00; uma tarefa num
  calendário 24 Horas libera a sucessora no mesmo instante
- **Modo de agendamento por tarefa**: *automática* segue as predecessoras; *manual* fica
  onde o planejador fixou e não é movida — as setas continuam desenhadas e o Gantt avisa
  quando a data fixada desrespeita a dependência, mas não corrige
- Dependências **FS, SS, FF, SF** com defasagem em dias úteis do calendário da sucessora
- **CPM completo**: forward pass (ES/EF), backward pass (LS/LF), folga total e folga livre —
  tudo em minutos úteis, no calendário de cada tarefa
- **Rollup de tarefa-resumo na regra do MS Project**: `%Concluída = Σ(Duração Real) / Σ(Duração)`,
  com duração em tempo útil do calendário de cada filho. Marco (duração zero) não carrega peso —
  concluí-lo não move a porcentagem do pai. A duração do resumo é o **vão** início→término, não
  a soma dos filhos
- Duração em minutos úteis, exibida em dias e digitável como `3d`, `4h` ou `90m`.
  "3 dias" são 24h no calendário Padrão e 72h no 24 Horas
- Restrição "não iniciar antes de"
- Detecção de dependência circular

**Escala**
- Virtualização de linhas, setas e marcações — 1.000 tarefas a 60 FPS
- Zoom contínuo, "ajustar ao projeto" e ⌘+scroll ancorado no cursor
- Minimapa com janela arrastável
- Filtros (texto, status, críticas, atrasadas) e agrupamento
- Colunas redimensionáveis, persistidas por projeto

### 5.3 Visão geral do projeto

Faixa de métricas e grade de 12 colunas. A coluna larga mostra a **forma** do cronograma — janela de 30 dias e Curva S. A estreita mostra o que exige atenção: próximas entregas, marcos, anomalias, período.

### 5.4 Quadro

Uma coluna por status, com contador. Arrastar entre colunas altera o status; soltar em "Concluída" marca 100%.

### 5.5 Tabela de tarefas

Usa as **mesmas definições de coluna do Gantt**. Ordenação por qualquer coluna, filtros por status, seleção múltipla e ações em massa.

### 5.6 Curva S

Planejado vs realizado ponderado por duração. A **área entre as curvas** é tingida pelo sinal do desvio. Seletor de período e export CSV.

O cálculo vive em `utils/scurve.js` e é o mesmo consumido pela Visão Geral e pelo relatório impresso.

### 5.7 Anomalias

Split view: lista densa à esquerda, detalhe à direita. Mesma interface na central global e na tela do projeto.

Registro em 4 passos, pensado para o celular em campo: identificação, detalhes industriais (OS, equipamento, local, disciplina, causa raiz, ação corretiva), fotos e revisão. Câmera nativa, compressão automática para ~300 KB, até 5 fotos. Status: aberta → em análise → resolvida → cancelada.

### 5.8 Relatórios

Pré-visualização A4 real — folha branca com sombra sobre mesa recuada. Status executivo (KPIs, Curva S, cronograma, anomalias) ou registro de anomalias com fotos. Impressão via `window.print()`.

### 5.9 Persistência

IndexedDB **versão 4**, stores `projects`, `tasks`, `anomalies`.

- Datas são **instantes** `'YYYY-MM-DDTHH:mm'`, local-ingênuos: string ordenável, sem fuso
- `task.dependsOn` é uma lista de `{ id, type, lag }`
- `task.scheduleMode` é `'auto' | 'manual'`; ausente significa automática
- `task.calendarId` aponta um calendário da biblioteca; vazio herda o padrão do projeto
- `project.calendars` é a biblioteca `[{ id, name, workdays, shifts, holidays }]`, com
  `project.defaultCalendarId`
- Migração v2→v3 converte `dependsOn` e v3→v4 converte datas e calendário. As duas
  **preservam o original** (`dependsOnLegacy`, `datesLegacy`, `calendarLegacy`), e nenhuma data
  anda: o dia é o mesmo, ganhando a abertura no início e o fechamento no término
- Backup JSON exporta tudo menos fotos; a importação aceita v2, v3 e v4, passando pelas mesmas
  funções de migração — backup antigo não segue caminho diferente de banco antigo

---

## 6. Requisitos não funcionais

### 6.1 Stack

- **Core**: React 18 (hooks, Context API)
- **Build**: Vite 5
- **Estilo**: **Tailwind CSS v4** com design tokens em `@theme`, mais CSS semântico para o miolo do Gantt
- **Componentes**: **shadcn/ui** sobre primitivos Radix (Dialog, Popover, DropdownMenu, ContextMenu, Command, Select, Tooltip, Sonner)
- **Banco**: IndexedDB via `idb`
- **Ícones**: Lucide

> **Nota de arquitetura.** As versões anteriores exigiam "CSS vanilla puro, nenhum framework". A decisão foi revista: o app usa Tailwind e shadcn, **exceto** a grade e a timeline do Gantt, que ficam em CSS semântico com variáveis vindas dos mesmos tokens. Classe utilitária por célula numa grade virtualizada custa caro, e a densidade do Gantt precisa de controle direto.

### 6.2 Design system

Ver [`DESIGN.md`](DESIGN.md). Em resumo: superfícies neutras, cor reservada para estado de cronograma, marca como acento raro, densidade adaptativa, tipografia SF-first.

### 6.3 Performance

- Gantt virtualizado: **1.000 tarefas a 60 FPS** (medido)
- Fundo da timeline desenhado com gradientes, não com um elemento por dia
- Arrasto sem re-render: escrita imperativa durante o gesto
- Fotos comprimidas antes de gravar

### 6.4 Acessibilidade

- Anel de foco visível em todo controle
- Overlays sobre Radix: foco preso, `Escape` fecha, papéis ARIA corretos
- `prefers-reduced-motion` respeitado
- Gantt operável só pelo teclado

---

## 7. Roadmap

| Prioridade | Item |
|---|---|
| 🔴 Alta | Ordenação de colunas no Gantt (exige decidir como conviver com a ordem manual e a hierarquia) |
| 🔴 Alta | Presets de view (exige definir o que um preset guarda) |
| 🟡 Média | Nivelamento de recursos e detecção de sobrealocação |
| 🟡 Média | Importação em lote de tarefas via CSV/Excel |
| 🟡 Média | PWA com service worker para uso offline instalado |
| 🟢 Baixa | EVM — variância de custo e prazo |
| 🟢 Baixa | Múltiplas linhas de base por projeto |
| 🟢 Baixa | Multi-usuário com sincronização opcional |

### Entregue nas versões anteriores do roadmap

Dependências FS/SS/FF/SF · Exportação para Excel · Filtros avançados no Gantt · Calendário de feriados no auto-agendamento
