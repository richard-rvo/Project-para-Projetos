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
- Hover atravessando planilha e timeline na mesma linha
- Tarefas-resumo como colchete, colapsáveis
- Progresso como faixa interna mais escura; rótulo sai da barra quando não cabe
- Marcos em losango, linha e pílula "Hoje", fins de semana e feriados sombreados
- Baseline com desvio, folga como barra fantasma

**Interação**
- Teclado completo: setas navegam, `F2`/`Enter` edita, `Tab`/`Shift+Tab` indenta, `Del` remove
- Arrastar barras, redimensionar, arrastar o progresso pela alça
- **Drag-to-connect**: ponto conector nas pontas, linha elástica, recusa ciclos e duplicatas
- Desfazer/refazer (`⌘Z` / `⇧⌘Z`) em toda edição de tarefa, válido em qualquer tela
- Menu de contexto, copiar/colar/duplicar
- Seleção simples e múltipla

**Rigor de cronograma**
- Dependências **FS, SS, FF, SF** com defasagem em dias úteis
- **Calendário de trabalho por projeto**: dias úteis e feriados. Uma tarefa que termina na sexta libera a sucessora na segunda
- **CPM completo**: forward pass (ES/EF), backward pass (LS/LF), folga total e folga livre
- Duração contada em **dias úteis**
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

IndexedDB **versão 3**, stores `projects`, `tasks`, `anomalies`.

- `task.dependsOn` é uma lista de `{ id, type, lag }`
- `project.calendar` guarda `{ workdays, holidays }`
- Migração v2→v3 converte o formato antigo e **preserva o original** em `dependsOnLegacy`
- Backup JSON exporta tudo menos fotos; a importação aceita backups v2 e v3

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
