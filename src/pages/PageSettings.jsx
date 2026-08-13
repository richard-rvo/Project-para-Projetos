import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { exportDB, importDB, clearAllData, getAllProjects, getAllTasks } from '../utils/storage';
import { Download, Upload, Trash2, Database, Palette, Shield } from 'lucide-react';

export default function PageSettings() {
  const { state, dispatch, ACTIONS, showToast } = useContext(AppContext);
  const fileInputRef = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleExport = async () => {
    try {
      await exportDB();
      showToast('Backup exportado com sucesso!', 'success');
    } catch (e) {
      showToast('Erro ao exportar: ' + e.message, 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const success = await importDB(ev.target.result);
      if (success) {
        // Reload state from DB
        const projects = await getAllProjects();
        const tasks = await getAllTasks();
        dispatch({ type: ACTIONS.SET_PROJECTS, payload: projects });
        dispatch({ type: ACTIONS.SET_TASKS, payload: tasks });
        showToast('Dados restaurados com sucesso!', 'success');
      } else {
        showToast('Falha ao importar o backup', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearAll = async () => {
    await clearAllData();
    dispatch({ type: ACTIONS.SET_PROJECTS, payload: [] });
    dispatch({ type: ACTIONS.SET_TASKS, payload: [] });
    showToast('Todos os dados foram removidos', 'info');
  };

  return (
    <div className="page-section" id="pageSettings">
      <div className="page-toolbar">
        <h2>Configurações & Dados</h2>
      </div>

      <div className="settings-grid">
        {/* Theme */}
        <div className="settings-card glass-card">
          <div className="settings-card-header">
            <Palette size={20} />
            <h3>Aparência</h3>
          </div>
          <div className="settings-card-body">
            <p>Escolha o tema da interface.</p>
            <div className="theme-selector">
              <button
                className={`theme-option ${state.theme === 'light' ? 'active' : ''}`}
                onClick={() => dispatch({ type: ACTIONS.SET_THEME, payload: 'light' })}
              >
                <div className="theme-preview light-preview" />
                <span>Claro</span>
              </button>
              <button
                className={`theme-option ${state.theme === 'dark' ? 'active' : ''}`}
                onClick={() => dispatch({ type: ACTIONS.SET_THEME, payload: 'dark' })}
              >
                <div className="theme-preview dark-preview" />
                <span>Escuro</span>
              </button>
            </div>
          </div>
        </div>

        {/* Backup */}
        <div className="settings-card glass-card">
          <div className="settings-card-header">
            <Database size={20} />
            <h3>Backup & Restauração</h3>
          </div>
          <div className="settings-card-body">
            <p>Exporte seus dados como JSON ou restaure a partir de um backup.</p>
            <div className="settings-actions">
              <button className="btn-primary" onClick={handleExport}>
                <Download size={16} /> Exportar Backup
              </button>
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} /> Importar Backup
              </button>
              <input
                type="file"
                accept=".json"
                ref={fileInputRef}
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="settings-card glass-card">
          <div className="settings-card-header">
            <Shield size={20} />
            <h3>Gerenciamento de Dados</h3>
          </div>
          <div className="settings-card-body">
            <p>Limpe todos os dados armazenados localmente. Esta ação é irreversível.</p>
            <div className="settings-actions">
              <button className="btn-danger" onClick={() => setConfirmClear(true)}>
                <Trash2 size={16} /> Limpar Todos os Dados
              </button>
            </div>
            <div className="data-summary">
              <span>{state.projects.length} projeto{state.projects.length !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{state.tasks.length} tarefa{state.tasks.length !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{state.anomalies?.length || 0} anomalia{(state.anomalies?.length || 0) !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="settings-card glass-card">
          <div className="settings-card-header">
            <Database size={20} />
            <h3>Sobre</h3>
          </div>
          <div className="settings-card-body">
            <p><strong>Projeta</strong> v2.0.0</p>
            <p>Sistema de gestão de projetos com Gantt interativo, Curva S, lista de tarefas, registro de anomalias e dashboard executivo.</p>
            <p className="text-muted">Dados armazenados localmente via IndexedDB.</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClearAll}
        title="Limpar Todos os Dados"
        message="Esta ação irá remover TODOS os projetos e tarefas. Recomendamos exportar um backup antes. Deseja continuar?"
      />
    </div>
  );
}
