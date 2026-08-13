import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import ProgressBar from '../components/ProgressBar';
import {
  Plus,
  Trash2,
  Edit3,
  Search,
  ChevronUp,
  ChevronDown,
  Filter,
  CheckSquare,
  CheckCircle2,
  X,
  Eye,
  Sparkles,
} from 'lucide-react';

function generateId() {
  return Date.now() + Math.random().toString(36).slice(2, 9);
}

const STATUS_OPTIONS = ['Não Iniciada', 'Em Andamento', 'Concluída', 'Atrasada'];
const STATUS_COLORS = { 'Não Iniciada': 'gray', 'Em Andamento': 'blue', 'Concluída': 'green', 'Atrasada': 'red' };

export default function PageTaskList() {
  const { state, addTask, updateTask, updateTasksBatch, removeTask, openTaskInspector, showToast } = useContext(AppContext);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [showBulkConfirmDelete, setShowBulkConfirmDelete] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  const emptyForm = { name: '', startDate: '', endDate: '', status: 'Não Iniciada', progress: 0, assignee: '', projectId: state.activeProjectId || '' };
  const [form, setForm] = useState(emptyForm);

  /* Filter, sort, paginate */
  const filtered = useMemo(() => {
    let list = [...state.tasks];
    if (state.activeProjectId) list = list.filter((t) => t.projectId === state.activeProjectId);
    if (search) list = list.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || (t.assignee || '').toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'Todos') list = list.filter((t) => t.status === statusFilter);
    list.sort((a, b) => {
      let va = a[sortCol] || '';
      let vb = b[sortCol] || '';
      if (sortCol === 'progress') { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [state.tasks, state.activeProjectId, search, statusFilter, sortCol, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  // Selection Logic
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTaskIds(filtered.map((t) => t.id));
    } else {
      setSelectedTaskIds([]);
    }
  };

  const handleSelectOne = (e, taskId) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedTaskIds((prev) => [...prev, taskId]);
    } else {
      setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
    }
  };

  // Bulk Actions
  const handleBulkComplete = async () => {
    const toUpdate = state.tasks
      .filter((t) => selectedTaskIds.includes(t.id))
      .map((t) => ({ ...t, progress: 100, status: 'Concluída' }));
    await updateTasksBatch(toUpdate);
    showToast(`${toUpdate.length} tarefas concluídas!`, 'success');
    setSelectedTaskIds([]);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedTaskIds) {
      await removeTask(id);
    }
    showToast(`${selectedTaskIds.length} tarefas excluídas.`, 'info');
    setSelectedTaskIds([]);
    setShowBulkConfirmDelete(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Nome é obrigatório', 'error'); return; }
    if (!form.startDate || !form.endDate) { showToast('Datas são obrigatórias', 'error'); return; }
    if (editTask) {
      await updateTask({ ...editTask, ...form, progress: Number(form.progress) });
      showToast('Tarefa atualizada!', 'success');
    } else {
      await addTask({ id: generateId(), ...form, progress: Number(form.progress) });
      showToast('Tarefa criada!', 'success');
    }
    setForm(emptyForm);
    setEditTask(null);
    setModalOpen(false);
  };

  const getProjectName = (projectId) => {
    const p = state.projects.find((pr) => pr.id === projectId);
    return p ? p.name : '—';
  };

  const allSelected = filtered.length > 0 && selectedTaskIds.length === filtered.length;

  return (
    <div className="page-section" id="pageTaskList">
      {/* Toolbar */}
      <div className="page-toolbar">
        <button className="btn-primary" onClick={() => { setEditTask(null); setForm(emptyForm); setModalOpen(true); }}>
          <Plus size={16} /> Nova Tarefa
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar glass-card">
        <div className="filter-search">
          <Search size={16} />
          <input type="text" placeholder="Buscar tarefa ou responsável..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <div className="filter-status">
          <Filter size={16} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option>Todos</option>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <span className="filter-count">{filtered.length} tarefa{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhuma tarefa encontrada</h3>
          <p>Ajuste os filtros ou crie uma nova tarefa.</p>
        </div>
      ) : (
        <>
          <div className="task-table-wrapper glass-card">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th onClick={() => toggleSort('name')} className="sortable">Tarefa <SortIcon col="name" /></th>
                  <th onClick={() => toggleSort('assignee')} className="sortable">Responsável <SortIcon col="assignee" /></th>
                  <th onClick={() => toggleSort('startDate')} className="sortable">Início <SortIcon col="startDate" /></th>
                  <th onClick={() => toggleSort('endDate')} className="sortable">Fim <SortIcon col="endDate" /></th>
                  <th onClick={() => toggleSort('status')} className="sortable">Status <SortIcon col="status" /></th>
                  <th onClick={() => toggleSort('progress')} className="sortable">Progresso <SortIcon col="progress" /></th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((task) => {
                  const isSelected = selectedTaskIds.includes(task.id);
                  return (
                    <tr key={task.id} className={isSelected ? 'selected-row' : ''}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectOne(e, task.id)}
                        />
                      </td>
                      <td className="task-name-cell" onClick={() => openTaskInspector(task.id)} style={{ cursor: 'pointer' }}>
                        <span className="task-name-text">{task.name}</span>
                      </td>
                      <td>{task.assignee || '—'}</td>
                      <td>{task.startDate || '—'}</td>
                      <td>{task.endDate || '—'}</td>
                      <td><Badge label={task.status} color={STATUS_COLORS[task.status] || 'gray'} /></td>
                      <td><ProgressBar value={task.progress || 0} showLabel height={6} /></td>
                      <td className="actions-cell">
                        <button className="btn-icon-only" onClick={() => openTaskInspector(task.id)} title="Inspecionar (Painel Lateral)">
                          <Eye size={15} />
                        </button>
                        <button className="btn-icon-only btn-danger-ghost" onClick={() => setConfirmId(task.id)} title="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button key={i} className={`btn-page ${page === i ? 'active' : ''}`} onClick={() => setPage(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Floating Bulk Actions Dock (ClickUp style) */}
      {selectedTaskIds.length > 0 && (
        <div className="bulk-actions-dock">
          <div className="bulk-dock-info">
            <span className="bulk-count-badge">{selectedTaskIds.length}</span>
            <span>tarefa(s) selecionada(s)</span>
          </div>
          <div className="bulk-dock-buttons">
            <button className="btn btn-sm btn-success" onClick={handleBulkComplete}>
              <CheckCircle2 size={14} /> Concluir Todas
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => setShowBulkConfirmDelete(true)}>
              <Trash2 size={14} /> Excluir em Lote
            </button>
            <button className="btn-icon-sm" onClick={() => setSelectedTaskIds([])} title="Limpar seleção">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Task Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditTask(null); }} title={editTask ? 'Editar Tarefa' : 'Nova Tarefa'}>
        <div className="form-group">
          <label>Nome *</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da tarefa" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Data Início *</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Data Fim *</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Progresso ({form.progress}%)</label>
            <input type="range" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>Responsável</label>
          <input type="text" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder="Nome do responsável" />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => { setModalOpen(false); setEditTask(null); }}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>{editTask ? 'Salvar' : 'Criar'}</button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => removeTask(confirmId)}
        title="Excluir Tarefa"
        message="Tem certeza que deseja excluir esta tarefa?"
      />

      {showBulkConfirmDelete && (
        <ConfirmDialog
          isOpen={showBulkConfirmDelete}
          onClose={() => setShowBulkConfirmDelete(false)}
          onConfirm={handleBulkDelete}
          title="Excluir em Lote"
          message={`Tem certeza que deseja excluir as ${selectedTaskIds.length} tarefas selecionadas?`}
          confirmVariant="danger"
        />
      )}
    </div>
  );
}
