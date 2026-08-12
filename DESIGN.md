# 🎨 Diretrizes e Sistema de Design (DESIGN.md)

Este documento especifica a arquitetura visual, tokens de design, princípios de
UX (User Experience) e decisões estéticas utilizadas na construção do **Gantt
Dinâmico - Painel de Controle de Projetos (GTP - COQUERIA)**.

---

## 💎 Princípios Fundamentais de Design

1. **Aparência Executiva Premium**: Cores saturadas com moderação, contrastes
   nítidos e bordas suavizadas (`border-radius: 18px` e `9999px`), transmitindo
   sofisticação executiva.
2. **Ergonomia e Redução de Cliques**: Atalhos por botões em formato de pílulas
   (_Bubbles_) para valores frequentes de data (`Hoje`, `Amanhã`, `+7d`) e
   progresso (`0%`, `25%`, `50%`, `75%`, `100%`).
3. **Sincronização Visual Dinâmica**: Resposta em tempo real para arrasto de
   tarefas, redimensionamento de coluna e conexões de dependência por linha
   elástica SVG.

---

## 🎨 Paleta de Cores e Tokens CSS

### 1. Cores de Superfície e Estrutura

| Token                | Modo Claro (Light) | Modo Escuro (Dark) | Aplicação                                           |
| :------------------- | :----------------- | :----------------- | :-------------------------------------------------- |
| `--bg-app`           | `#f4f6f9`          | `#0f1117`          | Fundo principal da aplicação                        |
| `--bg-surface`       | `#ffffff`          | `#1a1d27`          | Cards de projetos, modais e barra superior          |
| `--border-color`     | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` | Linhas divisórias e bordas                          |
| `--text-primary`     | `#1a1d23`          | `#e8eaed`          | Títulos e texto principal                           |
| `--text-secondary`   | `#6b7280`          | `#9ca3af`          | Subtítulos e rótulos de colunas                     |
| `--color-primary`    | `#B90973`          | `#B90973`          | Roxo Principal da Identidade                        |
| `--gradient-primary` | `linear-gradient(135deg, #FE8345 0%, #FA5E42 20%, #F73A40 40%, #E82048 60%, #D0145D 80%, #B90973 100%)` | `Idem` | Gradiente executivo para botões e destaques |

### 2. Temas Visuais (Branding e Logo)

A aplicação utiliza o logotipo oficial "R", suportado por uma identidade focada no Clean White com destaques vibrantes.
A cor primária do projeto e das ações principais agora segue um degradê vibrante que transita suavemente entre o **Laranja Destaque** (`#FE8345`) até o **Roxo Principal** (`#B90973`).

---

## 🔤 Tipografia e Hierarquia

**Fonte Principal**: `Plus Jakarta Sans` (Google Fonts)

- **Títulos de Cabeçalho**: `1.35rem` | Weight: `800` | Letter-spacing:
  `-0.02em`
- **Títulos de Projetos**: `0.95rem` | Weight: `800` | Text-transform:
  `uppercase`
- **Nomes de Atividades**: `0.875rem` | Weight: `600` | White-space: `nowrap`
  (sem quebra)
- **Datas e Badges**: `0.78rem` | Weight: `700`

---

## 🧩 Componentes Chave de Interface

### 1. Sistema de Confirmação (ConfirmDialog)

- Substituição integral de modais nativos do navegador (`window.confirm()`) por um componente elegante `ConfirmDialog`.
- Mantém coerência no design Glassmorphism e suporta dark mode nativamente.

### 2. Visualização da Linha de Base (Baseline Ghost)

- Renderização de uma sombra/caixa tracejada translucida projetada *por trás* da barra de tarefa indicando o planejamento original.
- Melhora a percepção de desvios no cronograma sem poluir a interface.

### 3. Geometria de Marcos (Milestones)

- Losangos geométricos onde a linha de dependência SVG é desenhada de forma responsiva para encostar exatamente nas pontas com margem de segurança de `4px`, prevenindo qualquer travessia na forma geométrica.

### 4. Editor de Tarefas Estilo TickTick / Todoist

- **Campos em Pílula (_Meta Chips_)**: Projeto, Status, Dependência e Marco
  organizados horizontalmente.
- **Bubbles Selecionáveis**: Botões de progresso em pílula (`0%`, `25%`, `50%`,
  `75%`, `100%`) com transição de seleção ativada.
- **Transição Suave**: Sombras coloridas pulsantes baseadas na identidade roxa.

---

## 📐 Regras de Layout e Isolamento Visual

- **Isolamento de Texto na Sidebar**: A coluna lateral possui
  `position: relative; z-index: 15; background: inherit; overflow: hidden;`,
  garantindo que os blocos de tarefas que rolam pela linha do tempo **jamais
  fiquem sobrepostos aos títulos das atividades na barra lateral**.
- **Desenho de Curvas Ortogonais Adaptativas**: Conectores SVG calculados via
  `getConnectorPath(x1, y1, x2, y2)` contornam as atividades com curvas Bezier
  suaves estilo MS Project / Primavera P6.
