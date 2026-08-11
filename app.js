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
    if (isNaN(dateInput.getTime())) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }
  const str = String(dateInput).trim();
  if (str.includes('/')) {
    const parts = str.split('/').map(Number);
    if (parts.length === 3) {
      if (parts[2] > 1000) return new Date(parts[2], parts[1] - 1, parts[0], 0, 0, 0, 0);
      if (parts[0] > 1000) return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    }
  }
  const isoStr = str.slice(0, 10);
  const parts = isoStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
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

  // --- Storage & Automatic Legacy Migration ---
  loadProjects() {
    const keysToTry = [
      'gantt_projects_data_v5',
      'gantt_projects_data_v4',
      'gantt_projects_data_v3',
      'gantt_projects_data_v2',
      'gantt_projects_data',
      'gantt_projects'
    ];

    for (const key of keysToTry) {
      const saved = localStorage.getItem(key);
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
            localStorage.setItem('gantt_projects_data_v5', JSON.stringify(data));
            return data;
          }
        } catch (e) { console.error(`Error loading key ${key}:`, e); }
      }
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

    this.btnToggleCPM = document.getElementById('btnToggleCPM');
    this.btnSaveBaseline = document.getElementById('btnSaveBaseline');
    this.btnOpenSCurve = document.getElementById('btnOpenSCurve');

    // S-Curve Modal
    this.scurveModal = document.getElementById('scurveModal');
    this.btnCloseSCurve = document.getElementById('btnCloseSCurve');
    this.btnCloseSCurveFooter = document.getElementById('btnCloseSCurveFooter');

    // Drawer
    this.taskDetailsDrawer = document.getElementById('taskDetailsDrawer');
    this.btnCloseDrawer = document.getElementById('btnCloseDrawer');
    this.btnCancelDrawer = document.getElementById('btnCancelDrawer');
    this.btnSaveDrawer = document.getElementById('btnSaveDrawer');
    this.btnAddChecklistItem = document.getElementById('btnAddChecklistItem');
    this.inputNewChecklistItem = document.getElementById('inputNewChecklistItem');

    // Export Dropdown
    this.exportDropdownWrapper = document.querySelector('.export-dropdown-wrapper');
    this.btnExportMenu = document.getElementById('btnExportMenu');
    this.btnExportPNG = document.getElementById('btnExportPNG');
    this.btnExportPDF = document.getElementById('btnExportPDF');
    this.btnExportJSON = document.getElementById('btnExportJSON');
    this.btnImportJSON = document.getElementById('btnImportJSON');
    this.inputImportJSON = document.getElementById('inputImportJSON');

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
    // App Sidebar Navigation Page Switching
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const pageId = btn.getAttribute('data-page');
        if (pageId) this.switchPage(pageId);
      });
    });

    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        const sidebar = document.getElementById('appSidebar');
        sidebar.classList.toggle('collapsed');
      });
    }

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
    if (this.btnExportJSON) {
      this.btnExportJSON.addEventListener('click', () => this.exportAsJSON());
    }
    if (this.btnImportJSON) {
      this.btnImportJSON.addEventListener('click', () => this.inputImportJSON.click());
    }
    if (this.inputImportJSON) {
      this.inputImportJSON.addEventListener('change', (e) => this.importFromJSON(e));
    }

    // Phase 1 Toolbar Buttons
    if (this.btnToggleCPM) {
      this.btnToggleCPM.addEventListener('click', () => {
        this.showCPM = !this.showCPM;
        this.btnToggleCPM.classList.toggle('active', this.showCPM);
        this.render();
      });
    }

    if (this.btnSaveBaseline) {
      this.btnSaveBaseline.addEventListener('click', () => this.saveBaseline());
    }

    if (this.btnOpenSCurve) {
      this.btnOpenSCurve.addEventListener('click', () => this.openSCurveModal());
    }

    if (this.btnCloseSCurve) {
      this.btnCloseSCurve.addEventListener('click', () => this.scurveModal.classList.remove('active'));
    }
    if (this.btnCloseSCurveFooter) {
      this.btnCloseSCurveFooter.addEventListener('click', () => this.scurveModal.classList.remove('active'));
    }

    if (this.btnCloseDrawer) {
      this.btnCloseDrawer.addEventListener('click', () => this.closeTaskDrawer());
    }
    if (this.btnCancelDrawer) {
      this.btnCancelDrawer.addEventListener('click', () => this.closeTaskDrawer());
    }
    if (this.btnSaveDrawer) {
      this.btnSaveDrawer.addEventListener('click', () => this.saveTaskDrawer());
    }
    if (this.btnAddChecklistItem) {
      this.btnAddChecklistItem.addEventListener('click', () => this.addChecklistItem());
    }
    if (this.inputNewChecklistItem) {
      this.inputNewChecklistItem.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addChecklistItem();
        }
      });
    }

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
      this.viewOffsetDays -= (this.viewMode === 'weeks' ? 28 : (this.viewMode === 'months' ? 90 : 7));
      this.render();
    });

    document.getElementById('btnNavNext').addEventListener('click', () => {
      this.viewOffsetDays += (this.viewMode === 'weeks' ? 28 : (this.viewMode === 'months' ? 90 : 7));
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

  exportAsJSON() {
    this.exportDropdownWrapper.classList.remove('active');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.projects, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Backup_Gantt_Projetos_${getLocalDateStr(new Date())}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  importFromJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (Array.isArray(data) && data.length > 0) {
          this.projects = data;
          this.saveProjects();
          alert('✅ Backup de projetos restaurado com sucesso!');
        } else {
          alert('⚠️ O arquivo JSON selecionado é inválido ou está vazio.');
        }
      } catch (err) {
        console.error(err);
        alert('❌ Erro ao ler o arquivo JSON. Certifique-se de ser um backup válido do Gantt.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // --- Bounds Calculation & Navigation ---
  calculateBounds() {
    this.todayDate = parseLocalDate(new Date());
    this.todayStr = getLocalDateStr(this.todayDate);

    let baseStart = parseLocalDate(this.todayDate);

    if (this.viewMode === 'months') {
      baseStart.setDate(1);
      baseStart.setMonth(baseStart.getMonth() - 2 + Math.floor(this.viewOffsetDays / 30));
      let baseEnd = new Date(baseStart);
      baseEnd.setMonth(baseEnd.getMonth() + 12);
      baseEnd.setDate(baseEnd.getDate() - 1);

      this.timelineStart = baseStart;
      this.timelineEnd = baseEnd;
      document.documentElement.style.setProperty('--day-min-width', '4px');
    } else if (this.viewMode === 'weeks') {
      baseStart.setDate(baseStart.getDate() - 14 + this.viewOffsetDays);
      const dayOfWeek = baseStart.getDay();
      const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
      baseStart.setDate(baseStart.getDate() + diffToMon);

      let baseEnd = new Date(baseStart);
      baseEnd.setDate(baseEnd.getDate() + 83); // 84 days (12 full weeks)

      this.timelineStart = baseStart;
      this.timelineEnd = baseEnd;

      document.documentElement.style.setProperty('--day-min-width', '15px');
    } else {
      baseStart.setDate(baseStart.getDate() - 5 + this.viewOffsetDays);

      let baseEnd = new Date(baseStart);
      baseEnd.setDate(baseEnd.getDate() + 25);

      this.timelineStart = baseStart;
      this.timelineEnd = baseEnd;

      document.documentElement.style.setProperty('--day-min-width', '46px');
    }

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
    this.calculateCriticalPath();
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
    const weekdaysShort = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

    if (this.viewMode === 'months') {
      let currentMonthDays = [];
      days.forEach((day, idx) => {
        currentMonthDays.push(day);
        const isLastDay = idx === days.length - 1 || (idx < days.length - 1 && days[idx + 1].getMonth() !== day.getMonth());
        if (isLastDay) {
          const monthName = currentMonthDays[0].toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
          const cell = document.createElement('div');
          cell.className = 'date-cell month-cell';
          cell.style.flex = currentMonthDays.length;
          cell.style.minWidth = `calc(var(--day-min-width, 4px) * ${currentMonthDays.length})`;
          cell.innerHTML = `
            <div style="font-weight:800; text-transform:capitalize;">${monthName}</div>
            <div class="month-sub">${currentMonthDays.length}d</div>
          `;
          this.datesHeader.appendChild(cell);
          currentMonthDays = [];
        }
      });
    } else if (this.viewMode === 'weeks') {
      let currentWeekDays = [];
      days.forEach((day, idx) => {
        currentWeekDays.push(day);
        if (day.getDay() === 0 || idx === days.length - 1) {
          const startStr = `${currentWeekDays[0].getDate()}/${currentWeekDays[0].toLocaleDateString('pt-BR', { month: 'short' })}`;
          const endStr = `${currentWeekDays[currentWeekDays.length - 1].getDate()}/${currentWeekDays[currentWeekDays.length - 1].toLocaleDateString('pt-BR', { month: 'short' })}`;

          const cell = document.createElement('div');
          cell.className = 'date-cell week-cell';
          cell.style.flex = currentWeekDays.length;
          cell.style.minWidth = `calc(var(--day-min-width, 15px) * ${currentWeekDays.length})`;
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
        const weekdayStr = weekdaysShort[day.getDay()];
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;

        const cell = document.createElement('div');
        cell.className = `date-cell ${isToday ? 'is-today' : ''} ${isWeekend ? 'is-weekend' : ''}`;
        cell.innerHTML = `
          <div class="weekday-sub">${weekdayStr}</div>
          <div class="day-num">${dayNum}</div>
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
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      const isWeekBoundary = (this.viewMode === 'weeks' && (day.getDay() === 0 || idx === days.length - 1));
      const col = document.createElement('div');
      col.className = `grid-col ${isToday ? 'is-today-col' : ''} ${isWeekend ? 'is-weekend-col' : ''} ${isWeekBoundary ? 'is-week-boundary' : ''}`;
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
          <div class="row-drag-handle" title="Arrastar para reordenar hierarquia" draggable="true">
            <i data-lucide="grip-vertical" style="width: 14px; height: 14px;"></i>
          </div>
          <i data-lucide="corner-down-right" style="width: 14px; height: 14px; color: var(--text-muted); margin-left: 8px;"></i>
          <span class="task-name" title="${task.name}" style="margin-left: 6px;">${task.name}</span>
          <span class="task-duration-badge">${durationText}</span>
          <div class="task-actions-inline" onclick="event.stopPropagation()">
            <button class="icon-btn-sm" title="Detalhes da Tarefa" onclick="app.openTaskDrawer('${proj.id}', '${task.id}')"><i data-lucide="file-text"></i></button>
            <button class="icon-btn-sm" title="Editar Tarefa" onclick="app.openTaskModal('${proj.id}', '${task.id}')"><i data-lucide="edit-3"></i></button>
            <button class="icon-btn-sm" title="Excluir Tarefa" onclick="app.deleteTask('${proj.id}', '${task.id}')"><i data-lucide="trash"></i></button>
          </div>
        `;

        sidebarItem.addEventListener('dblclick', () => this.openTaskDrawer(proj.id, task.id));

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

        // Render Baseline Bar if Baseline Data Exists
        if (task.baselineStart && task.baselineEnd) {
          const bStart = parseLocalDate(task.baselineStart);
          const bEnd = parseLocalDate(task.baselineEnd);
          if (bEnd >= firstTimelineDate && bStart <= lastTimelineDate) {
            const effBStart = bStart < firstTimelineDate ? firstTimelineDate : bStart;
            const effBEnd = bEnd > lastTimelineDate ? lastTimelineDate : bEnd;
            const bStartDiff = Math.max(0, Math.round((effBStart - firstTimelineDate) / (1000 * 60 * 60 * 24)));
            const bDuration = Math.max(1, Math.round((effBEnd - effBStart) / (1000 * 60 * 60 * 24)) + 1);
            const bLeftPct = (bStartDiff / totalDays) * 100;
            const bWidthPct = (bDuration / totalDays) * 100;

            const baselineBar = document.createElement('div');
            baselineBar.className = 'baseline-bar';
            baselineBar.style.left = `${bLeftPct}%`;
            baselineBar.style.width = `${bWidthPct}%`;
            timelineCell.appendChild(baselineBar);
          }
        }

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

        const isCritical = this.showCPM && task.isCritical;

        if (task.isMilestone) {
          const centerPct = ((startDiffDays + 0.5) / totalDays) * 100;
          const wrapper = document.createElement('div');
          wrapper.className = `milestone-wrapper ${isCritical ? 'is-critical-path' : ''}`;
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
          capsuleTrack.className = `capsule-track ${isCritical ? 'is-critical-path' : ''}`;
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

          const dayPx = this.viewMode === 'weeks' ? 15 : 46;
          const estimatedPxWidth = durationDays * dayPx;
          const isShortCapsule = estimatedPxWidth < 120 || widthPct < 8;

          if (isShortCapsule) {
            // Render Status & Percent Pill together OUTSIDE for short capsules
            const statusMeta = document.createElement('div');
            statusMeta.className = 'status-meta-group outside';
            const isCompleted = task.progress >= 100 || task.status === 'Concluído';
            const pillHtml = `<span class="capsule-percent-pill outside-pill ${isCompleted ? 'completed' : ''}">${isCompleted ? '✓ 100%' : `${task.progress}%`}</span>`;

            if (estimatedPxWidth < 50) {
              statusMeta.innerHTML = pillHtml;
            } else if (isOverdue) {
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
    const gap = 14;
    // Offset for arrowhead
    const destX = x2 - 4; 
    
    if (destX > x1 + gap) {
      // Forward path: out right, down/up, right into target
      const midX = x1 + (destX - x1) / 2;
      return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${destX} ${y2}`;
    } else {
      // Backward path: out right, down/up, left, down/up, right into target
      const midY = y1 + (y2 - y1) / 2;
      return `M ${x1} ${y1} L ${x1 + gap} ${y1} L ${x1 + gap} ${midY} L ${destX - gap} ${midY} L ${destX - gap} ${y2} L ${destX} ${y2}`;
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
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--text-muted)" />
        </marker>
        <marker id="arrowhead-hover" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
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

  // --- Phase 1: Critical Path Method (CPM) ---
  calculateCriticalPath() {
    let allTasks = [];
    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        t.isCritical = false;
        const s = parseLocalDate(t.startDate || getLocalDateStr(new Date()));
        const e = parseLocalDate(t.endDate || t.startDate);
        const dur = Math.max(1, Math.round((e - s) / 86400000) + 1);
        allTasks.push({
          id: t.id,
          taskObj: t,
          dur: dur,
          predecessorId: t.predecessorId,
          es: 0,
          ef: 0,
          ls: Infinity,
          lf: Infinity,
          slack: 0
        });
      });
    });

    const taskMap = new Map(allTasks.map(t => [t.id, t]));

    // Forward Pass
    let maxEF = 0;
    allTasks.forEach(t => {
      if (t.predecessorId && taskMap.has(t.predecessorId)) {
        const pred = taskMap.get(t.predecessorId);
        t.es = pred.ef;
      } else {
        t.es = 0;
      }
      t.ef = t.es + t.dur;
      if (t.ef > maxEF) maxEF = t.ef;
    });

    // Backward Pass
    allTasks.forEach(t => {
      const isPredecessorOfAny = allTasks.some(other => other.predecessorId === t.id);
      if (!isPredecessorOfAny) {
        t.lf = maxEF;
        t.ls = t.lf - t.dur;
      }
    });

    for (let i = allTasks.length - 1; i >= 0; i--) {
      const t = allTasks[i];
      const successors = allTasks.filter(other => other.predecessorId === t.id);
      if (successors.length > 0) {
        t.lf = Math.min(...successors.map(succ => succ.ls));
        t.ls = t.lf - t.dur;
      }
      t.slack = Math.max(0, t.lf - t.ef);
      if (t.slack === 0 && maxEF > 0) {
        t.taskObj.isCritical = true;
      }
    }
  }

  // --- Phase 1: Linha de Base (Baseline) ---
  saveBaseline() {
    let count = 0;
    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        t.baselineStart = t.startDate;
        t.baselineEnd = t.endDate;
        t.baselineProgress = t.progress || 0;
        count++;
      });
    });
    this.saveProjects();
    alert(`✅ Linha de Base (Baseline) salva com sucesso para ${count} tarefas!`);
  }

  // --- Phase 1: Curva S (% Planejado Baseline vs % Realizado) ---
  openSCurveModal() {
    const days = this.getDaysArray();
    if (days.length === 0) return;

    let totalPlannedWork = 0;
    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        const s = parseLocalDate(t.baselineStart || t.startDate);
        const e = parseLocalDate(t.baselineEnd || t.endDate);
        const dur = Math.max(1, Math.round((e - s) / 86400000) + 1);
        totalPlannedWork += dur;
      });
    });

    if (totalPlannedWork === 0) totalPlannedWork = 1;

    const plannedData = [];
    const realizedData = [];

    days.forEach(dayDate => {
      const dayStr = getLocalDateStr(dayDate);
      let plannedSum = 0;
      let realizedSum = 0;

      this.projects.forEach(p => {
        p.tasks.forEach(t => {
          const bStart = parseLocalDate(t.baselineStart || t.startDate);
          const bEnd = parseLocalDate(t.baselineEnd || t.endDate);
          const bDur = Math.max(1, Math.round((bEnd - bStart) / 86400000) + 1);

          if (dayDate >= bEnd) {
            plannedSum += bDur;
          } else if (dayDate >= bStart) {
            const elapsed = Math.round((dayDate - bStart) / 86400000) + 1;
            plannedSum += elapsed;
          }

          if (dayStr <= this.todayStr) {
            const rStart = parseLocalDate(t.startDate);
            const rEnd = parseLocalDate(t.endDate);
            const rDur = Math.max(1, Math.round((rEnd - rStart) / 86400000) + 1);

            if (dayDate >= rEnd) {
              realizedSum += rDur * ((t.progress || 0) / 100);
            } else if (dayDate >= rStart) {
              const elapsed = Math.round((dayDate - rStart) / 86400000) + 1;
              const ratio = Math.min(1, elapsed / rDur);
              realizedSum += rDur * Math.min(ratio, (t.progress || 0) / 100);
            }
          }
        });
      });

      const pPct = Math.min(100, Math.round((plannedSum / totalPlannedWork) * 100));
      plannedData.push({ dateStr: dayStr, pct: pPct });

      if (dayStr <= this.todayStr) {
        const rPct = Math.min(100, Math.round((realizedSum / totalPlannedWork) * 100));
        realizedData.push({ dateStr: dayStr, pct: rPct });
      }
    });

    const todayPlanned = plannedData.find(d => d.dateStr === this.todayStr) || plannedData[plannedData.length - 1];
    const todayRealized = realizedData[realizedData.length - 1] || { pct: 0 };

    const pVal = todayPlanned ? todayPlanned.pct : 0;
    const rVal = todayRealized ? todayRealized.pct : 0;
    const vVal = rVal - pVal;

    document.getElementById('scurvePlannedVal').textContent = `${pVal}%`;
    document.getElementById('scurveRealizedVal').textContent = `${rVal}%`;
    const vElem = document.getElementById('scurveVarianceVal');
    vElem.textContent = `${vVal >= 0 ? '+' : ''}${vVal}%`;
    vElem.style.color = vVal >= 0 ? '#2ed573' : '#ff4757';

    this.renderSCurveSVG(plannedData, realizedData);
    this.scurveModal.classList.add('active');
  }

  renderSCurveSVG(plannedData, realizedData) {
    const svg = document.getElementById('scurveSvg');
    svg.innerHTML = '';
    const width = 840;
    const height = 280;
    const p = { top: 20, right: 20, bottom: 30, left: 40 };

    const cW = width - p.left - p.right;
    const cH = height - p.top - p.bottom;
    const n = plannedData.length;
    if (n === 0) return;

    // Grid lines
    [0, 25, 50, 75, 100].forEach(level => {
      const y = p.top + cH - (level / 100) * cH;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p.left);
      line.setAttribute('y1', y);
      line.setAttribute('x2', p.left + cW);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', 'var(--border-color)');
      line.setAttribute('stroke-dasharray', '4 4');
      svg.appendChild(line);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', p.left - 6);
      label.setAttribute('y', y + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('font-size', '10');
      label.setAttribute('fill', 'var(--text-muted)');
      label.textContent = `${level}%`;
      svg.appendChild(label);
    });

    // Planned Path (Blue)
    const pPoints = plannedData.map((d, i) => {
      const x = p.left + (i / Math.max(1, n - 1)) * cW;
      const y = p.top + cH - (d.pct / 100) * cH;
      return `${x},${y}`;
    }).join(' ');

    const pPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pPath.setAttribute('d', `M ${pPoints}`);
    pPath.setAttribute('fill', 'none');
    pPath.setAttribute('stroke', 'var(--apple-blue)');
    pPath.setAttribute('stroke-width', '3');
    pPath.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(pPath);

    // Realized Path (Green)
    if (realizedData.length > 0) {
      const rPoints = realizedData.map((d, i) => {
        const x = p.left + (i / Math.max(1, n - 1)) * cW;
        const y = p.top + cH - (d.pct / 100) * cH;
        return `${x},${y}`;
      }).join(' ');

      const rPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      rPath.setAttribute('d', `M ${rPoints}`);
      rPath.setAttribute('fill', 'none');
      rPath.setAttribute('stroke', '#2ed573');
      rPath.setAttribute('stroke-width', '3.5');
      svg.appendChild(rPath);

      // Today Dot Marker
      const lastR = realizedData[realizedData.length - 1];
      const lastIdx = realizedData.length - 1;
      const tX = p.left + (lastIdx / Math.max(1, n - 1)) * cW;
      const tY = p.top + cH - (lastR.pct / 100) * cH;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', tX);
      circle.setAttribute('cy', tY);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#ff4757');
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    }
  }

  // --- Phase 1: Task Details Drawer ---
  openTaskDrawer(projId, taskId) {
    let targetTask = null;
    let projName = '';
    this.projects.forEach(p => {
      const found = p.tasks.find(t => t.id === taskId);
      if (found) {
        targetTask = found;
        projName = p.name;
      }
    });

    if (!targetTask) return;
    this.activeDrawerTask = targetTask;

    document.getElementById('drawerTaskType').textContent = targetTask.isMilestone ? '◆ MARCO' : 'TAREFA';
    document.getElementById('drawerTaskName').textContent = targetTask.name;
    document.getElementById('drawerProjectName').textContent = projName;
    document.getElementById('drawerTaskStatus').textContent = targetTask.status || 'A Fazer';
    document.getElementById('drawerTaskDates').textContent = `${targetTask.startDate} até ${targetTask.endDate}`;
    document.getElementById('drawerBaselineDates').textContent = targetTask.baselineStart ? `${targetTask.baselineStart} até ${targetTask.baselineEnd}` : 'Nenhuma gravada';
    document.getElementById('drawerAssignee').value = targetTask.assignee || '';
    document.getElementById('drawerCost').value = targetTask.cost || '';
    document.getElementById('drawerNotes').value = targetTask.notes || '';

    this.renderDrawerChecklist();
    this.taskDetailsDrawer.classList.add('visible');
  }

  renderDrawerChecklist() {
    const container = document.getElementById('drawerChecklistContainer');
    container.innerHTML = '';
    if (!this.activeDrawerTask) return;

    if (!this.activeDrawerTask.checklist) this.activeDrawerTask.checklist = [];

    this.activeDrawerTask.checklist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = `checklist-item ${item.done ? 'checked' : ''}`;
      row.innerHTML = `
        <input type="checkbox" ${item.done ? 'checked' : ''}>
        <span style="flex:1;">${item.title}</span>
        <button type="button" class="icon-btn-sm" onclick="app.removeChecklistItem(${idx})"><i data-lucide="trash-2"></i></button>
      `;

      row.querySelector('input').addEventListener('change', (e) => {
        item.done = e.target.checked;
        this.renderDrawerChecklist();
      });

      container.appendChild(row);
    });
    lucide.createIcons();
  }

  addChecklistItem() {
    const input = document.getElementById('inputNewChecklistItem');
    const title = input.value.trim();
    if (!title || !this.activeDrawerTask) return;

    if (!this.activeDrawerTask.checklist) this.activeDrawerTask.checklist = [];
    this.activeDrawerTask.checklist.push({ title, done: false });
    input.value = '';
    this.renderDrawerChecklist();
  }

  removeChecklistItem(idx) {
    if (!this.activeDrawerTask || !this.activeDrawerTask.checklist) return;
    this.activeDrawerTask.checklist.splice(idx, 1);
    this.renderDrawerChecklist();
  }

  closeTaskDrawer() {
    this.taskDetailsDrawer.classList.remove('visible');
    this.activeDrawerTask = null;
  }

  saveTaskDrawer() {
    if (!this.activeDrawerTask) return;
    this.activeDrawerTask.assignee = document.getElementById('drawerAssignee').value.trim();
    this.activeDrawerTask.cost = document.getElementById('drawerCost').value;
    this.activeDrawerTask.notes = document.getElementById('drawerNotes').value;
    this.saveProjects();
    this.closeTaskDrawer();
  }

  // --- SaaS Desktop App Page Navigation ---
  switchPage(pageId) {
    this.activePage = pageId;

    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetSec = document.getElementById(pageId);
    const navId = `nav${pageId.replace('page', '')}`;
    const targetNav = document.getElementById(navId);

    if (targetSec) targetSec.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    const breadcrumbMap = {
      pageGantt: 'Gráfico Gantt',
      pageSCurve: 'Curva S & Avanço',
      pageTaskList: 'Lista de Tarefas',
      pageProjects: 'Painel de Projetos',
      pageSettings: 'Configurações & Dados'
    };
    const breadcrumbElem = document.getElementById('pageBreadcrumb');
    if (breadcrumbElem) {
      breadcrumbElem.textContent = `Espaço / GTP - Coqueria / ${breadcrumbMap[pageId] || 'Gráfico Gantt'}`;
    }

    if (pageId === 'pageGantt') {
      this.render();
    } else if (pageId === 'pageSCurve') {
      this.renderFullSCurvePage();
    } else if (pageId === 'pageTaskList') {
      this.renderTaskListView();
    } else if (pageId === 'pageProjects') {
      this.renderProjectsGridView();
    }
    lucide.createIcons();
  }

  getAvatarHTML(name) {
    if (!name || name.trim() === '') return '-';
    const cleanName = name.trim();
    const initials = cleanName.substring(0, 2).toUpperCase();
    // Simple hash to pick a color
    const colors = ['#ff6b35', '#ff4757', '#e64980', '#ae3ec9', '#2f9e44', '#1c7ed6', '#f59f00', '#0ca678'];
    let hash = 0;
    for (let i = 0; i < cleanName.length; i++) {
      hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = colors[Math.abs(hash) % colors.length];
    return `<div class="avatar-circle" style="background:${color};" title="${cleanName}">${initials}</div>`;
  }

  getStatusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('atrasado')) return 'atrasado';
    if (s.includes('progresso')) return 'em-progresso';
    if (s.includes('conclu')) return 'concluido';
    return '';
  }

  renderTaskListView() {
    const container = document.getElementById('taskTableContainer');
    if (!container) return;

    let html = `
      <table class="task-master-table">
        <thead>
          <tr>
            <th>Tarefa</th>
            <th>Projeto</th>
            <th>Resp.</th>
            <th>Início</th>
            <th>Término</th>
            <th>Duração</th>
            <th>Status</th>
            <th>Progresso</th>
            <th>Predecessora</th>
            <th style="text-align:right;">Ações</th>
          </tr>
        </thead>
        <tbody>
    `;

    let totalCount = 0;
    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        totalCount++;
        const sDate = t.startDate || '-';
        const eDate = t.endDate || '-';
        const sDateObj = parseLocalDate(sDate);
        const eDateObj = parseLocalDate(eDate);
        const dur = Math.max(1, Math.round((eDateObj - sDateObj) / 86400000) + 1);
        const durText = t.isMilestone ? 'Marco' : `${dur}d`;

        let predName = '-';
        if (t.predecessorId) {
          this.projects.forEach(p2 => {
            const pred = p2.tasks.find(tk => tk.id === t.predecessorId);
            if (pred) predName = pred.name;
          });
        }

        const isCompleted = t.progress >= 100 || t.status === 'Concluído';

        html += `
          <tr>
            <td><strong>${t.name}</strong> ${t.isMilestone ? '<span class="drawer-badge">MARCO</span>' : ''}</td>
            <td><span class="tag" style="background:rgba(0,113,227,0.1); color:var(--apple-blue);">${p.name}</span></td>
            <td>${this.getAvatarHTML(t.assignee)}</td>
            <td>${sDate.split('-').reverse().join('/')}</td>
            <td>${eDate.split('-').reverse().join('/')}</td>
            <td>${durText}</td>
            <td><span class="status-badge ${this.getStatusClass(t.status)}">${t.status || 'A Fazer'}</span></td>
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="flex:1; height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">
                  <div style="width:${t.progress}%; height:100%; background:${isCompleted ? '#2ed573' : 'var(--apple-blue)'}"></div>
                </div>
                <span>${t.progress}%</span>
              </div>
            </td>
            <td>${predName}</td>
            <td style="text-align:right;">
              <div class="task-actions-table">
                <button class="icon-btn-sm" onclick="app.openTaskDrawer('${p.id}', '${t.id}')" title="Detalhes"><i data-lucide="file-text"></i></button>
                <button class="icon-btn-sm" onclick="app.openTaskModal('${p.id}', '${t.id}')" title="Editar"><i data-lucide="edit-3"></i></button>
                <button class="icon-btn-sm" onclick="app.deleteTask('${p.id}', '${t.id}')" title="Excluir"><i data-lucide="trash"></i></button>
              </div>
            </td>
          </tr>
        `;
      });
    });

    if (totalCount === 0) {
      html += `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">Nenhuma tarefa cadastrada.</td></tr>`;
    }

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  renderProjectsGridView() {
    const container = document.getElementById('projectsGridContainer');
    if (!container) return;

    container.innerHTML = '';
    this.projects.forEach(p => {
      const taskCount = p.tasks.length;
      let totalProg = 0;
      let overdueCount = 0;

      p.tasks.forEach(t => {
        totalProg += Number(t.progress || 0);
        if (t.status === 'Atrasado') overdueCount++;
      });

      const avgProg = taskCount > 0 ? Math.round(totalProg / taskCount) : 0;

      const card = document.createElement('div');
      card.className = 'project-summary-card';
      card.innerHTML = `
        <div class="project-summary-header">
          <h4>${p.name}</h4>
          <div class="task-actions-inline">
            <button class="icon-btn-sm" onclick="app.openProjectModal('${p.id}')" title="Editar Projeto"><i data-lucide="edit-3"></i></button>
            <button class="icon-btn-sm" onclick="app.deleteProject('${p.id}')" title="Excluir Projeto"><i data-lucide="trash"></i></button>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
          <span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Progresso Acumulado</span>
          <span style="font-size:1.2rem; font-weight:800; color:var(--apple-blue);">${avgProg}%</span>
        </div>

        <div style="width:100%; height:8px; background:var(--border-color); border-radius:4px; overflow:hidden;">
          <div style="width:${avgProg}%; height:100%; background:linear-gradient(90deg, var(--apple-blue), #2ed573);"></div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; font-size:0.8rem;">
          <div style="background:var(--bg-surface-hover); padding:10px; border-radius:8px;">
            <div style="color:var(--text-muted);">Total Atividades</div>
            <div style="font-size:1.1rem; font-weight:800;">${taskCount}</div>
          </div>
          <div style="background:var(--bg-surface-hover); padding:10px; border-radius:8px;">
            <div style="color:var(--text-muted);">Atrasadas</div>
            <div style="font-size:1.1rem; font-weight:800; color:${overdueCount > 0 ? '#ff4757' : 'var(--text-primary)'};">${overdueCount}</div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderFullSCurvePage() {
    const days = this.getDaysArray();
    if (days.length === 0) return;

    let totalPlannedWork = 0;
    this.projects.forEach(p => {
      p.tasks.forEach(t => {
        const s = parseLocalDate(t.baselineStart || t.startDate);
        const e = parseLocalDate(t.baselineEnd || t.endDate);
        const dur = Math.max(1, Math.round((e - s) / 86400000) + 1);
        totalPlannedWork += dur;
      });
    });

    if (totalPlannedWork === 0) totalPlannedWork = 1;

    const plannedData = [];
    const realizedData = [];

    days.forEach(dayDate => {
      const dayStr = getLocalDateStr(dayDate);
      let plannedSum = 0;
      let realizedSum = 0;

      this.projects.forEach(p => {
        p.tasks.forEach(t => {
          const bStart = parseLocalDate(t.baselineStart || t.startDate);
          const bEnd = parseLocalDate(t.baselineEnd || t.endDate);
          const bDur = Math.max(1, Math.round((bEnd - bStart) / 86400000) + 1);

          if (dayDate >= bEnd) {
            plannedSum += bDur;
          } else if (dayDate >= bStart) {
            const elapsed = Math.round((dayDate - bStart) / 86400000) + 1;
            plannedSum += elapsed;
          }

          if (dayStr <= this.todayStr) {
            const rStart = parseLocalDate(t.startDate);
            const rEnd = parseLocalDate(t.endDate);
            const rDur = Math.max(1, Math.round((rEnd - rStart) / 86400000) + 1);

            if (dayDate >= rEnd) {
              realizedSum += rDur * ((t.progress || 0) / 100);
            } else if (dayDate >= rStart) {
              const elapsed = Math.round((dayDate - rStart) / 86400000) + 1;
              const ratio = Math.min(1, elapsed / rDur);
              realizedSum += rDur * Math.min(ratio, (t.progress || 0) / 100);
            }
          }
        });
      });

      const pPct = Math.min(100, Math.round((plannedSum / totalPlannedWork) * 100));
      plannedData.push({ dateStr: dayStr, pct: pPct });

      if (dayStr <= this.todayStr) {
        const rPct = Math.min(100, Math.round((realizedSum / totalPlannedWork) * 100));
        realizedData.push({ dateStr: dayStr, pct: rPct });
      }
    });

    const todayPlanned = plannedData.find(d => d.dateStr === this.todayStr) || plannedData[plannedData.length - 1];
    const todayRealized = realizedData[realizedData.length - 1] || { pct: 0 };

    const pVal = todayPlanned ? todayPlanned.pct : 0;
    const rVal = todayRealized ? todayRealized.pct : 0;
    const vVal = rVal - pVal;

    const pElem = document.getElementById('fullScurvePlanned');
    const rElem = document.getElementById('fullScurveRealized');
    const vElem = document.getElementById('fullScurveVariance');

    if (pElem) pElem.textContent = `${pVal}%`;
    if (rElem) rElem.textContent = `${rVal}%`;
    if (vElem) {
      vElem.textContent = `${vVal >= 0 ? '+' : ''}${vVal}%`;
      vElem.style.color = vVal >= 0 ? '#2ed573' : '#ff4757';
    }

    const svg = document.getElementById('fullScurveSvg');
    if (!svg) return;

    svg.innerHTML = '';
    const width = 940;
    const height = 380;
    const p = { top: 20, right: 30, bottom: 40, left: 40 };

    const cW = width - p.left - p.right;
    const cH = height - p.top - p.bottom;
    const n = plannedData.length;
    if (n === 0) return;

    // Grid lines
    [0, 25, 50, 75, 100].forEach(level => {
      const y = p.top + cH - (level / 100) * cH;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p.left);
      line.setAttribute('y1', y);
      line.setAttribute('x2', p.left + cW);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', 'var(--border-color)');
      line.setAttribute('stroke-dasharray', '4 4');
      svg.appendChild(line);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', p.left - 8);
      label.setAttribute('y', y + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('font-size', '10');
      label.setAttribute('fill', 'var(--text-muted)');
      label.textContent = `${level}%`;
      svg.appendChild(label);
    });

    // Planned Path (Blue)
    const pPoints = plannedData.map((d, i) => {
      const x = p.left + (i / Math.max(1, n - 1)) * cW;
      const y = p.top + cH - (d.pct / 100) * cH;
      return `${x},${y}`;
    }).join(' ');

    const pPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pPath.setAttribute('d', `M ${pPoints}`);
    pPath.setAttribute('fill', 'none');
    pPath.setAttribute('stroke', 'var(--apple-blue)');
    pPath.setAttribute('stroke-width', '3');
    pPath.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(pPath);

    // Realized Path (Green)
    if (realizedData.length > 0) {
      const rPoints = realizedData.map((d, i) => {
        const x = p.left + (i / Math.max(1, n - 1)) * cW;
        const y = p.top + cH - (d.pct / 100) * cH;
        return `${x},${y}`;
      }).join(' ');

      const rPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      rPath.setAttribute('d', `M ${rPoints}`);
      rPath.setAttribute('fill', 'none');
      rPath.setAttribute('stroke', '#2ed573');
      rPath.setAttribute('stroke-width', '3.5');
      svg.appendChild(rPath);

      // Today Marker
      const lastIdx = realizedData.length - 1;
      const lastR = realizedData[lastIdx];
      const tX = p.left + (lastIdx / Math.max(1, n - 1)) * cW;
      const tY = p.top + cH - (lastR.pct / 100) * cH;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', tX);
      circle.setAttribute('cy', tY);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#ff4757');
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    }
  }
}

// Initialize Global Instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new GanttApp();
});
