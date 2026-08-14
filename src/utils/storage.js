import { openDB } from 'idb';
import { readDependencies } from './dependencies';
import { DEFAULT_CALENDAR } from './calendar';

const DB_NAME = 'gantt-dinamico-db';
const DB_VERSION = 3;

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
    version: 3,
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
 * Importa backups v2 E v3.
 *
 * Um backup gerado antes desta versão traz `dependsOn` como CSV; se
 * fosse gravado cru, as dependências sumiriam silenciosamente — o
 * app novo só entende a lista. A normalização acontece na entrada,
 * não depois.
 */
export async function importDB(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.projects || !data.tasks) throw new Error('Formato inválido');

    const projects = data.projects.map((p) => ({
      ...p,
      calendar: p.calendar || { ...DEFAULT_CALENDAR },
    }));

    const tasks = data.tasks.map((t) => ({
      ...t,
      dependsOn: readDependencies(t.dependsOn),
    }));

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
