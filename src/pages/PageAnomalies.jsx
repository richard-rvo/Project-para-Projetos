import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import Badge from '../components/Badge';
import {
  AlertTriangle, Filter, CheckCircle, Clock, Search,
} from 'lucide-react';

const SEVERITY_COLOR = { baixa: 'blue', média: 'orange', alta: 'red', crítica: 'red' };
const STATUS_COLOR   = { aberta: 'red', 'em análise': 'orange', resolvida: 'green', cancelada: 'gray' };

function formatDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PageAnomalies() {
  const { state, selectProject } = useContext(AppContext);
  const { projects, anomalies } = state;
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const getProjectName = (id) => projects.find((p) => p.id === id)?.name || '—';

  const filtered = useMemo(() => {
    let list = [...anomalies].sort((a, b) => (a.reportedAt > b.reportedAt ? -1 : 1));
    if (filterProject) list = list.filter((a) => a.projectId === filterProject);
    if (filterSeverity) list = list.filter((a) => a.severity === filterSeverity);
    if (filterStatus) list = list.filter((a) => a.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.title?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.reportedBy?.toLowerCase().includes(q) ||
        a.equipment?.toLowerCase().includes(q) ||
        a.osNumber?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [anomalies, filterProject, filterSeverity, filterStatus, search]);

  /* Stats */
  const stats = useMemo(() => ({
    total:   anomalies.length,
    abertas: anomalies.filter((a) => a.status === 'aberta').length,
    criticas: anomalies.filter((a) => a.severity === 'crítica' && a.status === 'aberta').length,
    resolvidas: anomalies.filter((a) => a.status === 'resolvida').length,
  }), [anomalies]);

  return (
    <div className="page-section" id="pageAnomalies">
      <div className="page-toolbar">
        <h2>Central de Anomalias</h2>
        <span className="subtitle">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Quick stats */}
      <div className="kpi-bar" style={{ marginBottom: '16px' }}>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-blue)' }}><AlertTriangle size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value">{stats.total}</span><span className="kpi-label">Total</span></div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-coral)' }}><AlertTriangle size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value" style={{ color: stats.abertas > 0 ? 'var(--color-coral)' : undefined }}>{stats.abertas}</span><span className="kpi-label">Abertas</span></div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-coral)' }}><AlertTriangle size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value" style={{ color: stats.criticas > 0 ? 'var(--color-coral)' : undefined }}>{stats.criticas}</span><span className="kpi-label">Críticas</span></div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-emerald)' }}><CheckCircle size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value">{stats.resolvidas}</span><span className="kpi-label">Resolvidas</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar glass-card" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div className="filter-search">
          <Search size={16} />
          <input type="text" placeholder="Buscar anomalia, responsável, OS..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filter-status">
          <Filter size={16} />
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="">Todos os projetos</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <select className="filter-select-sm" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
          <option value="">Todas as severidades</option>
          {['baixa','média','alta','crítica'].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select className="filter-select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {['aberta','em análise','resolvida','cancelada'].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={64} strokeWidth={1} style={{ color: 'var(--color-emerald)' }} />
          <h3>Nenhuma anomalia encontrada</h3>
          <p>Ajuste os filtros ou registre anomalias dentro de um projeto.</p>
        </div>
      ) : (
        <div className="anomaly-list">
          {filtered.map((a) => (
            <div key={a.id} className="anomaly-card glass-card">
              <div className="anomaly-card-header">
                <div className="anomaly-card-title-row">
                  <Badge label={a.severity} color={SEVERITY_COLOR[a.severity] || 'gray'} />
                  <span className="anomaly-title">{a.title}</span>
                </div>
                <div className="anomaly-card-actions">
                  <Badge label={a.status} color={STATUS_COLOR[a.status] || 'gray'} />
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => selectProject(a.projectId)}
                    title="Abrir projeto"
                  >
                    Abrir Projeto
                  </button>
                </div>
              </div>
              {a.description && <p className="anomaly-desc">{a.description}</p>}
              <div className="anomaly-meta">
                <span className="anomaly-tag">📁 {getProjectName(a.projectId)}</span>
                {a.type && <span className="anomaly-tag">{a.type}</span>}
                {a.discipline && <span className="anomaly-tag">{a.discipline}</span>}
                {a.osNumber && <span className="anomaly-tag">OS: {a.osNumber}</span>}
                {a.equipment && <span className="anomaly-tag">🔧 {a.equipment}</span>}
                {a.location && <span className="anomaly-tag">📍 {a.location}</span>}
              </div>
              {a.photos?.length > 0 && (
                <div className="anomaly-photos">
                  {a.photos.map((src, i) => (
                    <img key={i} src={src} alt={`Foto ${i + 1}`} className="anomaly-photo-thumb" />
                  ))}
                </div>
              )}
              <div className="anomaly-footer">
                <Clock size={12} />
                <span>{formatDatetime(a.reportedAt)}</span>
                <span>·</span>
                <span>{a.reportedBy}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
