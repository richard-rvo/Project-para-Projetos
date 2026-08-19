import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ConfirmDialog from '../components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  exportDB, importDB, clearAllData, getAllProjects, getAllTasks, getAllAnomalies,
} from '../utils/storage';
import {
  Download, Upload, Trash2, Database, Palette, Info, Sun, Moon,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   CONFIGURAÇÕES — duas colunas, estilo Ajustes do macOS

   Lista de seções à esquerda, painel à direita. A versão anterior
   era uma grade de cards de vidro todos com o mesmo peso, incluindo
   "Apagar tudo" lado a lado com "Tema".
   ═══════════════════════════════════════════════════════════════ */

const SECTIONS = [
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'data', label: 'Dados', icon: Database },
  { id: 'about', label: 'Sobre', icon: Info },
];

export default function PageSettings() {
  const { state, dispatch, ACTIONS, showToast, setTheme } = useContext(AppContext);
  const [section, setSection] = useState('appearance');
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef(null);

  const reloadFromDb = async () => {
    dispatch({ type: ACTIONS.SET_PROJECTS, payload: await getAllProjects() });
    dispatch({ type: ACTIONS.SET_TASKS, payload: await getAllTasks() });
    dispatch({ type: ACTIONS.SET_ANOMALIES, payload: await getAllAnomalies() });
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const ok = await importDB(ev.target.result);
      if (ok) {
        await reloadFromDb();
        showToast('Dados restaurados', 'success');
      } else {
        showToast('Falha ao importar o backup', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="mx-auto flex max-w-4xl gap-6">
      <nav className="w-48 shrink-0">
        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-body transition-colors',
                  section === s.id
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-text-2 hover:bg-surface-2 hover:text-text-1'
                )}
              >
                <s.icon size={15} strokeWidth={1.8} />
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        {section === 'appearance' && (
          <Panel title="Aparência" hint="Preferências de exibição, salvas neste dispositivo.">
            <Row label="Tema" description="Claro para ambientes iluminados, escuro para sala de controle.">
              <Choice
                options={[
                  { id: 'light', label: 'Claro', icon: Sun },
                  { id: 'dark', label: 'Escuro', icon: Moon },
                ]}
                value={state.theme}
                onChange={setTheme}
              />
            </Row>
          </Panel>
        )}

        {section === 'data' && (
          <>
            <Panel
              title="Backup"
              hint="Tudo é gravado apenas neste navegador. Sem backup, limpar os dados do site apaga os projetos."
            >
              <Row label="Exportar" description="Baixa um JSON com projetos, tarefas e anomalias.">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await exportDB();
                      showToast('Backup exportado', 'success');
                    } catch (err) {
                      showToast(`Erro ao exportar: ${err.message}`, 'error');
                    }
                  }}
                >
                  <Download data-icon="inline-start" />
                  Exportar
                </Button>
              </Row>
              <Row
                label="Importar"
                description="Substitui TODOS os dados atuais pelos do arquivo. Backups antigos são convertidos automaticamente."
              >
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload data-icon="inline-start" /> Escolher arquivo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  onChange={handleImport}
                  className="hidden"
                />
              </Row>
            </Panel>

            <Panel title="Zona de risco" tone="danger">
              <Row
                label="Apagar tudo"
                description="Remove projetos, tarefas e anomalias deste navegador. Não há como desfazer."
              >
                <Button variant="destructive" onClick={() => setConfirmClear(true)}>
                  <Trash2 data-icon="inline-start" />
                  Apagar tudo
                </Button>
              </Row>
            </Panel>
          </>
        )}

        {section === 'about' && (
          <Panel title="Sobre">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
              <dt className="text-text-3">Produto</dt>
              <dd className="text-text-1">Projeta — gestão de projetos</dd>
              <dt className="text-text-3">Armazenamento</dt>
              <dd className="text-text-1">IndexedDB local (v3), sem servidor</dd>
              <dt className="text-text-3">Projetos</dt>
              <dd className="tabular-nums text-text-1">{state.projects.length}</dd>
              <dt className="text-text-3">Tarefas</dt>
              <dd className="tabular-nums text-text-1">{state.tasks.length}</dd>
              <dt className="text-text-3">Anomalias</dt>
              <dd className="tabular-nums text-text-1">{state.anomalies.length}</dd>
            </dl>
            <p className="mt-4 border-t border-line pt-4 text-small leading-relaxed text-text-2">
              Os dados nunca saem deste dispositivo. Isso significa privacidade total — e também
              que o backup é responsabilidade sua.
            </p>
          </Panel>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          await clearAllData();
          await reloadFromDb();
          setConfirmClear(false);
          showToast('Todos os dados foram removidos', 'info');
        }}
        title="Apagar todos os dados"
        message="Isso remove projetos, tarefas e anomalias deste navegador de forma definitiva. Exporte um backup antes se tiver dúvida."
      />
    </div>
  );
}

/* ── Peças ─────────────────────────────────────────────────────── */

function Panel({ title, hint, tone, children }) {
  return (
    <section
      className={cn(
        'mb-4 rounded-[8px] border bg-surface-1 p-4',
        tone === 'danger' ? 'border-sched-late/35' : 'border-line'
      )}
    >
      <h2 className={cn(
        'text-body font-semibold tracking-tight',
        tone === 'danger' ? 'text-sched-late' : 'text-text-1'
      )}>
        {title}
      </h2>
      {hint && <p className="mt-1 text-small leading-relaxed text-text-2">{hint}</p>}
      <div className="mt-3 flex flex-col divide-y divide-[var(--line-hairline)]">{children}</div>
    </section>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-text-1">{label}</div>
        {description && (
          <p className="mt-0.5 text-small leading-relaxed text-text-2">{description}</p>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Choice({ options, value, onChange }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      size="sm"
    >
      {options.map((opt) => (
        <ToggleGroupItem
          key={opt.id}
          value={opt.id}
        >
          <opt.icon data-icon="inline-start" />
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
