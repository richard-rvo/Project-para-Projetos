import React, { createContext, useReducer, useEffect, useCallback } from 'react';
import {
  initDB, getAllProjects, saveProject as dbSaveProject, deleteProject as dbDeleteProject,
  saveTask as dbSaveTask, deleteTask as dbDeleteTask, getAllTasks,
  saveAnomaly as dbSaveAnomaly, deleteAnomaly as dbDeleteAnomaly, getAllAnomalies,
} from '../utils/storage';

/* ── initial state ──────────────────────────────────────────── */
const initialState = {
  projects: [],
  tasks: [],
  anomalies: [],
  activeProjectId: null,
  activeProjectTab: 'overview',   // 'overview' | 'gantt' | 'scurve' | 'tasklist' | 'anomalies'
  activePage: 'pageProjects',     // global page when no project workspace is open
  theme: localStorage.getItem('projeta_theme') || 'light',
  toast: null,
  sidebarCollapsed: false,
};

/* ── action types ───────────────────────────────────────────── */
export const ACTIONS = {
  SET_PROJECTS: 'SET_PROJECTS',
  ADD_PROJECT: 'ADD_PROJECT',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  REMOVE_PROJECT: 'REMOVE_PROJECT',
  SET_TASKS: 'SET_TASKS',
  ADD_TASK: 'ADD_TASK',
  UPDATE_TASK: 'UPDATE_TASK',
  UPDATE_TASKS_BATCH: 'UPDATE_TASKS_BATCH',
  REMOVE_TASK: 'REMOVE_TASK',
  SET_ANOMALIES: 'SET_ANOMALIES',
  ADD_ANOMALY: 'ADD_ANOMALY',
  UPDATE_ANOMALY: 'UPDATE_ANOMALY',
  REMOVE_ANOMALY: 'REMOVE_ANOMALY',
  SET_ACTIVE_PAGE: 'SET_ACTIVE_PAGE',
  SET_ACTIVE_PROJECT: 'SET_ACTIVE_PROJECT',
  SET_ACTIVE_PROJECT_TAB: 'SET_ACTIVE_PROJECT_TAB',
  SET_THEME: 'SET_THEME',
  SET_TOAST: 'SET_TOAST',
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
};

/* ── reducer ────────────────────────────────────────────────── */
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_PROJECTS:
      return { ...state, projects: action.payload };
    case ACTIONS.ADD_PROJECT:
      return { ...state, projects: [...state.projects, action.payload] };
    case ACTIONS.UPDATE_PROJECT:
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };
    case ACTIONS.REMOVE_PROJECT:
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        tasks: state.tasks.filter((t) => t.projectId !== action.payload),
        anomalies: state.anomalies.filter((a) => a.projectId !== action.payload),
        activeProjectId:
          state.activeProjectId === action.payload ? null : state.activeProjectId,
        activePage:
          state.activeProjectId === action.payload ? 'pageProjects' : state.activePage,
      };
    case ACTIONS.SET_TASKS:
      return { ...state, tasks: action.payload };
    case ACTIONS.ADD_TASK:
      return { ...state, tasks: [...state.tasks, action.payload] };
    case ACTIONS.UPDATE_TASK:
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.payload.id ? action.payload : t
        ),
      };
    case ACTIONS.UPDATE_TASKS_BATCH: {
      const updateMap = new Map(action.payload.map(t => [t.id, t]));
      return {
        ...state,
        tasks: state.tasks.map(t => updateMap.has(t.id) ? updateMap.get(t.id) : t),
      };
    }
    case ACTIONS.REMOVE_TASK:
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload),
      };
    case ACTIONS.SET_ANOMALIES:
      return { ...state, anomalies: action.payload };
    case ACTIONS.ADD_ANOMALY:
      return { ...state, anomalies: [...state.anomalies, action.payload] };
    case ACTIONS.UPDATE_ANOMALY:
      return {
        ...state,
        anomalies: state.anomalies.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };
    case ACTIONS.REMOVE_ANOMALY:
      return {
        ...state,
        anomalies: state.anomalies.filter((a) => a.id !== action.payload),
      };
    case ACTIONS.SET_ACTIVE_PAGE:
      return { ...state, activePage: action.payload };
    case ACTIONS.SET_ACTIVE_PROJECT:
      return {
        ...state,
        activeProjectId: action.payload,
        activeProjectTab: 'overview',
        activePage: action.payload ? 'pageProjectWorkspace' : 'pageProjects',
      };
    case ACTIONS.SET_ACTIVE_PROJECT_TAB:
      return { ...state, activeProjectTab: action.payload };
    case ACTIONS.SET_THEME:
      return { ...state, theme: action.payload };
    case ACTIONS.SET_TOAST:
      return { ...state, toast: action.payload };
    case ACTIONS.TOGGLE_SIDEBAR:
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    default:
      return state;
  }
}

/* ── context ────────────────────────────────────────────────── */
export const AppContext = createContext();

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  /* Boot: init DB + load all data */
  useEffect(() => {
    (async () => {
      await initDB();
      const projects = await getAllProjects();
      const tasks = await getAllTasks();
      const anomalies = await getAllAnomalies();
      dispatch({ type: ACTIONS.SET_PROJECTS, payload: projects });
      dispatch({ type: ACTIONS.SET_TASKS, payload: tasks });
      dispatch({ type: ACTIONS.SET_ANOMALIES, payload: anomalies });
    })();
  }, []);

  /* Persist theme */
  useEffect(() => {
    localStorage.setItem('projeta_theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  /* Auto-dismiss toast */
  useEffect(() => {
    if (state.toast) {
      const id = setTimeout(() => {
        dispatch({ type: ACTIONS.SET_TOAST, payload: null });
      }, 3500);
      return () => clearTimeout(id);
    }
  }, [state.toast]);

  /* ── helper actions (persist + dispatch) ─────────────────── */
  const addProject = useCallback(async (project) => {
    const id = await dbSaveProject(project);
    const saved = { ...project, id };
    dispatch({ type: ACTIONS.ADD_PROJECT, payload: saved });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Projeto criado!', type: 'success' } });
    return saved;
  }, []);

  const updateProject = useCallback(async (project) => {
    await dbSaveProject(project);
    dispatch({ type: ACTIONS.UPDATE_PROJECT, payload: project });
  }, []);

  const removeProject = useCallback(async (id) => {
    await dbDeleteProject(id);
    dispatch({ type: ACTIONS.REMOVE_PROJECT, payload: id });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Projeto removido', type: 'info' } });
  }, []);

  const addTask = useCallback(async (task) => {
    const id = await dbSaveTask(task);
    const saved = { ...task, id };
    dispatch({ type: ACTIONS.ADD_TASK, payload: saved });
    return saved;
  }, []);

  const updateTask = useCallback(async (task) => {
    await dbSaveTask(task);
    dispatch({ type: ACTIONS.UPDATE_TASK, payload: task });
  }, []);

  const updateTasksBatch = useCallback(async (tasksToUpdate) => {
    for (const t of tasksToUpdate) {
      await dbSaveTask(t);
    }
    dispatch({ type: ACTIONS.UPDATE_TASKS_BATCH, payload: tasksToUpdate });
  }, []);

  const removeTask = useCallback(async (id) => {
    await dbDeleteTask(id);
    dispatch({ type: ACTIONS.REMOVE_TASK, payload: id });
  }, []);

  const addAnomaly = useCallback(async (anomaly) => {
    const id = await dbSaveAnomaly(anomaly);
    const saved = { ...anomaly, id };
    dispatch({ type: ACTIONS.ADD_ANOMALY, payload: saved });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Anomalia registrada!', type: 'success' } });
    return saved;
  }, []);

  const updateAnomaly = useCallback(async (anomaly) => {
    await dbSaveAnomaly(anomaly);
    dispatch({ type: ACTIONS.UPDATE_ANOMALY, payload: anomaly });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Anomalia atualizada!', type: 'success' } });
  }, []);

  const removeAnomaly = useCallback(async (id) => {
    await dbDeleteAnomaly(id);
    dispatch({ type: ACTIONS.REMOVE_ANOMALY, payload: id });
  }, []);

  const navigate = useCallback((page) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PAGE, payload: page });
  }, []);

  const selectProject = useCallback((id) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PROJECT, payload: id });
  }, []);

  const setProjectTab = useCallback((tab) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PROJECT_TAB, payload: tab });
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message, type } });
  }, []);

  const value = {
    state,
    dispatch,
    ACTIONS,
    addProject,
    updateProject,
    removeProject,
    addTask,
    updateTask,
    updateTasksBatch,
    removeTask,
    addAnomaly,
    updateAnomaly,
    removeAnomaly,
    navigate,
    selectProject,
    setProjectTab,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
