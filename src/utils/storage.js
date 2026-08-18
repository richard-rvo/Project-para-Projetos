import { openDB } from 'idb';
import { readDependencies } from './dependencies';
import {
  DEFAULT_CALENDAR, DEFAULT_CALENDAR_ID, defaultCalendarOf,
  workdayStart, workdayEnd,
} from './calendar';
import { hasTime } from './schedule';

const DB_NAME = 'gantt-dinamico-db';
const DB_VERSION = 5;

let dbPromise = null;

/**
 * v2 → v3: `dependsOn` deixa de ser CSV de ids e passa a ser uma lista
 * de { id, type, lag }, e projetos ganham calendário de trabalho.
 *
 * A conversão guarda o valor original em `dependsOnLegacy`. Migração
 * é a operação mais fácil de errar de forma irreversível — manter o
 * original custa alguns bytes e permite recuperar se a leitura tiver
 * interpretado algo errado.
 */
async function migrateToV3(tx) {
  const tasks = tx.objectStore('tasks');
  let cursor = await tasks.openCursor();
  while (cursor) {
    const task = cursor.value;
    if (task && !Array.isArray(task.dependsOn)) {
      const converted = readDependencies(task.dependsOn);
      const next = { ...task, dependsOn: converted };
      if (task.dependsOn) next.dependsOnLegacy = task.dependsOn;
      await cursor.update(next);
    }
    cursor = await cursor.continue();
  }

  const projects = tx.objectStore('projects');
  let pCursor = await projects.openCursor();
  while (pCursor) {
    const project = pCursor.value;
    if (project && !project.calendar) {
      await pCursor.update({ ...project, calendar: { ...DEFAULT_CALENDAR } });
    }
    pCursor = await pCursor.continue();
  }
}

/* ── v3 → v4 ──────────────────────────────────────────────────────
   Datas de dia viram INSTANTES, e o calendário único do projeto vira
   uma biblioteca de calendários.

   Nenhuma data anda: o dia continua exatamente o mesmo, ganhando a
   hora de abertura no início e a de fechamento no término. O que era
   "10 a 14 de agosto" passa a ser "10/08 08:00 → 14/08 17:00", que é
   o mesmo intervalo dito com precisão de relógio.

   Como na v3, o valor original fica guardado ao lado. Migração é a
   operação mais fácil de errar de forma irreversível.               */

/** Projeto: `calendar` de dia inteiro → biblioteca com jornada. */
export function upgradeProjectToV4(project) {
  if (!project || Array.isArray(project.calendars)) return project;

  const legacy = project.calendar;
  const base = {
    ...DEFAULT_CALENDAR,
    id: DEFAULT_CALENDAR_ID,
    name: DEFAULT_CALENDAR.name,
    workdays: legacy?.workdays?.length ? legacy.workdays : DEFAULT_CALENDAR.workdays,
    holidays: Array.isArray(legacy?.holidays) ? legacy.holidays : [],
  };

  const next = { ...project, calendars: [base], defaultCalendarId: base.id };
  if (legacy) next.calendarLegacy = legacy;
  delete next.calendar;
  return next;
}

/**
 * Tarefa: as quatro datas viram instantes, no calendário do projeto.
 *
 * O caso que exige cuidado é o MARCO. Marco é `startDate === endDate`;
 * se o início ganhasse a abertura e o término o fechamento, todo marco
 * do banco viraria uma tarefa de um dia — e uma perda dessas passaria
 * despercebida por semanas. Igualdade detectada antes vira igualdade
 * de instante.
 */
export function upgradeTaskToV4(task, cal) {
  if (!task) return task;
  if (hasTime(task.startDate) && hasTime(task.endDate)) return task;

  const legacy = {
    startDate: task.startDate,
    endDate: task.endDate,
    baselineStart: task.baselineStart,
    baselineEnd: task.baselineEnd,
  };

  const pair = (start, end) => {
    if (!start && !end) return [start, end];
    if (start && start === end) {
      const instant = workdayStart(cal, start);
      return [instant, instant];
    }
    return [
      start ? workdayStart(cal, start) : start,
      end ? workdayEnd(cal, end) : end,
    ];
  };

  const [startDate, endDate] = pair(task.startDate, task.endDate);
  const [baselineStart, baselineEnd] = pair(task.baselineStart, task.baselineEnd);

  return {
    ...task,
    startDate,
    endDate,
    baselineStart,
    baselineEnd,
    datesLegacy: legacy,
  };
}

/* ── v4 → v5 ──────────────────────────────────────────────────────
   O campo `status` da tarefa é aposentado. Ele misturava dois eixos
   ortogonais e mentia dos dois lados: os três primeiros valores são
   ESTÁGIO, que já vive em `progress` e podia contradizê-lo; o quarto,
   'Atrasada', é CONDIÇÃO medida contra hoje — e como era digitado,
   ninguém no app o atribuía, então três telas contavam "Tarefas
   atrasadas" e mostravam zero num cronograma cheio de vencidas.

   Agora os dois são derivados em utils/taskState.js.

   Como nas migrações anteriores, o valor original fica guardado ao
   lado em `statusLegacy`. Uma única reconciliação é aplicada: quem
   estava 'Concluída' passa a 100%, porque esse valor é inequívoco e
   sem ele a tarefa voltaria a aparecer como não concluída. Os demais
   não inventam progresso — 'Em Andamento' com 0% passa a ler-se como
   'Não Iniciada', que é o que o dado de fato diz.                  */

export function upgradeTaskToV5(task) {
  if (!task || !task.status) return task;

  const next = { ...task, statusLegacy: task.status };
  if (task.status === 'Concluída' && (Number(task.progress) || 0) < 100) {
    next.progress = 100;
  }
  delete next.status;
  return next;
}

async function migrateToV5(tx) {
  const taskStore = tx.objectStore('tasks');
  let cursor = await taskStore.openCursor();
  while (cursor) {
    const upgraded = upgradeTaskToV5(cursor.value);
    if (upgraded !== cursor.value) await cursor.update(upgraded);
    cursor = await cursor.continue();
  }
}

async function migrateToV4(tx) {
  const projectStore = tx.objectStore('projects');
  const calendarByProject = new Map();

  let pCursor = await projectStore.openCursor();
  while (pCursor) {
    const upgraded = upgradeProjectToV4(pCursor.value);
    calendarByProject.set(upgraded.id, defaultCalendarOf(upgraded));
    if (upgraded !== pCursor.value) await pCursor.update(upgraded);
    pCursor = await pCursor.continue();
  }

  const taskStore = tx.objectStore('tasks');
  let cursor = await taskStore.openCursor();
  while (cursor) {
    const task = cursor.value;
    const cal = calendarByProject.get(task?.projectId) || DEFAULT_CALENDAR;
    const upgraded = upgradeTaskToV4(task, cal);
    if (upgraded !== task) await cursor.update(upgraded);
    cursor = await cursor.continue();
  }
}

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('tasks')) {
            const taskStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
            taskStore.createIndex('by-project', 'projectId');
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('anomalies')) {
            const anomalyStore = db.createObjectStore('anomalies', { keyPath: 'id', autoIncrement: true });
            anomalyStore.createIndex('by-project', 'projectId');
            anomalyStore.createIndex('by-status', 'status');
          }
        }
        if (oldVersion >= 1 && oldVersion < 3) {
          /* Só migra bancos que já existiam. Banco novo já nasce v3. */
          migrateToV3(tx);
        }
        if (oldVersion >= 1 && oldVersion < 4) {
          migrateToV4(tx);
        }
        if (oldVersion >= 1 && oldVersion < 5) {
          migrateToV5(tx);
        }
      },
    });
  }
  return dbPromise;
}

/* ── Projects ────────────────────────────────────────────────── */

export async function getAllProjects() {
  const db = await initDB();
  return db.getAll('projects');
}

export async function getProject(id) {
  const db = await initDB();
  return db.get('projects', id);
}

export async function saveProject(project) {
  const db = await initDB();
  const id = await db.put('projects', project);
  return id;
}

export async function deleteProject(id) {
  const db = await initDB();
  const tx = db.transaction(['projects', 'tasks', 'anomalies'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  const taskStore = tx.objectStore('tasks');
  const allTasks = await taskStore.index('by-project').getAllKeys(id);
  for (const taskId of allTasks) {
    await taskStore.delete(taskId);
  }
  const anomalyStore = tx.objectStore('anomalies');
  const allAnomalies = await anomalyStore.index('by-project').getAllKeys(id);
  for (const anomalyId of allAnomalies) {
    await anomalyStore.delete(anomalyId);
  }
  await tx.done;
}

/* ── Tasks ───────────────────────────────────────────────────── */

export async function getAllTasks() {
  const db = await initDB();
  return db.getAll('tasks');
}

export async function getTasksByProject(projectId) {
  const db = await initDB();
  return db.getAllFromIndex('tasks', 'by-project', projectId);
}

export async function saveTask(task) {
  const db = await initDB();
  const id = await db.put('tasks', task);
  return id;
}

export async function deleteTask(id) {
  const db = await initDB();
  return db.delete('tasks', id);
}

/* ── Anomalies ───────────────────────────────────────────────── */

export async function getAllAnomalies() {
  const db = await initDB();
  return db.getAll('anomalies');
}

export async function getAnomaliesByProject(projectId) {
  const db = await initDB();
  return db.getAllFromIndex('anomalies', 'by-project', projectId);
}

export async function saveAnomaly(anomaly) {
  const db = await initDB();
  const id = await db.put('anomalies', anomaly);
  return id;
}

export async function deleteAnomaly(id) {
  const db = await initDB();
  return db.delete('anomalies', id);
}

/* ── Backup / Restore ────────────────────────────────────────── */

export async function exportDB() {
  const db = await initDB();
  const projects = await db.getAll('projects');
  const tasks = await db.getAll('tasks');
  const anomalies = await db.getAll('anomalies');
  // Strip photo data from backup to keep file small; photos stay local only
  const anomaliesNoPhotos = anomalies.map(({ photos: _p, ...rest }) => rest);
  const data = {
    projects,
    tasks,
    anomalies: anomaliesNoPhotos,
    exportedAt: new Date().toISOString(),
    version: 5,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `projeta_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Importa backups v2, v3, v4 E v5.
 *
 * Um backup gerado antes da v3 traz `dependsOn` como CSV; um anterior
 * à v4 traz datas sem hora e um calendário só. Gravado cru, o primeiro
 * perderia as dependências e o segundo deixaria o cronograma sem
 * jornada — as duas perdas silenciosas. A normalização acontece na
 * ENTRADA, com as mesmas funções da migração do banco, para o backup
 * antigo não seguir caminho diferente do banco antigo.
 */
export async function importDB(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.projects || !data.tasks) throw new Error('Formato inválido');

    const projects = data.projects.map(upgradeProjectToV4);
    const calendarByProject = new Map(
      projects.map((p) => [p.id, defaultCalendarOf(p)])
    );

    const tasks = data.tasks.map((t) =>
      upgradeTaskToV5(
        upgradeTaskToV4(
          { ...t, dependsOn: readDependencies(t.dependsOn) },
          calendarByProject.get(t.projectId) || DEFAULT_CALENDAR
        )
      )
    );

    const db = await initDB();
    const tx = db.transaction(['projects', 'tasks', 'anomalies'], 'readwrite');
    await tx.objectStore('projects').clear();
    await tx.objectStore('tasks').clear();
    await tx.objectStore('anomalies').clear();
    for (const p of projects) await tx.objectStore('projects').put(p);
    for (const t of tasks) await tx.objectStore('tasks').put(t);
    if (data.anomalies) {
      for (const a of data.anomalies) await tx.objectStore('anomalies').put(a);
    }
    await tx.done;
    return true;
  } catch (e) {
    console.error('Falha na importação:', e);
    return false;
  }
}

export async function clearAllData() {
  const db = await initDB();
  const tx = db.transaction(['projects', 'tasks', 'anomalies'], 'readwrite');
  await tx.objectStore('projects').clear();
  await tx.objectStore('tasks').clear();
  await tx.objectStore('anomalies').clear();
  await tx.done;
}
