import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Camera, X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import {
  SEVERITY_OPTIONS, SEVERITY_TONE, STATUS_OPTIONS, TYPE_OPTIONS,
  DISCIPLINES, FORM_STEPS, MAX_PHOTOS, compressImage,
} from './anomalyConfig';

/* ═══════════════════════════════════════════════════════════════
   Formulário de anomalia em 4 passos.

   Passos existem porque o registro nasce em CAMPO, no celular: uma
   tela única com quinze campos é impraticável de mão enluvada. Cada
   passo cabe numa tela.

   Era código duplicado entre a central global e a tela do projeto.
   ═══════════════════════════════════════════════════════════════ */

export default function AnomalyForm({
  open, onOpenChange, initial, tasks = [], onSave, onError,
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const photoRef = useRef(null);

  /* Reinicia ao (re)abrir, para não herdar o rascunho anterior. */
  React.useEffect(() => {
    if (open) { setForm(initial); setStep(0); }
  }, [open, initial]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (form.photos.length + files.length > MAX_PHOTOS) {
      onError?.(`Máximo de ${MAX_PHOTOS} fotos por anomalia`);
      return;
    }
    const compressed = (await Promise.all(files.map((f) => compressImage(f)))).filter(Boolean);
    set({ photos: [...form.photos, ...compressed] });
    e.target.value = '';
  };

  const canAdvance = step !== 0 || (form.title.trim() && form.reportedBy.trim());

  const submit = () => {
    if (!form.title.trim()) { onError?.('Título é obrigatório'); setStep(0); return; }
    if (!form.reportedBy.trim()) { onError?.('Responsável pelo registro é obrigatório'); setStep(0); return; }
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Editar anomalia' : 'Registrar anomalia'}</DialogTitle>
        </DialogHeader>

        {/* Trilha de passos */}
        <ol className="flex items-center gap-1">
          {FORM_STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn(
                  'flex h-6 flex-1 items-center justify-center rounded-[5px] text-micro font-medium transition-colors',
                  i === step ? 'bg-brand text-white'
                    : i < step ? 'bg-brand-soft text-brand'
                      : 'bg-surface-3 text-text-3'
                )}
              >
                {i < step ? <Check size={11} /> : null}
                <span className="ml-1">{label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="flex min-h-64 flex-col gap-3">
          {step === 0 && (
            <>
              <Field label="Título" required>
                <input autoFocus className={input} value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Ex: Trinca em viga de sustentação" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Severidade">
                  <div className="flex flex-wrap gap-1.5">
                    {SEVERITY_OPTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => set({ severity: s })}
                        className={cn('rounded-full px-2.5 py-1 text-small font-medium transition-colors',
                          form.severity === s ? SEVERITY_TONE[s] : 'bg-surface-3 text-text-2')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Tipo">
                  <select className={input} value={form.type} onChange={(e) => set({ type: e.target.value })}>
                    {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Registrado por" required>
                  <input className={input} value={form.reportedBy}
                    onChange={(e) => set({ reportedBy: e.target.value })} placeholder="Nome" />
                </Field>
                <Field label="Tarefa vinculada">
                  <select className={input} value={form.taskId || ''}
                    onChange={(e) => set({ taskId: e.target.value })}>
                    <option value="">— nenhuma —</option>
                    {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Descrição">
                <textarea rows={3} className={cn(input, 'h-auto py-2 leading-relaxed')}
                  value={form.description} onChange={(e) => set({ description: e.target.value })}
                  placeholder="O que foi observado?" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ordem de serviço">
                  <input className={input} value={form.osNumber} onChange={(e) => set({ osNumber: e.target.value })} />
                </Field>
                <Field label="Equipamento / ativo">
                  <input className={input} value={form.equipment} onChange={(e) => set({ equipment: e.target.value })} />
                </Field>
                <Field label="Localização">
                  <input className={input} value={form.location} onChange={(e) => set({ location: e.target.value })} />
                </Field>
                <Field label="Disciplina">
                  <select className={input} value={form.discipline} onChange={(e) => set({ discipline: e.target.value })}>
                    <option value="">—</option>
                    {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Causa raiz">
                <input className={input} value={form.rootCause} onChange={(e) => set({ rootCause: e.target.value })} />
              </Field>
              <Field label="Ação corretiva">
                <input className={input} value={form.correctiveAction}
                  onChange={(e) => set({ correctiveAction: e.target.value })} />
              </Field>
              <Field label="Status">
                <select className={input} value={form.status} onChange={(e) => set({ status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {form.photos.map((src, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-[8px] border border-line">
                    <img src={src} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                    <button type="button"
                      onClick={() => set({ photos: form.photos.filter((_, j) => j !== i) })}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {form.photos.length < MAX_PHOTOS && (
                  <button type="button" onClick={() => photoRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-line-strong text-text-3 transition-colors hover:border-brand hover:text-brand">
                    <Camera size={20} strokeWidth={1.6} />
                    <span className="text-micro">Adicionar</span>
                  </button>
                )}
              </div>
              <input ref={photoRef} type="file" accept="image/*" capture="environment"
                multiple onChange={addPhotos} className="hidden" />
              <p className="text-micro text-text-3">
                Até {MAX_PHOTOS} fotos, comprimidas para ~300 KB e guardadas só neste dispositivo.
              </p>
            </>
          )}

          {step === 3 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
              <Review label="Título" value={form.title} />
              <Review label="Severidade" value={form.severity} />
              <Review label="Tipo" value={form.type} />
              <Review label="Status" value={form.status} />
              <Review label="Registrado por" value={form.reportedBy} />
              {form.equipment && <Review label="Equipamento" value={form.equipment} />}
              {form.location && <Review label="Local" value={form.location} />}
              {form.osNumber && <Review label="OS" value={form.osNumber} />}
              {form.description && <Review label="Descrição" value={form.description} />}
              <Review label="Fotos" value={`${form.photos.length}`} />
            </dl>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0} className={cn(secondary, 'disabled:opacity-40')}>
            <ChevronLeft size={14} /> Voltar
          </button>
          <span className="ml-auto text-micro text-text-3">
            Passo {step + 1} de {FORM_STEPS.length}
          </span>
          {step < FORM_STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}
              className={cn(primary, 'disabled:opacity-40')}>
              Avançar <ChevronRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={submit} className={primary}>
              <Check size={14} /> Salvar
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const input =
  'h-8 w-full rounded-[6px] border border-line bg-surface-0 px-2.5 text-body text-text-1 ' +
  'placeholder:text-text-3 focus:border-line-strong';

const primary =
  'flex items-center gap-1.5 rounded-[6px] bg-brand px-3 py-1.5 text-small font-medium text-white transition-colors hover:bg-brand-hover';

const secondary =
  'flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-1.5 text-small font-medium text-text-2 transition-colors hover:bg-surface-3 hover:text-text-1';

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-micro font-medium uppercase tracking-wide text-text-3">
        {label}{required && <span className="ml-0.5 text-sched-late">*</span>}
      </span>
      {children}
    </label>
  );
}

function Review({ label, value }) {
  return (
    <>
      <dt className="text-text-3">{label}</dt>
      <dd className="text-text-1">{value || '—'}</dd>
    </>
  );
}
