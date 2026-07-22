# 📊 Gantt Dinâmico - Painel de Controle de Projetos (GTP - COQUERIA)

Sistema web executivo, dinâmico e responsivo para gestão visual avançada de múltiplos projetos e atividades de engenharia. Desenvolvido com padrão de design state-of-the-art inspirando-se em ferramentas como Linear, TickTick, Todoist e Asana.

![Versão](https://img.shields.io/badge/Vers%C3%A3o-5.5-ff4757)
![Tecnologia](https://img.shields.io/badge/Tech-HTML5%20%7C%20CSS3%20%7C%20JS%20ES6-1c7ed6)
![Design System](https://img.shields.io/badge/UI%2FUX-Linear%20%2F%20TickTick%20%2F%20Asana-2f9e44)

---

## 🚀 Principais Funcionalidades

### 1. 📅 Indicador "Hoje" Real e Sincronizado
- **Tratamento de Datas sem Distorção UTC (`parseLocalDate`)**: Parsing estrito no fuso horário local da máquina (`YYYY-MM-DD` a `00:00:00.000`), eliminando deslocamentos indesejados para datas anteriores.
- **Centralização Exata**: Indicador vertical vermelho de 2px com badge em pílula "HOJE" perfeitamente centralizado no meio da coluna da data atual.
- **Sincronização 100% da Grade**: O cabeçalho de datas (`datesHeader`), o fundo rosado da coluna (`gridOverlay`) e o indicador de Hoje compartilham rigorosamente o mesmo índice e coordenadas.

### 2. 🎛️ Minimizar/Expandir Projetos e Badges de Métricas
- **Indicadores no Cabeçalho**: Badges dinâmicos exibindo a **quantidade de atividades** (ex: `3 ativ.`) e a **porcentagem média de conclusão** do projeto (ex: `17% conc.`).
- **Alinhamento à Direita**: Tags de métricas posicionadas estrategicamente à direita da barra lateral, maximizando o espaço para o título do projeto.
- **Grupo Minimizável (`Collapsible Groups`)**: Clique no cabeçalho do projeto para recolher ou expandir suas atividades. O estado é salvo automaticamente no `localStorage`.

### 3. 📝 Editor de Tarefas Moderno de 2 Colunas (Sem Rolagem)
- **Layout Horizontal Otimizado (820px)**: Exibe 100% das informações simultaneamente na tela sem a necessidade de barra de rolagem vertical.
- **Edição por Duplo Clique (`dblclick`)**: 2 cliques rápidos em qualquer atividade ou linha abrem o modal de edição instantaneamente.
- **Atalhos de Datas Separados**:
  - **Data de Início**: Pílulas rápidas (`Hoje`, `Amanhã`, `Segunda`).
  - **Data de Término**: Pílulas de duração (`+1d`, `+3d`, `+7d`, `+15d`, `+30d`).
- **Controle de Progresso**: Slider interativo com pílulas rápidas de porcentagem (`0%`, `25%`, `50%`, `75%`, `100%`).

### 4. 🔗 Painel de Vínculos de Dependência (Predecessoras e Sucessoras)
- **Visualização Clara**: Colunas separadas para **Predecessoras** (origem) e **Sucessoras** (destino).
- **Desvínculo em 1 Clique**: Pílulas individuais de dependência com botão vermelho `(X)` para desvincular imediatamente.
- **Seletores de Inclusão Rápida**: Dropdowns dedicados (`+ Vincular Predecessora...` e `+ Vincular Sucessora...`) com atualização em tempo real.
- **Conexão Interativa Visual**: Conexão arrastável ao clicar no ponto indicador (`.link-connector-dot`) da cápsula com banner flutuante em 1 única linha (`🔗 Predecessora: ... ➔ Selecione a Sucessora`).

### 5. ✨ Design Glassmorphism e Acabamento de Progresso sem Transbordo
- **Recorte Perfeito (`.capsule-progress-clip`)**: Container com `overflow: hidden` que garante que o preenchimento de progresso nunca sobressaia pelas curvas da cápsula.
- **Efeito de Vidro Gradiente**: Preenchimento tridimensional com efeito de brilho reflexivo (*shimmer*) e sombra interna.
- **Micro-Badge de Porcentagem Flutuante (`.capsule-percent-pill`)**: Badge discreto integrado dentro ou ao lado da barra da atividade (com destaque verde `✓ 100%` quando concluída).

### 6. 📌 Rolagem 2D com Sidebar Fixo (Sticky Sidebar)
- **Aba Congelada na Esquerda**: A coluna de "Projetos & Atividades" e o nome das tarefas permanecem fixos na esquerda (`position: sticky; left: 0`) ao rolar a linha do tempo horizontalmente para datas futuras.
- **Barra de Ações Flutuante em Overlay (`.task-actions-inline`)**: Mini-barra de ferramentas (editar/excluir) que surge suavemente no hover, eliminando espaços vagos não utilizados.

### 7. 🎛️ Coluna de Atividades Redimensionável (Splitter Handle)
- Divisor vertical interativo (`#sidebarResizer`) para ajustar livremente a largura da coluna de tarefas.
- Largura personalizada salva no `localStorage` (com ajuste padrão otimizado de 290px).

### 8. 🖼️ Exportação em Alta Resolução (PNG & PDF)
- **Exportar Imagem (PNG)**: Renderização HD de 2x utilizando `html2canvas`.
- **Exportar PDF / Imprimir**: Folha de estilo otimizada para impressão em modo Paisagem (A4 Landscape).

---

## 🛠️ Tecnologias Utilizadas

- **HTML5**: Estrutura semântica e acessível.
- **CSS3**: Design System moderno com Variáveis CSS (Tokens), Dark/Light Modes, Flexbox/Grid e Animações.
- **JavaScript ES6 (Vanilla)**: Manipulação dinâmica de DOM, cálculo de datas locais e SVG de conectores.
- **Lucide Icons**: Ícones minimalistas de alta precisão.
- **html2canvas**: Biblioteca para conversão de elementos DOM em imagens PNG.

---

## 💻 Como Executar Localmente

Como o projeto é construído em código nativo sem dependências complexas de compilação, basta servir os arquivos estáticos:

### Opção 1: Servidor Python Nativo (Recomendado)
```bash
cd "/Users/richardvieira/Developer/Engenharia/Gantt Dinamico"
python3 -m http.server 8085
```
Acesse no navegador: `http://localhost:8085`

### Opção 2: Abrir o Arquivo Nativo
Basta dar um duplo clique no arquivo `index.html` em seu gerenciador de arquivos.

---

## 📁 Estrutura do Projeto

```
Gantt Dinamico/
├── index.html        # Estrutura HTML principal e Modais
├── style.css         # Design System, Temas, Grids e Animações
├── app.js            # Controladora da Aplicação, Eventos, SVG e Datas
├── README.md         # Documentação de Uso e Funcionalidades
└── DESIGN.md         # Documentação de Arquitetura de Design System
```
