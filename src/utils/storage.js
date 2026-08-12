import { openDB } from 'idb';

const DB_NAME = 'gantt-dinamico-db';
const DB_VERSION = 1;

let dbPromise = null;

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
          taskStore.createIndex('by-project', 'projectId');
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
  // also delete all tasks for this project
  const tx = db.transaction(['projects', 'tasks'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  const taskStore = tx.objectStore('tasks');
  const allTasks = await taskStore.index('by-project').getAllKeys(id);
  for (const taskId of allTasks) {
    await taskStore.delete(taskId);
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

/* ── Backup / Restore ────────────────────────────────────────── */

export async function exportDB() {
  const db = await initDB();
  const projects = await db.getAll('projects');
  const tasks = await db.getAll('tasks');
  const data = { projects, tasks, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gantt_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importDB(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.projects || !data.tasks) throw new Error('Formato inválido');
    const db = await initDB();
    const tx = db.transaction(['projects', 'tasks'], 'readwrite');
    await tx.objectStore('projects').clear();
    await tx.objectStore('tasks').clear();
    for (const p of data.projects) await tx.objectStore('projects').put(p);
    for (const t of data.tasks) await tx.objectStore('tasks').put(t);
    await tx.done;
    return true;
  } catch (e) {
    console.error('Falha na importação:', e);
    return false;
  }
}

export async function clearAllData() {
  const db = await initDB();
  const tx = db.transaction(['projects', 'tasks'], 'readwrite');
  await tx.objectStore('projects').clear();
  await tx.objectStore('tasks').clear();
  await tx.done;
}
