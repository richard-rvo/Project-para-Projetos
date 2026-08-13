# Product Requirements Document (PRD)
## Projeta — Sistema de Gestão de Projetos

> **Versão**: 2.0 | **Última atualização**: Agosto 2026

---

### 1. Visão Geral do Produto

O **Projeta** é uma aplicação web voltada para a gestão executiva de múltiplos projetos e atividades em ambientes industriais e corporativos. Diferente de sistemas complexos de prateleira, ele oferece uma experiência simplificada, veloz e responsiva, inspirada no layout consagrado do Microsoft Project, combinada com os padrões de design de ferramentas modernas como Linear e Asana.

Opera **100% no navegador (Client-Side / Local-First)**, garantindo privacidade total dos dados, velocidade máxima de resposta e funcionamento sem dependência de servidor ou internet.

---

### 2. Público-Alvo

- Gerentes de Projeto (PMs) e Engenheiros de Planejamento e Controle
- Coordenadores de Equipes de campo e escritório
- Inspetores e técnicos que registram anomalias e não-conformidades em campo (via mobile)
- Diretores e Executivos que precisam de visão consolidada, acompanhamento rápido de metas e relatórios de status

---

### 3. Objetivos

- Fornecer uma interface intuitiva para o cadastro rápido e acompanhamento visual de tarefas.
- Permitir vinculações complexas (dependências) sem a necessidade de fluxogramas difíceis de ler.
- Gerar curvas S (Planejado vs Realizado) matematicamente precisas e ponderadas por peso de tarefa.
- Registrar anomalias e não-conformidades diretamente do celular, com câmera, fotos e campos industriais.
- Exportar relatórios executivos de status de projeto em formato PDF/impressão sem dependências externas.
- Operar 100% no navegador (Client-Side / Local-First) garantindo privacidade e velocidade absurda de resposta.

---

### 4. Arquitetura de Navegação (v2.0)

A navegação segue um modelo em **dois níveis** para separar visões globais de visões contextuais de projeto:

#### Nível 1 — Sidebar Global (sempre visível)
| Item | Descrição |
|------|-----------|
| **Dashboard** | KPIs macro de todos os projetos, saúde, próximas entregas |
| **Projetos** | Lista/grid de todos os projetos cadastrados |
| **Anomalias** | Central global de todas as anomalias de todos os projetos |
| **Relatórios** | Exportação de relatórios de status por projeto |
| **Configurações** | Backup, restauração e preferências |
| **Perfil** | Informações do usuário (rodapé da sidebar) |

#### Nível 2 — Workspace do Projeto (tabs contextuais)
Ao selecionar um projeto, o sistema abre o **Workspace** com tabs horizontais:

| Tab | Conteúdo |
|-----|----------|
| **Visão Geral** | KPIs do projeto, progresso vs planejado, próximas entregas, anomalias recentes |
| **Gantt** | Gráfico de Gantt interativo completo |
| **Curva S** | Curva S ponderada com tooltip interativo e linha "Hoje" |
| **Tarefas** | Lista tabular de tarefas com filtros, ordenação e paginação |
| **Anomalias** | Registro e gestão de anomalias do projeto |

> **Princípio de UX**: O menu lateral jamais muda. O contexto do projeto é mantido através de tabs horizontais na área de conteúdo — padrão usado por Linear, Jira, ClickUp e Notion.

---

### 5. Funcionalidades Principais (Core Features)

#### 5.1. Dashboard Executivo Global
- Grid de saúde de todos os projetos com indicador colorido (Verde/Amarelo/Vermelho) calculado por desvio de progresso.
- KPIs globais: total de projetos, em andamento, concluídos, tarefas vencendo na semana, anomalias abertas e críticas.
- Feed de próximas entregas (7 dias) e anomalias abertas consolidadas de todos os projetos.
- Clicar em um card de projeto abre diretamente seu Workspace.

#### 5.2. Painel de Múltiplos Projetos
- Criação, leitura, edição e exclusão de projetos.
- Cards executivos com progresso, saúde, contagem de tarefas, badges de status e datas.
- Indicador de saúde automático calculado com base no desvio entre progresso planejado e realizado.

#### 5.3. Gráfico de Gantt Interativo (Estilo MS Project)
- **Painel Duplo Resizing**: O usuário pode arrastar o divisor central para revelar mais da planilha ou mais da linha do tempo.
- **Planilha de Edição Rápida (Esquerda)**: Colunas indexadas (ID, Nome, Duração, Início, Término, Progresso, Predecessoras, Recursos). Edição via duplo-clique estilo Excel.
- **Linha do Tempo (Direita)**: Gráfico SVG desenhado dinamicamente com zoom Dia/Semana/Mês.
- **Drag & Drop**: Reordenação de tarefas, ajuste de datas e duração arrastando barras.
- **Caminho Crítico (CPM)**: Identificação visual das tarefas que impactam diretamente o término do projeto.
- **Baseline (Linha de Base)**: Snapshot das datas originais para comparação visual com o estado atual.
- **Marcos (Milestones)**: Tarefas do tipo diamante com renderização e dependências específicas.

#### 5.4. Sistema de Vínculos e Dependências
- Suporte a múltiplos predecessores por tarefa (ex: `1, 3`).
- Renderização visual de setas com rotas ortogonais inteligentes (Bezier suave estilo MS Project / Primavera P6).
- Proteção nativa contra dependências circulares.
- Motor de **Auto-Agendamento (Forward Pass)**: ao mover uma tarefa predecessora, todas as sucessoras são empurradas automaticamente em cascata.

#### 5.5. Motor da Curva S (Corrigido — v2.0)
- Geração autônoma baseada nas datas das tarefas do projeto selecionado.
- **Cálculo ponderado por duração**: tarefas mais longas têm peso proporcionalmente maior no progresso planejado e realizado. Corrige a distorção anterior onde uma tarefa de 1 dia valia o mesmo que uma de 30 dias.
- **Funções de data UTC-safe**: `daysBetween` e `addDays` usam sufixo `T00:00:00Z` e `setUTCDate` para evitar bugs de fuso horário (GMT-3) e horário de verão (DST).
- **Datas no eixo X**: usam `T12:00:00` para evitar rollback de dia em timezones negativos.
- **Amostragem inteligente**: máximo ~30 pontos por gráfico para evitar labels sobrepostos em projetos longos.
- **Linha "Hoje"**: referência vertical no gráfico indicando a data atual.
- **Tooltip interativo**: ao mover o mouse sobre o gráfico, exibe data, % planejado e % realizado no ponto mais próximo.

#### 5.6. Registro de Anomalias (Mobile-Friendly — v2.0)

Módulo de registro de não-conformidades e anomalias industriais, acessível dentro do workspace do projeto ou globalmente.

**Formulário em 4 steps** (otimizado para mobile):
1. **Identificação**: título, severidade (baixa/média/alta/crítica), tipo (segurança/qualidade/prazo/técnico/ambiental), responsável pelo registro, tarefa vinculada.
2. **Detalhes**: descrição, OS (Ordem de Serviço), equipamento/ativo, localização física, disciplina técnica, causa raiz, ação corretiva.
3. **Fotos**: câmera nativa via `<input capture="environment">`, compressão automática client-side para ≤ 300KB, máximo 5 fotos por anomalia.
4. **Revisar**: tela de confirmação com todos os dados antes de salvar.

**Funcionalidades adicionais:**
- FAB (botão flutuante) para registro rápido em telas mobile.
- Lightbox para visualização de fotos em tela cheia.
- Filtros por projeto, severidade, status e texto livre na Central Global.
- Status de resolução: Aberta → Em Análise → Resolvida → Cancelada.
- Badge de notificação no header e na tab mostrando contagem de anomalias abertas.

#### 5.7. Exportação de Relatórios de Status (v2.0)

Central de geração e exportação de relatórios executivos sem dependências externas (usa `window.print()` + CSS de impressão).

**Tipos de relatório:**
- **Relatório de Status Executivo**: cabeçalho com logo, KPIs (progresso real, planejado, desvio, tarefas, anomalias), mini Curva S em SVG, tabela completa de tarefas com status (linhas atrasadas em vermelho), resumo de anomalias.
- **Relatório de Anomalias**: listagem detalhada com todos os campos industriais e fotos (dimensionadas para impressão A4).

**Características do layout de impressão:**
- Sidebar, header e botões são ocultados automaticamente via `@media print`.
- Layout A4 otimizado com margens e page-break por seção.
- Footer com nome do software e timestamp de emissão.

#### 5.8. Visão Geral do Projeto (v2.0)
- Barra de metadados do projeto: datas de início/fim, status, descrição.
- KPIs contextuais: progresso real, desvio (adiantado/atrasado), tarefas concluídas, tarefas atrasadas, anomalias abertas.
- Barra de progresso com comparativo planejado vs realizado.
- Lista das próximas entregas (tarefas não concluídas ordenadas por deadline).
- Feed das anomalias mais recentes do projeto.
- Links rápidos para navegar para as tabs de Tarefas e Anomalias.

#### 5.9. Armazenamento e Persistência (v2.0)
- IndexedDB **versão 2** com três object stores: `projects`, `tasks`, `anomalies`.
- Índices otimizados: `by-project` em tasks e anomalias; `by-status` em anomalias.
- Fotos das anomalias armazenadas como base64 local (não saem do dispositivo).
- Backup JSON exporta projetos e tarefas (fotos não exportadas para manter arquivo compacto).
- Import restaura projetos, tarefas e dados de anomalias sem fotos.
- Tema persistido no `localStorage` (chave `projeta_theme`).

---

### 6. Requisitos Não Funcionais (NFRs)

#### 6.1. Stack Tecnológico
- **Core**: React 18+ (Hooks, Context API, JSX).
- **Build Tool**: Vite 5+.
- **Estilização**: CSS Vanilla puro (nenhum framework CSS externo). Design System centralizado em `index.css`.
- **Banco de Dados**: IndexedDB via biblioteca `idb` (Client-side, zero backend).
- **Ícones**: Lucide React.

#### 6.2. Design System & UI/UX
- Padrão **Glassmorphism**: `backdrop-filter: blur`, cartões com bordas suaves, sombras refinadas.
- Identidade visual **PROJETA**: gradiente vibrante do Laranja `#FE8345` ao Roxo `#B90973` em botões primários e destaques.
- Navegação **em dois níveis**: sidebar global + tabs contextuais por projeto (sem troca de página para visões de projeto).
- Breadcrumb dinâmico no header ao navegar dentro de um projeto.
- **Mobile-first** para o módulo de anomalias: formulário em sheet (bottom sheet em mobile, modal centralizado em desktop).
- Tema claro e escuro (`Dark Mode`), controlável pelo usuário via sidebar.
- Micro-interações com transições de `0.25s cubic-bezier`.
- `@media print` dedicado para relatórios com layout A4.

#### 6.3. Performance e Responsividade
- O Gantt não deve sofrer engasgos ao arrastar barras. Estados locais do React isolam re-renderizações da árvore principal.
- Gráficos SVG (Gantt e Curva S) escaláveis com Fluid Layout.
- Imagens de anomalias comprimidas client-side antes de salvar no IndexedDB (máx. 300KB por foto).
- Curva S com amostragem inteligente (máx. 30 pontos) para manter performance em projetos longos.

---

### 7. Roadmap — Próximas Versões (v3.0+)

| Prioridade | Funcionalidade |
|------------|---------------|
| 🔴 Alta | Tipos de dependência alternativos (FF, SS, SF) além do padrão FS |
| 🔴 Alta | Exportação para Excel (.xlsx) via SheetJS |
| 🟡 Média | Filtros avançados por responsável no Gantt |
| 🟡 Média | Notificações push para tarefas próximas ao vencimento |
| 🟡 Média | Modo offline completo com Service Worker (PWA) |
| 🟢 Baixa | Importação em lote de tarefas via CSV/Excel |
| 🟢 Baixa | Calendário de feriados e finais de semana no auto-agendamento |
| 🟢 Baixa | Relatório de variância de custo e prazo (EVM — Earned Value Management) |
| 🟢 Baixa | Multi-usuário com sincronização via backend opcional |
