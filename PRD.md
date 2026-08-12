# Product Requirements Document (PRD)
## Gantt Dinâmico

### 1. Visão Geral do Produto
O **Gantt Dinâmico** é uma aplicação web voltada para a gestão executiva de múltiplos projetos e atividades. Diferente de sistemas complexos de prateleira, ele oferece uma experiência simplificada, veloz e responsiva, inspirada no layout consagrado do Microsoft Project, combinada com os padrões de design de ferramentas modernas como Linear e Asana.

### 2. Público-Alvo
- Gerentes de Projeto (PMs)
- Engenheiros de Planejamento e Controle
- Coordenadores de Equipes
- Diretores e Executivos que precisam de visão consolidada e acompanhamento rápido de metas e desvios.

### 3. Objetivos
- Fornecer uma interface intuitiva para o cadastro rápido e acompanhamento visual de tarefas.
- Permitir vinculações complexas (dependências) sem a necessidade de fluxogramas difíceis de ler.
- Gerar curvas S (Planejado vs Realizado) matematicamente precisas de forma automática.
- Operar 100% no navegador (Client-Side / Local-First) garantindo privacidade e velocidade absurda de resposta.

---

### 4. Funcionalidades Principais (Core Features)

#### 4.1. Painel de Múltiplos Projetos
- Criação, leitura, edição e exclusão de projetos.
- Resumo executivo em cartões contendo quantidade de tarefas e progresso total.
- Barra lateral (Sidebar) expansível para navegação entre as visões do sistema.

#### 4.2. Gráfico de Gantt Interativo (Estilo MS Project)
- **Painel Duplo Resizing**: O usuário pode arrastar o divisor central para revelar mais da planilha ou mais da linha do tempo.
- **Planilha de Edição Rápida (Esquerda)**: Colunas indexadas (ID, Nome, Duração, Início, Término, Progresso e Predecessoras). A edição é ativada via duplo-clique, substituindo a célula por um input, assim como no Excel.
- **Linha do Tempo (Direita)**: Gráfico desenhado dinamicamente.
- **Manipulação Drag & Drop**:
  - Reordenação das tarefas na tabela arrastando o ícone correspondente.
  - Ajuste de data de início/fim arrastando o corpo da barra de progresso.
  - Ajuste de duração arrastando a alça na extremidade direita da barra.

#### 4.3. Sistema de Vínculos e Dependências
- Suporte a múltiplos predecessores por tarefa (ex: `1, 3`).
- Renderização visual através de setas desenhadas com rotas ortogonais inteligentes, evitando sobreposições com os blocos de tarefas.
- Proteção nativa contra dependências circulares.

#### 4.4. Motor da Curva S
- Geração autônoma baseada nas datas das tarefas.
- **Linha Base (Planejado)**: Projeção de acúmulo de avanço desde a menor data do projeto até a maior.
- **Linha Real (Realizado)**: Acúmulo de progresso das tarefas baseado no percentual inserido pelo usuário (Limitado à data atual).
- Indicadores de desvio no rodapé calculando percentual adiantado ou atrasado em relação ao plano na data de Hoje.

#### 4.5. Motor de Auto-Agendamento (Auto-Scheduling)
- **Forward Pass (Efeito Dominó)**: Ao arrastar ou editar a data de uma tarefa predecessora, todas as suas tarefas sucessoras conectadas são empurradas para a frente automaticamente.
- Recalculo dinâmico recursivo operado pelo `updateTasksBatch` respeitando finais de semana (em iterações futuras) e limites de dependência.

#### 4.6. Armazenamento e Persistência
- Todo o armazenamento utiliza o padrão **IndexedDB** através da biblioteca local.
- Operações de leitura/escrita assíncronas para não bloquear a thread de UI durante a renderização do Gantt.
- Preservação da ordem arrastada das tarefas e estado do usuário (ex: Tema Claro/Escuro).

---

### 5. Requisitos Não Funcionais (NFRs)

#### 5.1. Stack Tecnológico
- **Core**: React 18+ (Hooks, Context, JSX).
- **Build Tool**: Vite.
- **Estilização**: CSS Modules / Arquivos CSS Vanilla isolados. Proibido uso de pesados frameworks CSS arbitrários como Bootstrap; foco na leveza e no Design System nativo (`style.css` e `index.css`).
- **Banco de Dados**: IndexedDB (Client-side, suportado via API nativa/idb).

#### 5.2. Design System & UI/UX
- Padrão **Glassmorphism**: Menus flutuantes, translucidez (`backdrop-filter: blur`), cartões com bordas suaves e sombras refinadas.
- Identidade visual **Clean White** com ações primárias e botões utilizando um gradiente vibrante (do Roxo Principal `#B90973` ao Laranja `#FE8345`).
- Interações customizadas sem o uso de caixas nativas (Modais `ConfirmDialog` no lugar de `window.confirm`).
- Tema nativo claro e escuro (`Dark Mode`), controlável pelo usuário.
- Micro-interações de estado (`:hover`, `:active`) com transições suaves de 0.2s.

#### 5.3. Performance e Responsividade
- O Gantt não deve sofrer engasgos ao arrastar barras. Alterações devem refletir com uso otimizado de estados locais no React para evitar re-renderizações da árvore inteira quando desnecessário.
- Gráficos (SVG) devem escalar e se ajustar ao tamanho da janela (Fluid Layout).

---

### 6. Planos de Expansão Futura (Roadmap)
- Filtros avançados por responsáveis (Atribuições).
- Tipos de dependências alternativas (Fim-para-Fim, Início-para-Início).
- Possibilidade de exportação de dados para Excel (.xlsx) e importação em lote.
- Identificação visual do "Caminho Crítico".
