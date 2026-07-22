# 🎨 Diretrizes e Sistema de Design (DESIGN.md)

Este documento especifica a arquitetura visual, tokens de design, princípios de UX (User Experience) e decisões estéticas utilizadas na construção do **Gantt Dinâmico - Painel de Controle de Projetos (GTP - COQUERIA)**.

---

## 💎 Princípios Fundamentais de Design

1. **Aparência Executiva Premium**: Cores saturadas com moderação, contrastes nítidos e bordas suavizadas (`border-radius: 18px` e `9999px`), transmitindo sofisticação executiva.
2. **Ergonomia e Redução de Cliques**: Atalhos por botões em formato de pílulas (*Bubbles*) para valores frequentes de data (`Hoje`, `Amanhã`, `+7d`) e progresso (`0%`, `25%`, `50%`, `75%`, `100%`).
3. **Sincronização Visual Dinâmica**: Resposta em tempo real para arrasto de tarefas, redimensionamento de coluna e conexões de dependência por linha elástica SVG.

---

## 🎨 Paleta de Cores e Tokens CSS

### 1. Cores de Superfície e Estrutura
| Token | Modo Claro (Light) | Modo Escuro (Dark) | Aplicação |
| :--- | :--- | :--- | :--- |
| `--bg-app` | `#f8fafc` | `#0b0f19` | Fundo principal da aplicação |
| `--bg-surface` | `#ffffff` | `#131b2e` | Cards de projetos, modais e barra superior |
| `--border-color` | `#e2e8f0` | `#1e293b` | Linhas divisórias e bordas |
| `--text-primary` | `#0f172a` | `#f8fafc` | Títulos e texto principal |
| `--text-secondary` | `#475569` | `#cbd5e1` | Subtítulos e rótulos de colunas |
| `--primary-accent` | `#ff4757` | `#ff4757` | Botões primários, destaques e linhas de dependência |
| `--today-line-color`| `#ff3b30` | `#ff3b30` | Linha indicadora do dia atual |

### 2. Temas Visuais por Projeto (Presets)
Cada projeto possui uma identidade visual única aplicada aos seus cards e barras de tarefas:
- **Laranja (`orange`)**: `#ff6b35` (Barra) | `#ffded4` (Fundo da Cápsula)
- **Coral (`coral`)**: `#ff4757` (Barra) | `#ffd8dc` (Fundo da Cápsula)
- **Pink (`pink`)**: `#e64980` (Barra) | `#fcc2d7` (Fundo da Cápsula)
- **Roxo (`purple`)**: `#ae3ec9` (Barra) | `#eebefa` (Fundo da Cápsula)
- **Verde Esmeralda (`emerald`)**: `#2f9e44` (Barra) | `#b2f2bb` (Fundo da Cápsula)
- **Azul Executivo (`blue`)**: `#1c7ed6` (Barra) | `#a5d8ff` (Fundo da Cápsula)

---

## 🔤 Tipografia e Hierarquia

**Fonte Principal**: `Plus Jakarta Sans` (Google Fonts)

- **Títulos de Cabeçalho**: `1.35rem` | Weight: `800` | Letter-spacing: `-0.02em`
- **Títulos de Projetos**: `0.95rem` | Weight: `800` | Text-transform: `uppercase`
- **Nomes de Atividades**: `0.875rem` | Weight: `600` | White-space: `nowrap` (sem quebra)
- **Datas e Badges**: `0.78rem` | Weight: `700`

---

## 🧩 Componentes Chave de Interface

### 1. Coluna de Tarefas e Splitter Handle (`#sidebarResizer`)
- Elemento divisor vertical de `8px` com efeito hover destacado (`rgba(255, 71, 87, 0.15)`).
- Cursor inteligente `col-resize`.
- Evita quebra de texto na coluna através das propriedades `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;`.

### 2. Ponto Conector de Dependências (`.link-connector-dot`)
- Ponto circular de `14px` branco com borda de `3px` na cor de acento do projeto.
- Surge dinamicamente no evento de `hover` sobre a extremidade direita de qualquer atividade ou Marco.
- Ao clicar, ativa o **Modo de Conexão** exibindo a linha guia SVG e o banner superior notificador.

### 3. Diamantes de Marco (Milestone Gems)
- Elemento de `22px x 22px` rotacionado em 45 graus.
- Gradiente linear com efeito de brilho (*glow*) e ponto central reflexivo de `8px`.
- Suporta arrasto por clique assim como as barras normais de tarefas.

### 4. Editor de Tarefas Estilo TickTick / Todoist
- **Campos em Pílula (*Meta Chips*)**: Projeto, Status, Dependência e Marco organizados horizontalmente.
- **Bubbles Selecionáveis**: Botões de progresso em pílula (`0%`, `25%`, `50%`, `75%`, `100%`) com transição de seleção ativada.
- **Transição Suave**: Sombras `0 12px 32px -4px rgba(15, 23, 42, 0.12)` e bordas arredondadas de `20px`.

---

## 📐 Regras de Layout e Isolamento Visual

- **Isolamento de Texto na Sidebar**: A coluna lateral possui `position: relative; z-index: 15; background: inherit; overflow: hidden;`, garantindo que os blocos de tarefas que rolam pela linha do tempo **jamais fiquem sobrepostos aos títulos das atividades na barra lateral**.
- **Desenho de Curvas Ortogonais Adaptativas**: Conectores SVG calculados via `getConnectorPath(x1, y1, x2, y2)` contornam as atividades com curvas Bezier suaves estilo MS Project / Primavera P6.
