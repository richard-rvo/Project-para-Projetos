import React, { useContext, useState, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, AlertTriangle, Camera, X, ChevronLeft, ChevronRight,
  Trash2, Edit3, CheckCircle, Clock, AlertCircle,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────────── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* Compress image to ≤ 300 KB (quality reduction) */
async function compressImage(file, maxKB = 300) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_DIM = 1200;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      const tryCompress = () => {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const kb = Math.round(dataUrl.length * 0.75 / 1024);
        if (kb <= maxKB || quality <= 0.3) { URL.revokeObjectURL(url); resolve(dataUrl); }
        else { quality -= 0.1; tryCompress(); }
      };
      tryCompress();
    };
    img.src = url;
  });
}

/* ── constants ───────────────────────────────────────────────── */
const SEVERITY_OPTIONS = ['baixa', 'média', 'alta', 'crítica'];
const SEVERITY_COLOR   = { baixa: 'blue', média: 'orange', alta: 'red', crítica: 'red' };
const TYPE_OPTIONS     = ['Segurança', 'Qualidade', 'Prazo', 'Técnico', 'Ambiental', 'Outro'];
const STATUS_OPTIONS   = ['aberta', 'em análise', 'resolvida', 'cancelada'];
const STATUS_COLOR     = { aberta: 'red', 'em análise': 'orange', resolvida: 'green', cancelada: 'gray' };
const DISCIPLINES      = ['Civil', 'Mecânica', 'Elétrica', 'Instrumentação', 'Tubulação', 'Estrutura', 'Outro'];

const EMPTY_FORM = {
  title: '', description: '', severity: 'média', type: 'Técnico',
  status: 'aberta', reportedBy: '', taskId: '',
  osNumber: '', equipment: '', location: '', discipline: '',
  rootCause: '', correctiveAction: '',
  photos: [],
};

/* ── steps ───────────────────────────────────────────────────── */
const STEPS = ['Identificação', 'Detalhes', 'Fotos', 'Revisar'];

export default function PageProjectAnomalies() {
  const { state, addAnomaly, updateAnomaly, removeAnomaly, showToast } = useContext(AppContext);

  const projectTasks  = useMemo(() => state.tasks.filter((t) => t.projectId === state.activeProjectId), [state.tasks, state.activeProjectId]);
  const anomalies     = useMemo(() => state.anomalies.filter((a) => a.projectId === state.activeProjectId), [state.anomalies, state.activeProjectId]);

  const [formOpen,    setFormOpen]    = useState(false);
  const [step,        setStep]        = useState(0);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [editId,      setEditId]      = useState(null);
  const [confirmId,   setConfirmId]   = useState(null);
  const [photoPreview,setPhotoPreview]= useState(null); // lightbox
  const [filterStatus,setFilterStatus]= useState('Todos');
  const photoInputRef = useRef(null);

  /* ── open form ───────────────────────────────────────────────── */
  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setStep(0);
    setFormOpen(true);
  };
  const openEdit = (anomaly) => {
    setForm({ ...EMPTY_FORM, ...anomaly, taskId: anomaly.taskId || '' });
    setEditId(anomaly.id);
    setStep(0);
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setStep(0); };

  /* ── photo handling ──────────────────────────────────────────── */
  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (form.photos.length + files.length > 5) {
      showToast('Máximo de 5 fotos por anomalia', 'error');
      return;
    }
    const compressed = await Promise.all(files.map((f) => compressImage(f)));
    setForm((prev) => ({ ...prev, photos: [...prev.photos, ...compressed] }));
    e.target.value = '';
  };
  const removePhoto = (i) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((_, idx) => idx !== i) }));
  };

  /* ── save ────────────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Título é obrigatório', 'error'); return; }
    if (!form.reportedBy.trim()) { showToast('Responsável pelo registro é obrigatório', 'error'); return; }
    const payload = {
      ...form,
      projectId: state.activeProjectId,
      taskId: form.taskId || null,
      reportedAt: editId
        ? (anomalies.find((a) => a.id === editId)?.reportedAt || new Date().toISOString())
        : new Date().toISOString(),
      resolvedAt: form.status === 'resolvida' ? new Date().toISOString() : null,
    };
    if (editId) {
      await updateAnomaly({ ...payload, id: editId });
    } else {
      await addAnomaly({ ...payload, id: generateId() });
    }
    closeForm();
  };

  /* ── filtered list ───────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...anomalies].sort((a, b) => (a.reportedAt > b.reportedAt ? -1 : 1));
    if (filterStatus !== 'Todos') list = list.filter((a) => a.status === filterStatus);
    return list;
  }, [anomalies, filterStatus]);

  /* ── step validation ──────────────────────────────────────────── */
  const canNextStep = () => {
    if (step === 0) return form.title.trim() && form.reportedBy.trim();
    return true;
  };

  /* ── render form step ─────────────────────────────────────────── */
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="anomaly-step">
            <div className="form-group">
              <label>Título da Anomalia *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Trinca na estrutura do pilar L3" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Severidade</label>
                <div className="pill-selector">
                  {SEVERITY_OPTIONS.map((s) => (
                    <button key={s} type="button" className={`pill-option severity-${s} ${form.severity === s ? 'active' : ''}`} onClick={() => setForm({ ...form, severity: s })}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Responsável pelo Registro *</label>
                <input type="text" value={form.reportedBy} onChange={(e) => setForm({ ...form, reportedBy: e.target.value })} placeholder="Nome completo" />
              </div>
              <div className="form-group">
                <label>Tarefa Vinculada</label>
                <select value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
                  <option value="">— Nenhuma —</option>
                  {projectTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="anomaly-step">
            <div className="form-group">
              <label>Descrição Detalhada</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descreva a anomalia com o máximo de detalhes possível..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Nº OS / Ordem de Serviço</label>
                <input type="text" value={form.osNumber} onChange={(e) => setForm({ ...form, osNumber: e.target.value })} placeholder="Ex: OS-2024-0042" />
              </div>
              <div className="form-group">
                <label>Equipamento / Ativo</label>
                <input type="text" value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} placeholder="Ex: Bomba centrífuga B-01" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Localização Física</label>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex: Planta 2 — Área 03 — Setor B" />
              </div>
              <div className="form-group">
                <label>Disciplina</label>
                <select value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}>
                  <option value="">— Selecionar —</option>
                  {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Causa Raiz</label>
              <textarea rows={2} value={form.rootCause} onChange={(e) => setForm({ ...form, rootCause: e.target.value })} placeholder="Descreva a causa raiz identificada..." />
            </div>
            <div className="form-group">
              <label>Ação Corretiva / Plano de Ação</label>
              <textarea rows={2} value={form.correctiveAction} onChange={(e) => setForm({ ...form, correctiveAction: e.target.value })} placeholder="Descreva as ações a serem tomadas..." />
            </div>
            {editId && (
              <div className="form-group">
                <label>Status</label>
                <div className="pill-selector">
                  {STATUS_OPTIONS.map((s) => (
                    <button key={s} type="button" className={`pill-option ${form.status === s ? 'active' : ''}`} onClick={() => setForm({ ...form, status: s })}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="anomaly-step">
            <div className="photo-upload-area">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotoChange}
                style={{ display: 'none' }}
                id="photoInput"
              />
              <button
                type="button"
                className="btn-photo-upload"
                onClick={() => photoInputRef.current?.click()}
                disabled={form.photos.length >= 5}
              >
                <Camera size={24} />
                <span>{form.photos.length >= 5 ? 'Limite de 5 fotos' : 'Tirar foto / Selecionar imagem'}</span>
              </button>
              <p className="photo-hint">{form.photos.length}/5 fotos • Imagens serão comprimidas automaticamente</p>
            </div>
            {form.photos.length > 0 && (
              <div className="photo-grid">
                {form.photos.map((src, i) => (
                  <div key={i} className="photo-thumb-wrapper">
                    <img src={src} alt={`Foto ${i + 1}`} className="photo-thumb" onClick={() => setPhotoPreview(src)} />
                    <button type="button" className="photo-remove-btn" onClick={() => removePhoto(i)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="anomaly-step anomaly-review">
            <h4>Confirme os dados antes de salvar</h4>
            <div className="review-grid">
              <div className="review-item"><strong>Título</strong><span>{form.title}</span></div>
              <div className="review-item"><strong>Severidade</strong><Badge label={form.severity} color={SEVERITY_COLOR[form.severity] || 'gray'} /></div>
              <div className="review-item"><strong>Tipo</strong><span>{form.type}</span></div>
              <div className="review-item"><strong>Responsável</strong><span>{form.reportedBy}</span></div>
              {form.osNumber && <div className="review-item"><strong>OS</strong><span>{form.osNumber}</span></div>}
              {form.equipment && <div className="review-item"><strong>Equipamento</strong><span>{form.equipment}</span></div>}
              {form.location && <div className="review-item"><strong>Localização</strong><span>{form.location}</span></div>}
              {form.discipline && <div className="review-item"><strong>Disciplina</strong><span>{form.discipline}</span></div>}
              {form.rootCause && <div className="review-item review-full"><strong>Causa Raiz</strong><span>{form.rootCause}</span></div>}
              {form.correctiveAction && <div className="review-item review-full"><strong>Ação Corretiva</strong><span>{form.correctiveAction}</span></div>}
              {form.description && <div className="review-item review-full"><strong>Descrição</strong><span>{form.description}</span></div>}
              {form.photos.length > 0 && (
                <div className="review-item review-full">
                  <strong>Fotos ({form.photos.length})</strong>
                  <div className="photo-grid" style={{ marginTop: 8 }}>
                    {form.photos.map((src, i) => (
                      <img key={i} src={src} alt={`Foto ${i + 1}`} className="photo-thumb" onClick={() => setPhotoPreview(src)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      default: return null;
    }
  };

  /* ── main render ─────────────────────────────────────────────── */
  return (
    <div className="page-section" id="pageProjectAnomalies">
      {/* Toolbar */}
      <div className="page-toolbar">
        <div className="toolbar-right">
          {/* Filter */}
          <select className="filter-select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option>Todos</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> Nova Anomalia
          </button>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={64} strokeWidth={1} style={{ color: 'var(--color-emerald)' }} />
          <h3>{filterStatus === 'Todos' ? 'Nenhuma anomalia registrada' : `Nenhuma anomalia "${filterStatus}"`}</h3>
          <p>Use o botão "Nova Anomalia" para registrar ocorrências deste projeto.</p>
        </div>
      ) : (
        <div className="anomaly-list">
          {filtered.map((a) => {
            const task = projectTasks.find((t) => t.id === a.taskId);
            return (
              <div key={a.id} className="anomaly-card glass-card">
                <div className="anomaly-card-header">
                  <div className="anomaly-card-title-row">
                    <Badge label={a.severity} color={SEVERITY_COLOR[a.severity] || 'gray'} />
                    <span className="anomaly-title">{a.title}</span>
                  </div>
                  <div className="anomaly-card-actions">
                    <Badge label={a.status} color={STATUS_COLOR[a.status] || 'gray'} />
                    <button className="btn-icon-only" onClick={() => openEdit(a)} title="Editar"><Edit3 size={15} /></button>
                    <button className="btn-icon-only btn-danger-ghost" onClick={() => setConfirmId(a.id)} title="Excluir"><Trash2 size={15} /></button>
                  </div>
                </div>

                {a.description && <p className="anomaly-desc">{a.description}</p>}

                <div className="anomaly-meta">
                  {a.type && <span className="anomaly-tag">{a.type}</span>}
                  {a.discipline && <span className="anomaly-tag">{a.discipline}</span>}
                  {a.osNumber && <span className="anomaly-tag">OS: {a.osNumber}</span>}
                  {a.equipment && <span className="anomaly-tag">🔧 {a.equipment}</span>}
                  {a.location && <span className="anomaly-tag">📍 {a.location}</span>}
                  {task && <span className="anomaly-tag">🔗 {task.name}</span>}
                </div>

                {a.rootCause && (
                  <div className="anomaly-detail-row">
                    <span className="anomaly-detail-label">Causa Raiz:</span>
                    <span>{a.rootCause}</span>
                  </div>
                )}
                {a.correctiveAction && (
                  <div className="anomaly-detail-row">
                    <span className="anomaly-detail-label">Ação Corretiva:</span>
                    <span>{a.correctiveAction}</span>
                  </div>
                )}

                {a.photos?.length > 0 && (
                  <div className="anomaly-photos">
                    {a.photos.map((src, i) => (
                      <img key={i} src={src} alt={`Foto ${i + 1}`} className="anomaly-photo-thumb" onClick={() => setPhotoPreview(src)} />
                    ))}
                  </div>
                )}

                <div className="anomaly-footer">
                  <Clock size={12} />
                  <span>{formatDatetime(a.reportedAt)}</span>
                  <span>·</span>
                  <span>{a.reportedBy}</span>
                  {a.resolvedAt && <><span>·</span><span>Resolvida em {formatDatetime(a.resolvedAt)}</span></>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB for mobile */}
      <button className="fab" onClick={openNew} title="Nova Anomalia">
        <Plus size={24} />
      </button>

      {/* Photo lightbox */}
      {photoPreview && (
        <div className="lightbox" onClick={() => setPhotoPreview(null)}>
          <button className="lightbox-close" onClick={() => setPhotoPreview(null)}><X size={24} /></button>
          <img src={photoPreview} alt="Preview" className="lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Anomaly form modal (step-based) */}
      {formOpen && (
        <div className="anomaly-modal-overlay" onClick={closeForm}>
          <div className="anomaly-modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="anomaly-modal-header">
              <h3>{editId ? 'Editar Anomalia' : 'Nova Anomalia'}</h3>
              <button className="btn-icon-only" onClick={closeForm}><X size={20} /></button>
            </div>

            {/* Step indicator */}
            <div className="step-indicator">
              {STEPS.map((s, i) => (
                <React.Fragment key={s}>
                  <div className={`step-dot ${i <= step ? 'done' : ''} ${i === step ? 'active' : ''}`}>
                    {i < step ? <CheckCircle size={14} /> : <span>{i + 1}</span>}
                  </div>
                  {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
                </React.Fragment>
              ))}
            </div>
            <div className="step-label-row">
              {STEPS.map((s, i) => (
                <span key={s} className={`step-label ${i === step ? 'active' : ''}`}>{s}</span>
              ))}
            </div>

            {/* Step content */}
            <div className="anomaly-modal-body">
              {renderStep()}
            </div>

            {/* Modal footer */}
            <div className="anomaly-modal-footer">
              {step > 0 && (
                <button className="btn-secondary" onClick={() => setStep((s) => s - 1)}>
                  <ChevronLeft size={16} /> Anterior
                </button>
              )}
              <div style={{ flex: 1 }} />
              {step < STEPS.length - 1 ? (
                <button className="btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNextStep()}>
                  Próximo <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn-primary" onClick={handleSave}>
                  <CheckCircle size={16} /> {editId ? 'Salvar Alterações' : 'Registrar Anomalia'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => removeAnomaly(confirmId)}
        title="Excluir Anomalia"
        message="Tem certeza que deseja excluir esta anomalia? As fotos também serão removidas."
      />
    </div>
  );
}
