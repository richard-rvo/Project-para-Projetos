import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import ProgressBar from '../components/ProgressBar';
import { Plus, Trash2, Edit3, Search, ChevronUp, ChevronDown, Filter } from 'lucide-react';

function generateId() {
  return Date.now() + Math.random().toString(36).slice(2, 9);
}

const STATUS_OPTIONS = ['Não Iniciada', 'Em Andamento', 'Concluída', 'Atrasada'];
const STATUS_COLORS = { 'Não Iniciada': 'gray', 'Em Andamento': 'blue', 'Concluída': 'green', 'Atrasada': 'red' };

export default function PageTaskList() {
  const { state, addTask, updateTask, removeTask, showToast } = useContext(AppContext);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
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

  const openEdit = (task) => {
    setEditTask(task);
    setForm({ name: task.name, startDate: task.startDate, endDate: task.endDate, status: task.status, progress: task.progress || 0, assignee: task.assignee || '', projectId: task.projectId });
    setModalOpen(true);
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

  return (
    <div className="page-section" id="pageTaskList">
      {/* Toolbar */}
      <div className="page-toolbar">
        <h2>Lista de Tarefas {state.activeProjectId && <span className="subtitle">— {getProjectName(state.activeProjectId)}</span>}</h2>
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
                  <th onClick={() => toggleSort('name')} className="sortable">Tarefa <SortIcon col="name" /></th>
                  <th onClick={() => toggleSort('assignee')} className="sortable">Responsável <SortIcon col="assignee" /></th>
                  <th onClick={() => toggleSort('startDate')} className="sortable">Início <SortIcon col="startDate" /></th>
                  <th onClick={() => toggleSort('endDate')} className="sortable">Fim <SortIcon col="endDate" /></th>
                  <th onClick={() => toggleSort('status')} className="sortable">Status <SortIcon col="status" /></th>
                  <th onClick={() => toggleSort('progress')} className="sortable">Progresso <SortIcon col="progress" /></th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((task) => (
                  <tr key={task.id}>
                    <td className="task-name-cell">{task.name}</td>
                    <td>{task.assignee || '—'}</td>
                    <td>{task.startDate || '—'}</td>
                    <td>{task.endDate || '—'}</td>
                    <td><Badge label={task.status} color={STATUS_COLORS[task.status] || 'gray'} /></td>
                    <td><ProgressBar value={task.progress || 0} showLabel height={6} /></td>
                    <td className="actions-cell">
                      <button className="btn-icon-only" onClick={() => openEdit(task)} title="Editar"><Edit3 size={15} /></button>
                      <button className="btn-icon-only btn-danger-ghost" onClick={() => setConfirmId(task.id)} title="Excluir"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
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
        {!state.activeProjectId && (
          <div className="form-group">
            <label>Projeto</label>
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Selecionar projeto...</option>
              {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
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
    </div>
  );
}
