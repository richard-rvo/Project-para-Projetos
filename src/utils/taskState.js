import { dateOf, daysBetween, today as todayStr } from './schedule';

/* ═══════════════════════════════════════════════════════════════
   ESTADO DA TAREFA — derivado, nunca digitado
   ═══════════════════════════════════════════════════════════════

   Até aqui existia um campo `status` com quatro valores:

       'Não Iniciada' | 'Em Andamento' | 'Concluída' | 'Atrasada'

   Ele misturava DOIS eixos ortogonais e por isso mentia dos dois
   lados:

   · Os três primeiros são ESTÁGIO — a leitura de quanto do trabalho
     foi feito. Isso já vive em `progress`, e ter os dois separados
     permitia a contradição: tarefa 'Concluída' com 0%, tarefa
     'Não Iniciada' com 60%. A barra do Gantt coloria pelo status e
     preenchia pelo progresso, então podia ficar verde pela metade.

   · O quarto é CONDIÇÃO — medida contra a data de hoje, não contra o
     trabalho feito. E como era um valor digitado, NINGUÉM no app o
     atribuía: três telas contavam "Tarefas atrasadas" por
     `status === 'Atrasada'` e mostravam zero num cronograma cheio de
     tarefas vencidas. O filtro "Só atrasadas" do Gantt devolvia lista
     vazia pelo mesmo motivo.

   Aqui os dois eixos ficam separados e os dois são calculados:

       estágio  ← progress          (regra do MS Project)
       atraso   ← endDate vs. hoje  (condição, ortogonal ao estágio)

   Uma tarefa pode estar 'Em Andamento' E atrasada ao mesmo tempo —
   que é justamente o caso que o enum antigo não conseguia expressar
   e que mais importa para quem toca o cronograma.
   ═══════════════════════════════════════════════════════════════ */

/* ── Acessores de exibição ─────────────────────────────────────────
   Uma tarefa-resumo mostra os valores agregados dos filhos, mas
   GUARDA os seus próprios. Renderize sempre com estes acessores;
   grave sempre nos campos crus.

   Moram aqui, e não no hook do Gantt, porque a derivação de estado
   depende deles e precisa ser pura — `useGanttTasks` os reexporta
   para os imports existentes seguirem funcionando.                */

export const viewStart = (t) => t?.rollup?.startDate ?? t?.startDate;
export const viewEnd = (t) => t?.rollup?.endDate ?? t?.endDate;
export const viewProgress = (t) => t?.rollup?.progress ?? t?.progress ?? 0;

/* ── Estágio ───────────────────────────────────────────────────── */

export const STAGES = [
  { id: 'not-started', label: 'Não Iniciada', tone: 'not-started' },
  { id: 'in-progress', label: 'Em Andamento', tone: 'on-track' },
  { id: 'done', label: 'Concluída', tone: 'done' },
];

export const STAGE_IDS = STAGES.map((s) => s.id);

const STAGE_BY_ID = new Map(STAGES.map((s) => [s.id, s]));

/** Regra do MS Project: o estágio É a leitura de % concluída. */
export function stageOf(task) {
  const p = viewProgress(task);
  if (p >= 100) return 'done';
  if (p > 0) return 'in-progress';
  return 'not-started';
}

export function stageLabel(task) {
  return STAGE_BY_ID.get(stageOf(task))?.label ?? '';
}

export function labelForStage(stageId) {
  return STAGE_BY_ID.get(stageId)?.label ?? '';
}

export function toneForStage(stageId) {
  return STAGE_BY_ID.get(stageId)?.tone ?? 'not-started';
}

/**
 * Progresso que representa um estágio, para quando a AÇÃO do usuário
 * é sobre o estágio — arrastar um card de coluna no Quadro, marcar
 * concluída em massa na Tabela.
 *
 * Mover para "Em Andamento" preserva o progresso quando ele já está
 * no meio: só um valor de ponta (0 ou 100) precisa de um novo, e 50
 * é a única resposta honesta quando o usuário não informou nada.
 */
export function progressForStage(stageId, currentProgress = 0) {
  if (stageId === 'done') return 100;
  if (stageId === 'not-started') return 0;
  const p = Number(currentProgress) || 0;
  return p > 0 && p < 100 ? p : 50;
}

/* ── Atraso ────────────────────────────────────────────────────────
   Condição, não estágio. Comparada por DIA: o término é um instante
   ('…T17:00') e hoje é uma data-só, então comparar os dois crus
   marcaria como atrasada, às 09:00, uma tarefa que termina hoje à
   tarde.                                                           */

/** A tarefa passou do término sem estar concluída? */
export function isLate(task, ref = todayStr()) {
  const end = viewEnd(task);
  if (!end) return false;
  if (viewProgress(task) >= 100) return false;
  return dateOf(end) < ref;
}

/** Dias corridos de atraso. Zero quando não está atrasada. */
export function lateDays(task, ref = todayStr()) {
  if (!isLate(task, ref)) return 0;
  return daysBetween(dateOf(viewEnd(task)), ref);
}

/** A tarefa vence dentro da janela, sem estar concluída? */
export function isDueWithin(task, days, ref = todayStr()) {
  const end = viewEnd(task);
  if (!end || viewProgress(task) >= 100) return false;
  const d = dateOf(end);
  return d >= ref && daysBetween(ref, d) <= days;
}

/* ── Leitura completa ──────────────────────────────────────────── */

/**
 * Estado da tarefa em uma chamada, para quem precisa dos dois eixos.
 *
 * `tone` é o do estágio; `late` é acumulado por cima e a UI decide se
 * o atraso sobrepõe a cor (barra do Gantt) ou vira marca separada
 * (card do Quadro, linha da Tabela).
 */
export function stateOf(task, ref = todayStr()) {
  const stage = stageOf(task);
  const late = isLate(task, ref);
  return {
    stage,
    label: labelForStage(stage),
    tone: toneForStage(stage),
    progress: viewProgress(task),
    late,
    lateDays: late ? lateDays(task, ref) : 0,
  };
}

/* ── Contagens de projeto ──────────────────────────────────────────
   Uma única implementação para os KPIs que antes cada tela contava do
   seu jeito — e que contavam por um status que ninguém atribuía.    */

/**
 * Só as tarefas-FOLHA, agrupadas por projeto.
 *
 * Uma tarefa-resumo não é trabalho: ela é a soma dos filhos. Contá-la
 * junto deles duplica tudo — e, pior, o resumo GUARDA datas próprias
 * que só o Gantt substitui pelo rollup. Fora do Gantt ninguém calcula
 * rollup, então `viewEnd` de um resumo devolve a data crua guardada,
 * que pode ser de meses atrás. Foi assim que o Portfólio passou a
 * contar três "atrasadas" que eram os três cabeçalhos de bloco.
 *
 * A hierarquia é lida da ordem + indentLevel, que é como ela é
 * definida — sem precisar do rollup nem de montar React.
 */
export function leaves(tasks) {
  const byProject = new Map();
  (tasks || []).forEach((t) => {
    const key = t.projectId ?? '__none__';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(t);
  });

  const out = [];
  for (const list of byProject.values()) {
    const ordered = [...list].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    ordered.forEach((task, i) => {
      const level = task.indentLevel || 0;
      const next = ordered[i + 1];
      const hasChildren = next && (next.indentLevel || 0) > level;
      if (!hasChildren) out.push(task);
    });
  }
  return out;
}

/**
 * Período REAL do projeto: o menor início e o maior término entre as
 * tarefas.
 *
 * `project.startDate` e `project.endDate` são dois campos digitados no
 * diálogo de criação e nunca mais tocados — três telas os exibiam como
 * "o período do projeto" mesmo quando o Gantt mostrava tarefas meses
 * além do término declarado. Agora eles são a META, e isto é o real.
 */
export function projectSpan(tasks) {
  /* Folhas também aqui: o resumo guarda datas próprias que só o Gantt
     troca pelo rollup, e elas esticariam o período para trás. */
  const list = leaves(tasks);
  const starts = list.map(viewStart).filter(Boolean).sort();
  const ends = list.map(viewEnd).filter(Boolean).sort();
  return {
    start: starts[0] || null,
    end: ends[ends.length - 1] || null,
  };
}

export function countByStage(tasks, ref = todayStr()) {
  const counts = { 'not-started': 0, 'in-progress': 0, done: 0, late: 0, total: 0 };
  leaves(tasks).forEach((t) => {
    counts.total += 1;
    counts[stageOf(t)] += 1;
    if (isLate(t, ref)) counts.late += 1;
  });
  return counts;
}
