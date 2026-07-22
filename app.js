/* ==========================================================================
   GANTT DINÂMICO & PAINEL GERENCIAL - LOGIC & CONTROLLER (V5.2)
   ========================================================================== */

// --- Pure Local Machine Date Utilities (Zero UTC Offset Distortions) ---
function parseLocalDate(dateInput) {
  if (!dateInput) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }
  const str = String(dateInput).trim().slice(0, 10);
  const parts = str.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  const d = new Date(dateInput);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function getLocalDateStr(dateObj = new Date()) {
  const d = parseLocalDate(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRelativeDateStr(offsetDays) {
  const d = parseLocalDate(new Date());
  d.setDate(d.getDate() + offsetDays);
  return getLocalDateStr(d);
}

// --- Default Base Dataset ---
const DEFAULT_PROJECTS = [
  {
    id: "proj-1",
    name: "CHILLER 100",
    theme: "orange",
    tasks: [
      { id: "task-101", name: "Análise do Cronograma", startDate: getRelativeDateStr(-2), endDate: getRelativeDateStr(5), progress: 40, status: "Em Progresso" },
      { id: "task-102", name: "Visita em campo para análise", startDate: getRelativeDateStr(3), endDate: getRelativeDateStr(10), progress: 0, status: "A Fazer", predecessorId: "task-101" },
      { id: "task-103", name: "Levantamento de Requisitos", startDate: getRelativeDateStr(-8), endDate: getRelativeDateStr(-1), progress: 100, status: "Concluído" },
      { id: "task-104", name: "Aprovação de Engenharia", startDate: getRelativeDateStr(10), endDate: getRelativeDateStr(10), progress: 0, status: "A Fazer", isMilestone: true }
    ]
  },
  {
    id: "proj-2",
    name: "RESTABELECIMENTO N2",
    theme: "coral",
    tasks: [
      { id: "task-201", name: "Coletar status de andamento", startDate: getRelativeDateStr(0), endDate: getRelativeDateStr(8), progress: 20, status: "Em Progresso" },
      { id: "task-202", name: "Validação com Engenharia", startDate: getRelativeDateStr(6), endDate: getRelativeDateStr(16), progress: 0, status: "A Fazer", predecessorId: "task-201" }
    ]
  },
  {
    id: "proj-3",
    name: "SELO POTE",
    theme: "pink",
    tasks: [
      { id: "task-301", name: "Elaborar Cronograma", startDate: getRelativeDateStr(-5), endDate: getRelativeDateStr(-2), progress: 30, status: "Atrasado" },
      { id: "task-302", name: "Finalizar Preparação", startDate: getRelativeDateStr(2), endDate: getRelativeDateStr(12), progress: 0, status: "A Fazer" },
      { id: "task-303", name: "Entrega Final da Fase 1", startDate: getRelativeDateStr(12), endDate: getRelativeDateStr(12), progress: 0, status: "A Fazer", isMilestone: true }
    ]
  }
];

class GanttApp {
  constructor() {
    this.projects = this.loadProjects();
    this.viewMode = 'days'; // 'days' | 'weeks'
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.selectedTheme = 'orange';

    // Real Today Date in Local Machine Timezone
    this.todayDate = parseLocalDate(new Date());
    this.todayStr = getLocalDateStr(this.todayDate);

    // Sidebar Width State & Resizing (Compact 290px Default to avoid wasted whitespace)
    const savedWidth = Number(localStorage.getItem('gantt_sidebar_width'));
    this.sidebarWidth = (savedWidth && savedWidth <= 530 && savedWidth >= 300) ? savedWidth : 500;
    this.applySidebarWidth();
    this.isResizingSidebar = false;

    // Dynamic timeline view window offset in days
    this.viewOffsetDays = 0;

    // Drag & Drop State
    this.dragState = null;
    this.rowReorderState = null;
    this.lastTaskClick = null;
    this.collapsedProjects = new Set(JSON.parse(localStorage.getItem('gantt_collapsed_projects') || '[]'));

    // Interactive Linking State
    this.linkingState = {
      active: false,
      sourceTaskId: null,
      sourceTaskName: null,
      startX: 0,
      startY: 0
    };

    this.initDOM();
    this.bindEvents();
    this.render();
  }

  applySidebarWidth() {
    document.documentElement.style.setProperty('--sidebar-width', `${this.sidebarWidth}px`);
  }

  // --- Storage & Automatic Status Migration ---
  loadProjects() {
    const saved = localStorage.getItem('gantt_projects_data_v5');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (Array.isArray(data) && data.length > 0) {
          data.forEach(p => {
            if (!p.tasks) p.tasks = [];
            p.tasks.forEach(t => {
              if (t.status === 'In Progress') t.status = 'Em Progresso';
              if (t.status === 'To do') t.status = 'A Fazer';
              if (t.status === 'Done') t.status = 'Concluído';
            });
          });
          return data;
        }
      } catch (e) { console.error(e); }
    }
    return JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
  }

  saveProjects() {
    localStorage.setItem('gantt_projects_data_v5', JSON.stringify(this.projects));
    this.render();
  }

  // --- DOM Elements Reference ---
  initDOM() {
    this.ganttBoard = document.getElementById('ganttBoard');
    this.sidebarResizer = document.getElementById('sidebarResizer');
    this.datesHeader = document.getElementById('datesHeader');
    this.projectsContainer = document.getElementById('projectsContainer');
    this.gridOverlay = document.getElementById('gridOverlay');
    this.todayLine = document.getElementById('todayLine');
    this.dependencySvg = document.getElementById('dependencySvg');
    this.tooltip = document.getElementById('ganttTooltip');
    this.linkingBanner = document.getElementById('linkingBanner');

    // Stats
    this.kpiTotalProjects = document.getElementById('kpiTotalProjects');
    this.kpiTotalTasks = document.getElementById('kpiTotalTasks');
    this.kpiAvgProgress = document.getElementById('kpiAvgProgress');
    this.kpiOverdueTasks = document.getElementById('kpiOverdueTasks');

    // Controls
    this.searchInput = document.getElementById('searchInput');
    this.filterStatus = document.getElementById('filterStatus');
    this.filterZoom = document.getElementById('filterZoom');

    // Export Dropdown
    this.exportDropdownWrapper = document.querySelector('.export-dropdown-wrapper');
    this.btnExportMenu = document.getElementById('btnExportMenu');
    this.btnExportPNG = document.getElementById('btnExportPNG');
    this.btnExportPDF = document.getElementById('btnExportPDF');

    // Modals
    this.projectModal = document.getElementById('projectModal');
    this.projectForm = document.getElementById('projectForm');
    this.taskModal = document.getElementById('taskModal');
    this.taskForm = document.getElementById('taskForm');
    this.taskProjectSelect = document.getElementById('taskProjectSelect');
    this.taskPredecessorSelect = document.getElementById('taskPredecessorSelect');
    this.taskIsMilestone = document.getElementById('taskIsMilestone');
    this.taskProgress = document.getElementById('taskProgress');
    this.progressValBadge = document.getElementById('progressValBadge');
    this.btnDeleteTaskModal = document.getElementById('btnDeleteTaskModal');
  }

  // --- Event Binding ---
  bindEvents() {
    // Theme Toggle
    document.getElementById('btnThemeToggle').addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      lucide.createIcons();
    });

    // Export Menu Toggle
    this.btnExportMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportDropdownWrapper.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      this.exportDropdownWrapper.classList.remove('active');
    });

    // Export Actions
    this.btnExportPNG.addEventListener('click', () => this.exportAsPNG());
    this.btnExportPDF.addEventListener('click', () => this.exportAsPDF());

    // Filters
    this.searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.renderProjects();
    });

    this.filterStatus.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.renderProjects();
    });

    this.filterZoom.addEventListener('change', (e) => {
      this.viewMode = e.target.value;
      this.render();
    });

    // Timeline Navigation Past / Future
    document.getElementById('btnNavPrev').addEventListener('click', () => {
      this.viewOffsetDays -= (this.viewMode === 'weeks' ? 28 : 7);
      this.render();
    });

    document.getElementById('btnNavNext').addEventListener('click', () => {
      this.viewOffsetDays += (this.viewMode === 'weeks' ? 28 : 7);
      this.render();
    });

    document.getElementById('btnToday').addEventListener('click', () => {
      this.viewOffsetDays = 0;
      this.render();
    });

    // Progress Slider Live Feedback
    this.taskProgress.addEventListener('input', (e) => {
      const val = e.target.value;
      this.progressValBadge.textContent = `${val}%`;
      this.updateProgressBubblesHighlight(val);
    });

    // Progress Quick Bubbles (0%, 25%, 50%, 75%, 100%)
    document.querySelectorAll('.btn-progress-bubble').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = e.target.getAttribute('data-val');
        this.taskProgress.value = val;
        this.progressValBadge.textContent = `${val}%`;
        this.updateProgressBubblesHighlight(val);
      });
    });

    // Milestone Checkbox UX
    this.taskIsMilestone.addEventListener('change', (e) => {
      const endBubbles = document.getElementById('endDateBubblesContainer');
      const endDateInput = document.getElementById('taskEndDate');
      const milestoneChipLabel = e.target.closest('.milestone-chip');

      if (e.target.checked) {
        if (milestoneChipLabel) milestoneChipLabel.classList.add('active');
        if (endBubbles) {
          endBubbles.style.opacity = '0.4';
          endBubbles.style.pointerEvents = 'none';
        }
        endDateInput.value = document.getElementById('taskStartDate').value;
        endDateInput.readOnly = true;
      } else {
        if (milestoneChipLabel) milestoneChipLabel.classList.remove('active');
        if (endBubbles) {
          endBubbles.style.opacity = '1';
          endBubbles.style.pointerEvents = 'auto';
        }
        endDateInput.readOnly = false;
      }
    });

    document.getElementById('taskStartDate').addEventListener('change', (e) => {
      if (this.taskIsMilestone.checked) {
        document.getElementById('taskEndDate').value = e.target.value;
      }
    });

    // Start Date Quick Action Bubbles (Hoje, Amanhã, Segunda)
    document.querySelectorAll('#startDateBubblesContainer .btn-bubble').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.getAttribute('data-action');
        const startInput = document.getElementById('taskStartDate');
        const endInput = document.getElementById('taskEndDate');

        let newStartStr = '';
        if (action === 'start-today') {
          newStartStr = this.todayStr;
        } else if (action === 'start-tomorrow') {
          newStartStr = getRelativeDateStr(1);
        } else if (action === 'start-next-mon') {
          const d = parseLocalDate(new Date());
          const dayOfWeek = d.getDay();
          const distanceToMon = (8 - dayOfWeek) % 7 || 7;
          d.setDate(d.getDate() + distanceToMon);
          newStartStr = getLocalDateStr(d);
        }

        if (newStartStr) {
          startInput.value = newStartStr;
          if (this.taskIsMilestone.checked || !endInput.value || parseLocalDate(endInput.value) < parseLocalDate(newStartStr)) {
            endInput.value = newStartStr;
          }
        }
      });
    });

    // End Date / Duration Quick Action Bubbles (+1d, +3d, +7d, +15d, +30d)
    document.querySelectorAll('#endDateBubblesContainer .btn-bubble').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.taskIsMilestone.checked) return;

        const durationDays = Number(e.target.getAttribute('data-duration'));
        const startInput = document.getElementById('taskStartDate');
        const endInput = document.getElementById('taskEndDate');

        const baseStart = startInput.value ? parseLocalDate(startInput.value) : parseLocalDate(new Date());
        const targetEnd = new Date(baseStart);
        targetEnd.setDate(targetEnd.getDate() + (durationDays - 1));

        endInput.value = getLocalDateStr(targetEnd);
      });
    });

    // Modals
    document.getElementById('btnNewProject').addEventListener('click', () => this.openProjectModal());
    document.getElementById('btnCloseProjectModal').addEventListener('click', () => this.closeProjectModal());
    document.getElementById('btnCancelProject').addEventListener('click', () => this.closeProjectModal());

    document.getElementById('btnNewTask').addEventListener('click', () => this.openTaskModal());
    document.getElementById('btnCloseTaskModal').addEventListener('click', () => this.closeTaskModal());
    document.getElementById('btnCancelTask').addEventListener('click', () => this.closeTaskModal());

    // Delete Task inside Modal
    this.btnDeleteTaskModal.addEventListener('click', () => {
      const taskId = document.getElementById('taskId').value;
      const projId = this.taskProjectSelect.value;
      if (taskId && projId) {
        this.deleteTask(projId, taskId);
        this.closeTaskModal();
      }
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.linkingState.active) {
          this.cancelLinkingMode();
        } else {
          this.closeProjectModal();
          this.closeTaskModal();
          this.exportDropdownWrapper.classList.remove('active');
        }
      }
    });

    // Color Swatch Selection
    document.querySelectorAll('#themePicker .color-option').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        document.querySelectorAll('#themePicker .color-option').forEach(s => s.classList.remove('selected'));
        e.target.classList.add('selected');
        this.selectedTheme = e.target.getAttribute('data-color');
      });
    });

    // Forms Submit
    this.projectForm.addEventListener('submit', (e) => this.handleProjectSubmit(e));
    this.taskForm.addEventListener('submit', (e) => this.handleTaskSubmit(e));

    // Sidebar Resizer Drag
    this.sidebarResizer.addEventListener('mousedown', (e) => this.handleSidebarResizeStart(e));

    // Global Mouse Listeners
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }

  // --- Sidebar Resizing ---
  handleSidebarResizeStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    this.isResizingSidebar = true;
    this.sidebarResizeStartX = e.clientX;
    this.sidebarInitialWidth = this.sidebarWidth;

    this.sidebarResizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  // --- Interactive Linking Mode ---
  startLinkingMode(sourceTask, e) {
    const rect = e.target.getBoundingClientRect();
    const bodyRect = this.projectsContainer.getBoundingClientRect();

    this.linkingState = {
      active: true,
      sourceTaskId: sourceTask.id,
      sourceTaskName: sourceTask.name,
      startX: rect.left + rect.width / 2 - bodyRect.left,
      startY: rect.top + rect.height / 2 - bodyRect.top
    };

    this.ganttBoard.classList.add('linking-mode');
    this.linkingBanner.innerHTML = `🔗 Predecessora: <strong>"${sourceTask.name}"</strong> ➔ Selecione a Sucessora <em>(ESC para cancelar)</em>`;
    this.linkingBanner.classList.add('visible');
  }

  completeLinkingMode(targetTask) {
    if (this.linkingState.active && targetTask && targetTask.id !== this.linkingState.sourceTaskId) {
      targetTask.predecessorId = this.linkingState.sourceTaskId;
      this.saveProjects();
    }
    this.cancelLinkingMode();
  }

  cancelLinkingMode() {
    this.linkingState = { active: false, sourceTaskId: null, sourceTaskName: null, startX: 0, startY: 0 };
    this.ganttBoard.classList.remove('linking-mode');
    this.linkingBanner.classList.remove('visible');
    this.renderDependencies();
  }

  // --- Export Actions ---
  exportAsPNG() {
    this.exportDropdownWrapper.classList.remove('active');
    const board = document.getElementById('ganttBoard');
    const scrollContainer = document.querySelector('.gantt-body-scroll-container');

    const originalText = this.btnExportMenu.innerHTML;
    this.btnExportMenu.innerHTML = `<span>Gerando Imagem...</span>`;

    // Save original scroll and container state
    const origMaxHeight = scrollContainer ? scrollContainer.style.maxHeight : '';
    const origOverflow = scrollContainer ? scrollContainer.style.overflow : '';
    const origScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const origScrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;

    // Expand container to reveal all hidden/scrolled rows and date columns
    if (scrollContainer) {
      scrollContainer.style.maxHeight = 'none';
      scrollContainer.style.overflow = 'visible';
    }

    setTimeout(() => {
      const fullWidth = board.scrollWidth;
      const fullHeight = board.scrollHeight;

      html2canvas(board, {
        scale: 2,
        useCORS: true,
        width: fullWidth,
        height: fullHeight,
        windowWidth: fullWidth + 100,
        windowHeight: fullHeight + 100,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#131b2e' : '#ffffff'
      }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Gantt_Coqueria_${getLocalDateStr(new Date())}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }).catch(err => {
        console.error(err);
        alert('Erro ao gerar imagem PNG.');
      }).finally(() => {
        // Restore original layout state and scroll position
        if (scrollContainer) {
          scrollContainer.style.maxHeight = origMaxHeight;
          scrollContainer.style.overflow = origOverflow;
          scrollContainer.scrollTop = origScrollTop;
          scrollContainer.scrollLeft = origScrollLeft;
        }
        this.btnExportMenu.innerHTML = originalText;
        lucide.createIcons();
      });
    }, 150);
  }

  exportAsPDF() {
    this.exportDropdownWrapper.classList.remove('active');
    window.print();
  }

  // --- Bounds Calculation & Navigation ---
  calculateBounds() {
    this.todayDate = parseLocalDate(new Date());
    this.todayStr = getLocalDateStr(this.todayDate);

    let baseStart = parseLocalDate(this.todayDate);
    baseStart.setDate(baseStart.getDate() - 5 + this.viewOffsetDays);

    let baseEnd = new Date(baseStart);
    baseEnd.setDate(baseEnd.getDate() + (this.viewMode === 'weeks' ? 42 : 25));

    this.timelineStart = baseStart;
    this.timelineEnd = baseEnd;

    const days = this.getDaysArray();
    document.documentElement.style.setProperty('--total-days', days.length);
  }

  getDaysArray() {
    const days = [];
    let cur = parseLocalDate(this.timelineStart);
    const end = parseLocalDate(this.timelineEnd);
    while (cur <= end) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  // --- Render Cycle ---
  render() {
    this.calculateBounds();
    this.renderKPIs();
    this.renderTimelineHeader();
    this.renderGridOverlay();
    this.renderProjects();
    this.positionTodayLine();
    this.renderDependencies();
    lucide.createIcons();
  }

  renderKPIs() {
    const totalProjects = this.projects.length;
    let totalTasks = 0;
    let progressSum = 0;
    let overdueCount = 0;

    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        totalTasks++;
        progressSum += Number(t.progress || 0);

        const isPastEnd = t.endDate < this.todayStr;
        const isNotDone = t.progress < 100 && t.status !== 'Concluído';
        if (t.status === 'Atrasado' || (isPastEnd && isNotDone)) {
          overdueCount++;
        }
      });
    });

    const avgProgress = totalTasks > 0 ? Math.round(progressSum / totalTasks) : 0;

    this.kpiTotalProjects.textContent = totalProjects;
    this.kpiTotalTasks.textContent = totalTasks;
    this.kpiAvgProgress.textContent = `${avgProgress}%`;
    this.kpiOverdueTasks.textContent = overdueCount;
  }

  renderTimelineHeader() {
    this.datesHeader.innerHTML = '';
    const days = this.getDaysArray();
    const todayIndex = days.findIndex(d => getLocalDateStr(d) === this.todayStr);

    if (this.viewMode === 'weeks') {
      let currentWeekDays = [];
      days.forEach((day, idx) => {
        currentWeekDays.push(day);
        if (day.getDay() === 0 || idx === days.length - 1) {
          const startStr = `${currentWeekDays[0].getDate()}/${currentWeekDays[0].toLocaleDateString('pt-BR', { month: 'short' })}`;
          const endStr = `${currentWeekDays[currentWeekDays.length - 1].getDate()}/${currentWeekDays[currentWeekDays.length - 1].toLocaleDateString('pt-BR', { month: 'short' })}`;

          const cell = document.createElement('div');
          cell.className = 'date-cell';
          cell.style.flex = currentWeekDays.length;
          cell.innerHTML = `
            <div style="font-weight:800;">Semana ${this.getWeekNumber(currentWeekDays[0])}</div>
            <div class="month-sub">${startStr} - ${endStr}</div>
          `;
          this.datesHeader.appendChild(cell);
          currentWeekDays = [];
        }
      });
    } else {
      days.forEach((day, idx) => {
        const isToday = idx === todayIndex;
        const dayNum = String(day.getDate()).padStart(2, '0');
        const monthShort = day.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

        const cell = document.createElement('div');
        cell.className = `date-cell ${isToday ? 'is-today' : ''}`;
        cell.innerHTML = `
          <div>${dayNum}</div>
          <div class="month-sub">${monthShort}</div>
        `;
        this.datesHeader.appendChild(cell);
      });
    }
  }

  getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  renderGridOverlay() {
    const days = this.getDaysArray();
    const todayIndex = days.findIndex(d => getLocalDateStr(d) === this.todayStr);
    this.gridOverlay.innerHTML = '';
    days.forEach((day, idx) => {
      const isToday = idx === todayIndex;
      const col = document.createElement('div');
      col.className = `grid-col ${isToday ? 'is-today-col' : ''}`;
      this.gridOverlay.appendChild(col);
    });
  }

  positionTodayLine() {
    const todayCol = this.gridOverlay ? this.gridOverlay.querySelector('.is-today-col') : null;

    if (todayCol && todayCol.offsetWidth > 0) {
      // Use exact DOM pixel offset of the highlighted today column for 100% precision
      const centerPx = todayCol.offsetLeft + (todayCol.offsetWidth / 2);
      this.todayLine.style.left = `calc(var(--sidebar-width) + ${centerPx}px)`;
      this.todayLine.style.display = 'block';
    } else {
      const days = this.getDaysArray();
      const totalDays = days.length;
      const todayIndex = days.findIndex(d => getLocalDateStr(d) === this.todayStr);

      if (todayIndex !== -1) {
        const ratio = (todayIndex + 0.5) / totalDays;
        this.todayLine.style.left = `calc(var(--sidebar-width) + (100% - var(--sidebar-width)) * ${ratio})`;
        this.todayLine.style.display = 'block';
      } else {
        this.todayLine.style.display = 'none';
      }
    }
  }

  toggleProjectCollapse(projId) {
    if (this.collapsedProjects.has(projId)) {
      this.collapsedProjects.delete(projId);
    } else {
      this.collapsedProjects.add(projId);
    }
    localStorage.setItem('gantt_collapsed_projects', JSON.stringify(Array.from(this.collapsedProjects)));
    this.render();
  }

  renderProjects() {
    this.projectsContainer.innerHTML = '';
    const days = this.getDaysArray();
    const totalDays = days.length;

    let filteredProjects = this.projects.map(proj => {
      const filteredTasks = proj.tasks.filter(task => {
        const isOverdue = task.endDate < this.todayStr && task.progress < 100;
        const currentStatus = isOverdue ? 'Atrasado' : task.status;

        const matchesSearch = task.name.toLowerCase().includes(this.searchTerm) || proj.name.toLowerCase().includes(this.searchTerm);
        const matchesStatus = this.statusFilter === 'all' || currentStatus === this.statusFilter;
        return matchesSearch && matchesStatus;
      });
      return { ...proj, tasks: filteredTasks };
    }).filter(proj => proj.tasks.length > 0 || this.searchTerm === '');

    if (filteredProjects.length === 0) {
      this.projectsContainer.innerHTML = `
        <div class="empty-state">
          <h3>Nenhuma atividade encontrada</h3>
          <p>Ajuste os filtros de busca ou adicione uma nova tarefa.</p>
        </div>
      `;
      return;
    }

    filteredProjects.forEach(proj => {
      const isCollapsed = this.collapsedProjects.has(proj.id);
      const card = document.createElement('div');
      card.className = `project-card ${isCollapsed ? 'is-collapsed' : ''}`;
      card.setAttribute('data-theme', proj.theme || 'orange');

      // Project Meta Calculation (% Progress & Task Count)
      const totalTasks = proj.tasks.length;
      const totalProgress = proj.tasks.reduce((sum, t) => sum + Number(t.progress || 0), 0);
      const avgProgress = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;

      // Project Header (Collapsible on Click)
      const projectHeader = document.createElement('div');
      projectHeader.className = 'project-header-sidebar';
      projectHeader.addEventListener('click', (e) => {
        if (e.target.closest('.project-actions-inline')) return;
        this.toggleProjectCollapse(proj.id);
      });

      projectHeader.innerHTML = `
        <div class="project-header-title-group">
          <button type="button" class="btn-collapse-toggle" title="${isCollapsed ? 'Expandir Projeto' : 'Minimizar Projeto'}">
            <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" style="width: 16px; height: 16px;"></i>
          </button>
          <span class="project-title" title="${proj.name}">${proj.name}</span>
        </div>

        <div class="project-header-right-group">
          <span class="project-meta-pill proj-progress ${avgProgress === 100 ? 'completed' : ''}">${avgProgress}% conc.</span>
          <div class="project-actions-inline" onclick="event.stopPropagation()">
            <button type="button" class="icon-btn-sm" title="Nova Tarefa no Projeto" onclick="event.stopPropagation(); app.openTaskModal('${proj.id}')"><i data-lucide="plus"></i></button>
            <button type="button" class="icon-btn-sm" title="Editar Projeto" onclick="event.stopPropagation(); app.openProjectModal('${proj.id}')"><i data-lucide="edit-2"></i></button>
            <button type="button" class="icon-btn-sm" title="Excluir Projeto" onclick="event.stopPropagation(); app.deleteProject('${proj.id}')"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `;
      card.appendChild(projectHeader);

      // Tasks Rows
      proj.tasks.forEach((task, tIndex) => {
        const row = document.createElement('div');
        row.className = 'project-row';
        row.setAttribute('data-task-id', task.id);

        const handleTargetClick = (e) => {
          if (this.linkingState.active) {
            e.stopPropagation();
            e.preventDefault();
            this.completeLinkingMode(task);
            return true;
          }
          return false;
        };

        // Custom Double-Click Detector (350ms threshold) to bypass drag preventDefault
        row.addEventListener('mousedown', (e) => {
          const now = Date.now();
          if (this.lastTaskClick && this.lastTaskClick.id === task.id && (now - this.lastTaskClick.time < 350)) {
            e.stopPropagation();
            e.preventDefault();
            this.openTaskModal(proj.id, task.id);
            this.lastTaskClick = null;
            return;
          }
          this.lastTaskClick = { id: task.id, time: now };

          handleTargetClick(e);
        });

        // Vertical Hierarchy Drag & Drop Reordering Event Listeners
        row.addEventListener('dragover', (e) => {
          if (!this.rowReorderState || this.rowReorderState.sourceTaskId === task.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';

          const rect = row.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          document.querySelectorAll('.project-row').forEach(r => r.classList.remove('drop-target-above', 'drop-target-below'));

          if (e.clientY < midY) {
            row.classList.add('drop-target-above');
          } else {
            row.classList.add('drop-target-below');
          }
        });

        row.addEventListener('dragleave', () => {
          row.classList.remove('drop-target-above', 'drop-target-below');
        });

        row.addEventListener('drop', (e) => {
          if (!this.rowReorderState || this.rowReorderState.sourceTaskId === task.id) return;
          e.preventDefault();
          e.stopPropagation();

          const sourceProj = this.projects.find(p => p.id === this.rowReorderState.sourceProjId);
          const targetProj = this.projects.find(p => p.id === proj.id);

          if (!sourceProj || !targetProj) return;

          const taskIndex = sourceProj.tasks.findIndex(t => t.id === this.rowReorderState.sourceTaskId);
          if (taskIndex === -1) return;

          const [movedTask] = sourceProj.tasks.splice(taskIndex, 1);

          const rect = row.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          let targetIndex = targetProj.tasks.findIndex(t => t.id === task.id);

          if (e.clientY >= midY) {
            targetIndex += 1;
          }

          if (targetIndex < 0) targetIndex = 0;
          targetProj.tasks.splice(targetIndex, 0, movedTask);

          document.querySelectorAll('.project-row').forEach(r => r.classList.remove('drop-target-above', 'drop-target-below', 'dragging-row'));
          this.rowReorderState = null;

          this.saveProjects();
        });

        // Exact Local Midnight Date Parsing with Fallbacks
        const taskStartStr = task.startDate || getLocalDateStr(new Date());
        const taskEndStr = task.endDate || taskStartStr;

        const startDate = parseLocalDate(taskStartStr);
        const endDate = parseLocalDate(taskEndStr);

        const rawDurationDays = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
        const durationText = task.isMilestone ? 'Marco' : `${rawDurationDays}d`;

        // Sidebar Item with Vertical Drag Grip Handle
        const sidebarItem = document.createElement('div');
        sidebarItem.className = 'task-sidebar-item';
        sidebarItem.innerHTML = `
          <div class="row-drag-handle" title="Arrastrar para reordenar hierarquia" draggable="true">
            <i data-lucide="grip-vertical" style="width: 14px; height: 14px;"></i>
          </div>
          <span class="task-name" title="${task.name}">${task.name}</span>
          <span class="task-duration-badge">${durationText}</span>
          <div class="task-actions-inline" onclick="event.stopPropagation()">
            <button class="icon-btn-sm" title="Editar Tarefa" onclick="app.openTaskModal('${proj.id}', '${task.id}')"><i data-lucide="edit-3"></i></button>
            <button class="icon-btn-sm" title="Excluir Tarefa" onclick="app.deleteTask('${proj.id}', '${task.id}')"><i data-lucide="trash"></i></button>
          </div>
        `;

        const dragHandle = sidebarItem.querySelector('.row-drag-handle');
        dragHandle.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          this.rowReorderState = {
            sourceProjId: proj.id,
            sourceTaskId: task.id,
            sourceIndex: tIndex
          };
          row.classList.add('dragging-row');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', task.id);
        });

        dragHandle.addEventListener('dragend', () => {
          row.classList.remove('dragging-row');
          document.querySelectorAll('.project-row').forEach(r => r.classList.remove('drop-target-above', 'drop-target-below'));
          this.rowReorderState = null;
        });

        row.appendChild(sidebarItem);

        // Timeline Cell
        const timelineCell = document.createElement('div');
        timelineCell.className = 'task-timeline-cell';

        const firstTimelineDate = parseLocalDate(days[0]);
        const lastTimelineDate = parseLocalDate(days[days.length - 1]);

        const effectiveStart = startDate < firstTimelineDate ? firstTimelineDate : startDate;
        const effectiveEnd = endDate > lastTimelineDate ? lastTimelineDate : endDate;

        // Exact Integer Day Offset Calculation with Math.round
        const startDiffDays = Math.max(0, Math.round((effectiveStart - firstTimelineDate) / (1000 * 60 * 60 * 24)));
        const durationDays = Math.max(1, Math.round((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1);

        const leftPct = (startDiffDays / totalDays) * 100;
        const widthPct = (durationDays / totalDays) * 100;

        // Status & Overdue Calculations
        const isPastEnd = taskEndStr < this.todayStr;
        const isNotDone = task.progress < 100 && task.status !== 'Concluído';
        const isOverdue = task.status === 'Atrasado' || (isPastEnd && isNotDone);
        const displayStatus = isOverdue ? 'Atrasado' : (task.status || 'A Fazer');

        // Connector Dot for Interactive Linking
        const connectorDot = document.createElement('div');
        connectorDot.className = 'link-connector-dot';
        connectorDot.title = 'Criar Conexão / Link de Dependência';
        connectorDot.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.startLinkingMode(task, e);
        });

        if (task.isMilestone) {
          const centerPct = ((startDiffDays + 0.5) / totalDays) * 100;
          const wrapper = document.createElement('div');
          wrapper.className = 'milestone-wrapper';
          wrapper.style.left = `${centerPct}%`;
          wrapper.dataset.taskId = task.id;
          wrapper.dataset.projectId = proj.id;

          wrapper.addEventListener('mousedown', (e) => {
            if (handleTargetClick(e)) return;
            this.handleDragStart(e, task, proj.id, 'move');
          });

          const diamond = document.createElement('div');
          diamond.className = 'milestone-diamond';

          const label = document.createElement('span');
          label.className = 'milestone-title-badge';
          label.textContent = task.name;

          wrapper.appendChild(diamond);
          wrapper.appendChild(label);
          wrapper.appendChild(connectorDot);
          wrapper.title = `Marco: ${task.name} (${taskStartStr.split('-').reverse().join('/')})`;
          timelineCell.appendChild(wrapper);
        } else {
          const capsuleTrack = document.createElement('div');
          capsuleTrack.className = 'capsule-track';
          capsuleTrack.style.left = `${leftPct}%`;
          capsuleTrack.style.width = `${widthPct}%`;

          capsuleTrack.addEventListener('mousedown', (e) => {
            if (handleTargetClick(e)) return;
            this.handleDragStart(e, task, proj.id, 'move');
          });

          const progressClip = document.createElement('div');
          progressClip.className = 'capsule-progress-clip';

          const progressBar = document.createElement('div');
          progressBar.className = 'capsule-progress-bar';
          progressBar.style.width = `${Math.min(100, Math.max(0, task.progress))}%`;
          if (isOverdue) progressBar.style.background = 'linear-gradient(90deg, #ff4757, #d90429)';

          progressClip.appendChild(progressBar);
          capsuleTrack.appendChild(progressClip);

          const isShortCapsule = widthPct < 15;

          if (isShortCapsule) {
            // Render Status & Percent Pill together OUTSIDE for short capsules
            const statusMeta = document.createElement('div');
            statusMeta.className = 'status-meta-group outside';
            const isCompleted = task.progress >= 100 || task.status === 'Concluído';
            const pillHtml = `<span class="capsule-percent-pill outside-pill ${isCompleted ? 'completed' : ''}">${isCompleted ? '✓ 100%' : `${task.progress}%`}</span>`;

            if (isOverdue) {
              statusMeta.innerHTML = `<span class="status-badge atrasado">⚠️ Atrasado</span> ${pillHtml}`;
            } else {
              statusMeta.innerHTML = `<span class="status-dot"></span><span>${displayStatus}</span> ${pillHtml}`;
            }
            capsuleTrack.appendChild(statusMeta);
          } else {
            // Standard Capsule: Status Text on LEFT (12px), Percent Pill on RIGHT (10px)
            const statusMeta = document.createElement('div');
            statusMeta.className = 'status-meta-group';
            if (isOverdue) {
              statusMeta.innerHTML = `<span class="status-badge atrasado">⚠️ Atrasado</span>`;
            } else {
              statusMeta.innerHTML = `<span class="status-dot"></span><span>${displayStatus}</span>`;
            }
            capsuleTrack.appendChild(statusMeta);

            const percentPill = document.createElement('div');
            const isCompleted = task.progress >= 100 || task.status === 'Concluído';
            percentPill.className = `capsule-percent-pill ${isCompleted ? 'completed' : ''}`;
            percentPill.innerHTML = isCompleted ? `✓ 100%` : `${task.progress}%`;
            capsuleTrack.appendChild(percentPill);
          }

          const resizeHandle = document.createElement('div');
          resizeHandle.className = 'capsule-resize-handle';
          resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (!this.linkingState.active) {
              this.handleDragStart(e, task, proj.id, 'resize');
            }
          });
          capsuleTrack.appendChild(resizeHandle);
          capsuleTrack.appendChild(connectorDot);

          timelineCell.appendChild(capsuleTrack);
        }

        row.addEventListener('mouseenter', (e) => {
          if (!this.linkingState.active) this.showTooltip(e, task, proj.name, isOverdue);
        });
        row.addEventListener('mousemove', (e) => {
          if (!this.linkingState.active) this.moveTooltip(e);
        });
        row.addEventListener('mouseleave', () => this.hideTooltip());

        row.appendChild(timelineCell);
        card.appendChild(row);
      });

      this.projectsContainer.appendChild(card);
    });
  }

  // --- Drag & Drop Operations ---
  handleDragStart(e, task, projId, mode) {
    if (e.button !== 0 || this.linkingState.active || this.isResizingSidebar) return;
    e.preventDefault();

    this.dragState = {
      task,
      projId,
      mode,
      startX: e.clientX,
      initialStart: parseLocalDate(task.startDate),
      initialEnd: parseLocalDate(task.endDate),
      containerWidth: this.projectsContainer.offsetWidth - this.sidebarWidth
    };
  }

  getConnectorPath(x1, y1, x2, y2) {
    if (x2 >= x1 + 20) {
      const dx = x2 - x1;
      const offset = Math.max(30, Math.min(100, dx * 0.5));
      return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
    } else {
      const xRight = x1 + 28;
      const xLeft = x2 - 28;
      const yMid = y1 + (y2 - y1) / 2;
      return `M ${x1} ${y1} C ${xRight} ${y1}, ${xRight} ${yMid}, ${(xRight + xLeft) / 2} ${yMid} C ${xLeft} ${yMid}, ${xLeft} ${y2}, ${x2} ${y2}`;
    }
  }

  handleMouseMove(e) {
    if (this.isResizingSidebar) {
      const deltaX = e.clientX - this.sidebarResizeStartX;
      const newWidth = Math.max(200, Math.min(650, this.sidebarInitialWidth + deltaX));
      this.sidebarWidth = newWidth;
      this.applySidebarWidth();
      this.positionTodayLine();
      this.renderDependencies();
      return;
    }

    if (this.linkingState.active) {
      this.renderDependencies();

      const bodyRect = this.projectsContainer.getBoundingClientRect();
      const mouseX = e.clientX - bodyRect.left;
      const mouseY = e.clientY - bodyRect.top;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = this.getConnectorPath(this.linkingState.startX, this.linkingState.startY, mouseX, mouseY);

      path.setAttribute("d", d);
      path.setAttribute("class", "dependency-path-active");
      this.dependencySvg.appendChild(path);
      return;
    }

    if (!this.dragState) return;

    const deltaX = e.clientX - this.dragState.startX;
    const daysArray = this.getDaysArray();
    const totalDays = daysArray.length;
    const pxPerDay = this.dragState.containerWidth / totalDays;

    const daysShift = Math.round(deltaX / pxPerDay);

    if (this.dragState.mode === 'move') {
      const newStart = parseLocalDate(this.dragState.initialStart);
      newStart.setDate(newStart.getDate() + daysShift);

      const durationMs = (this.dragState.initialEnd - this.dragState.initialStart);
      const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + durationDays);

      this.dragState.task.startDate = getLocalDateStr(newStart);
      this.dragState.task.endDate = getLocalDateStr(newEnd);
    } else if (this.dragState.mode === 'resize') {
      const newEnd = parseLocalDate(this.dragState.initialEnd);
      newEnd.setDate(newEnd.getDate() + daysShift);

      const startDate = parseLocalDate(this.dragState.task.startDate);
      if (newEnd >= startDate) {
        this.dragState.task.endDate = getLocalDateStr(newEnd);
      }
    }

    this.renderProjects();
    this.renderDependencies();
  }

  handleMouseUp() {
    if (this.isResizingSidebar) {
      this.isResizingSidebar = false;
      this.sidebarResizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('gantt_sidebar_width', this.sidebarWidth);
      this.render();
      return;
    }

    if (this.dragState) {
      this.saveProjects();
      this.dragState = null;
    }
  }

  // --- Task Predecessors SVG Lines Renderer ---
  renderDependencies() {
    this.dependencySvg.innerHTML = `
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--primary-accent)" />
        </marker>
      </defs>
    `;
    const bodyRect = this.projectsContainer.getBoundingClientRect();

    this.projects.forEach(proj => {
      if (this.collapsedProjects.has(proj.id)) return;

      proj.tasks.forEach(task => {
        if (!task.predecessorId) return;

        let predTask = null;
        let predProjId = null;
        this.projects.forEach(p => {
          const found = p.tasks.find(t => t.id === task.predecessorId);
          if (found) {
            predTask = found;
            predProjId = p.id;
          }
        });

        if (!predTask || this.collapsedProjects.has(predProjId)) return;

        const predRow = document.querySelector(`[data-task-id="${predTask.id}"]`);
        const currRow = document.querySelector(`[data-task-id="${task.id}"]`);

        if (!predRow || !currRow) return;

        const predTrack = predRow.querySelector('.capsule-track, .milestone-wrapper');
        const currTrack = currRow.querySelector('.capsule-track, .milestone-wrapper');

        if (!predTrack || !currTrack) return;

        const predRect = predTrack.getBoundingClientRect();
        const currRect = currTrack.getBoundingClientRect();

        const x1 = predRect.right - bodyRect.left;
        const y1 = predRect.top + predRect.height / 2 - bodyRect.top;

        const x2 = currRect.left - bodyRect.left;
        const y2 = currRect.top + currRect.height / 2 - bodyRect.top;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const d = this.getConnectorPath(x1, y1, x2, y2);

        path.setAttribute("d", d);
        path.setAttribute("class", "dependency-path");
        path.setAttribute("marker-end", "url(#arrowhead)");
        this.dependencySvg.appendChild(path);
      });
    });
  }

  // --- Tooltip ---
  showTooltip(e, task, projectName, isOverdue) {
    const duration = Math.max(1, Math.round((parseLocalDate(task.endDate) - parseLocalDate(task.startDate)) / (1000 * 60 * 60 * 24)) + 1);

    let depHtml = '';
    if (task.predecessorId) {
      let predTask = null;
      this.projects.forEach(p => {
        const found = p.tasks.find(t => t.id === task.predecessorId);
        if (found) predTask = found;
      });
      if (predTask) {
        depHtml = `<div class="tooltip-dep">🔗 Predecessora: <strong>"${predTask.name}"</strong></div>`;
      }
    }

    this.tooltip.innerHTML = `
      <strong>${task.isMilestone ? '◆ MARCO: ' : ''}${task.name}</strong>
      <div style="font-size: 0.75rem; opacity: 0.8; margin-bottom: 4px;">Projeto: ${projectName}</div>
      <div>Período: ${task.startDate.split('-').reverse().join('/')} até ${task.endDate.split('-').reverse().join('/')} (${task.isMilestone ? '0 dias' : `${duration} dias`})</div>
      <div>Progresso: ${task.progress}% ${isOverdue ? '<span style="color:#ff4757; font-weight:800;">(⚠️ Atrasado)</span>' : `(${task.status})`}</div>
      ${depHtml}
    `;
    this.tooltip.classList.add('visible');
    this.moveTooltip(e);
  }

  moveTooltip(e) {
    this.tooltip.style.left = `${e.clientX + 14}px`;
    this.tooltip.style.top = `${e.clientY + 14}px`;
  }

  hideTooltip() {
    this.tooltip.classList.remove('visible');
  }

  updateProgressBubblesHighlight(val) {
    document.querySelectorAll('.btn-progress-bubble').forEach(b => {
      b.classList.toggle('active', Number(b.getAttribute('data-val')) === Number(val));
    });
  }

  // --- Modals Operations ---
  openProjectModal(projId = null) {
    this.projectForm.reset();
    if (projId) {
      const proj = this.projects.find(p => p.id === projId);
      if (proj) {
        document.getElementById('projectModalTitle').textContent = 'Editar Projeto';
        document.getElementById('projectId').value = proj.id;
        document.getElementById('projectName').value = proj.name;
        this.selectedTheme = proj.theme || 'orange';
        document.querySelectorAll('#themePicker .color-option').forEach(s => {
          s.classList.toggle('selected', s.getAttribute('data-color') === this.selectedTheme);
        });
      }
    } else {
      document.getElementById('projectModalTitle').textContent = 'Novo Projeto';
      document.getElementById('projectId').value = '';
      this.selectedTheme = 'orange';
      document.querySelectorAll('#themePicker .color-option').forEach(s => {
        s.classList.toggle('selected', s.getAttribute('data-color') === 'orange');
      });
    }
    this.projectModal.classList.add('active');
  }

  closeProjectModal() {
    this.projectModal.classList.remove('active');
  }

  handleProjectSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('projectId').value;
    const name = document.getElementById('projectName').value.trim();

    if (!name) return;

    if (id) {
      const proj = this.projects.find(p => p.id === id);
      if (proj) {
        proj.name = name;
        proj.theme = this.selectedTheme;
      }
    } else {
      const newProj = {
        id: 'proj-' + Date.now(),
        name: name,
        theme: this.selectedTheme,
        tasks: []
      };
      this.projects.push(newProj);
    }

    this.saveProjects();
    this.closeProjectModal();
  }

  deleteProject(projId) {
    if (confirm('Excluir este projeto e todas as suas tarefas?')) {
      this.projects = this.projects.filter(p => p.id !== projId);
      this.saveProjects();
    }
  }

  removePredecessor(targetTaskId) {
    this.projects.forEach(p => {
      const t = p.tasks.find(tk => tk.id === targetTaskId);
      if (t) t.predecessorId = null;
    });
    this.saveProjects();
    if (this.taskModal.classList.contains('active')) {
      const currTaskId = document.getElementById('taskId').value;
      const currProjId = this.taskProjectSelect.value;
      if (currTaskId) this.openTaskModal(currProjId, currTaskId);
    }
  }

  openTaskModal(projId = null, taskId = null) {
    this.taskForm.reset();

    // Populate Projects Select
    this.taskProjectSelect.innerHTML = '';
    this.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      this.taskProjectSelect.appendChild(opt);
    });

    if (projId) this.taskProjectSelect.value = projId;

    // Populate Predecessors Select (+ Vincular Predecessora)
    this.taskPredecessorSelect.innerHTML = '<option value="">+ Vincular Predecessora...</option>';
    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        if (t.id !== taskId) {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${p.name} ➔ ${t.name}`;
          this.taskPredecessorSelect.appendChild(opt);
        }
      });
    });

    // Populate Successors Select (+ Vincular Sucessora)
    const taskAddSuccessorSelect = document.getElementById('taskAddSuccessorSelect');
    taskAddSuccessorSelect.innerHTML = '<option value="">+ Vincular Sucessora...</option>';
    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        if (t.id !== taskId) {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${p.name} ➔ ${t.name}`;
          taskAddSuccessorSelect.appendChild(opt);
        }
      });
    });

    // Change Handlers for Instant Linking
    this.taskPredecessorSelect.onchange = (e) => {
      const selectedPredId = e.target.value;
      const currentTaskId = document.getElementById('taskId').value;
      if (currentTaskId && selectedPredId) {
        this.projects.forEach(p => {
          const t = p.tasks.find(tk => tk.id === currentTaskId);
          if (t) t.predecessorId = selectedPredId;
        });
        this.saveProjects();
        const currProjId = this.taskProjectSelect.value;
        this.openTaskModal(currProjId, currentTaskId);
      }
    };

    taskAddSuccessorSelect.onchange = (e) => {
      const selectedSuccId = e.target.value;
      const currentTaskId = document.getElementById('taskId').value;
      if (currentTaskId && selectedSuccId) {
        this.projects.forEach(p => {
          const t = p.tasks.find(tk => tk.id === selectedSuccId);
          if (t) t.predecessorId = currentTaskId;
        });
        this.saveProjects();
        const currProjId = this.taskProjectSelect.value;
        this.openTaskModal(currProjId, currentTaskId);
      }
    };

    const predContainer = document.getElementById('predecessorChipContainer');
    const succContainer = document.getElementById('successorsChipContainer');

    if (projId && taskId) {
      const proj = this.projects.find(p => p.id === projId);
      const task = proj ? proj.tasks.find(t => t.id === taskId) : null;
      if (task) {
        document.getElementById('taskEditorHeaderTitle').textContent = 'Editar Tarefa';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskName').value = task.name;
        document.getElementById('taskStartDate').value = getLocalDateStr(task.startDate);
        document.getElementById('taskEndDate').value = getLocalDateStr(task.endDate);
        document.getElementById('taskPredecessorSelect').value = task.predecessorId || '';
        document.getElementById('taskProgress').value = task.progress;
        document.getElementById('progressValBadge').textContent = `${task.progress}%`;
        this.updateProgressBubblesHighlight(task.progress);
        document.getElementById('taskStatus').value = task.status || 'A Fazer';
        this.taskIsMilestone.checked = !!task.isMilestone;
        this.btnDeleteTaskModal.style.display = 'inline-flex';

        // Render Active Predecessor Chip (Predecessora)
        if (task.predecessorId) {
          let predTask = null;
          this.projects.forEach(p => {
            const found = p.tasks.find(t => t.id === task.predecessorId);
            if (found) predTask = found;
          });
          if (predTask) {
            predContainer.innerHTML = `
              <div class="dep-badge-unlink">
                <span>🔗 ${predTask.name}</span>
                <button type="button" class="btn-unlink" title="Desvincular Predecessora" onclick="app.removePredecessor('${task.id}')"><i data-lucide="x" style="width: 12px; height: 12px;"></i></button>
              </div>
            `;
          } else {
            predContainer.innerHTML = `<span class="no-dep-text">Nenhuma dependência registrada</span>`;
          }
        } else {
          predContainer.innerHTML = `<span class="no-dep-text">Nenhuma dependência registrada</span>`;
        }

        // Render Active Successor Chips (Sucessoras)
        const successors = [];
        this.projects.forEach(p => {
          p.tasks.forEach(t => {
            if (t.predecessorId === taskId) successors.push(t);
          });
        });

        if (successors.length > 0) {
          succContainer.innerHTML = successors.map(s => `
            <div class="dep-badge-unlink">
              <span>➔ ${s.name}</span>
              <button type="button" class="btn-unlink" title="Desvincular Sucessora" onclick="app.removePredecessor('${s.id}')"><i data-lucide="x" style="width: 12px; height: 12px;"></i></button>
            </div>
          `).join('');
        } else {
          succContainer.innerHTML = `<span class="no-dep-text">Nenhuma dependência registrada</span>`;
        }
      }
    } else {
      document.getElementById('taskEditorHeaderTitle').textContent = 'Nova Tarefa';
      document.getElementById('taskId').value = '';
      document.getElementById('taskName').value = '';
      document.getElementById('taskStartDate').value = this.todayStr;
      document.getElementById('taskEndDate').value = getRelativeDateStr(7);
      document.getElementById('taskProgress').value = 0;
      document.getElementById('progressValBadge').textContent = '0%';
      this.updateProgressBubblesHighlight(0);
      document.getElementById('taskStatus').value = 'A Fazer';
      this.taskIsMilestone.checked = false;
      this.btnDeleteTaskModal.style.display = 'none';

      predContainer.innerHTML = `<span class="no-dep-text">Nenhuma dependência de origem</span>`;
      succContainer.innerHTML = `<span class="no-dep-text">Nenhuma dependência de destino</span>`;
    }

    this.taskIsMilestone.dispatchEvent(new Event('change'));
    this.taskModal.classList.add('active');
    lucide.createIcons();
    setTimeout(() => document.getElementById('taskName').focus(), 100);
  }

  closeTaskModal() {
    this.taskModal.classList.remove('active');
  }

  handleTaskSubmit(e) {
    e.preventDefault();
    const projId = this.taskProjectSelect.value;
    const taskId = document.getElementById('taskId').value;
    const name = document.getElementById('taskName').value.trim();
    const startDate = getLocalDateStr(document.getElementById('taskStartDate').value);
    const isMilestone = this.taskIsMilestone.checked;
    const endDate = isMilestone ? startDate : getLocalDateStr(document.getElementById('taskEndDate').value);
    const predecessorId = document.getElementById('taskPredecessorSelect').value;
    const progress = Number(document.getElementById('taskProgress').value);
    const status = document.getElementById('taskStatus').value;

    if (!name || !startDate || !endDate || !projId) return;

    const proj = this.projects.find(p => p.id === projId);
    if (!proj) return;

    if (taskId) {
      const task = proj.tasks.find(t => t.id === taskId);
      if (task) {
        task.name = name;
        task.startDate = startDate;
        task.endDate = endDate;
        task.predecessorId = predecessorId;
        task.progress = progress;
        task.status = status;
        task.isMilestone = isMilestone;
      }
    } else {
      const newTask = {
        id: 'task-' + Date.now(),
        name,
        startDate,
        endDate,
        predecessorId,
        progress,
        status,
        isMilestone
      };
      proj.tasks.push(newTask);
    }

    this.saveProjects();
    this.closeTaskModal();
  }

  deleteTask(projId, taskId) {
    if (confirm('Excluir esta tarefa?')) {
      const proj = this.projects.find(p => p.id === projId);
      if (proj) {
        proj.tasks = proj.tasks.filter(t => t.id !== taskId);
        this.saveProjects();
      }
    }
  }
}

// Initialize Global Instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new GanttApp();
});
