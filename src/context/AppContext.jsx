import React, { createContext, useReducer, useEffect, useCallback } from 'react';
import { initDB, getAllProjects, saveProject as dbSaveProject, deleteProject as dbDeleteProject, saveTask as dbSaveTask, deleteTask as dbDeleteTask } from '../utils/storage';

/* ── initial state ──────────────────────────────────────────── */
const initialState = {
  projects: [],
  tasks: [],
  activeProjectId: null,
  activePage: 'pageProjects',
  theme: localStorage.getItem('gantt_theme') || 'light',
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
  REMOVE_TASK: 'REMOVE_TASK',
  SET_ACTIVE_PAGE: 'SET_ACTIVE_PAGE',
  SET_ACTIVE_PROJECT: 'SET_ACTIVE_PROJECT',
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
        activeProjectId:
          state.activeProjectId === action.payload
            ? null
            : state.activeProjectId,
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
    case ACTIONS.REMOVE_TASK:
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload),
      };
    case ACTIONS.SET_ACTIVE_PAGE:
      return { ...state, activePage: action.payload };
    case ACTIONS.SET_ACTIVE_PROJECT:
      return { ...state, activeProjectId: action.payload };
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

  /* Boot: init DB + load data */
  useEffect(() => {
    (async () => {
      await initDB();
      const projects = await getAllProjects();
      dispatch({ type: ACTIONS.SET_PROJECTS, payload: projects });
      // tasks are loaded per-project when user selects one
    })();
  }, []);

  /* Persist theme */
  useEffect(() => {
    localStorage.setItem('gantt_theme', state.theme);
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

  const removeTask = useCallback(async (id) => {
    await dbDeleteTask(id);
    dispatch({ type: ACTIONS.REMOVE_TASK, payload: id });
  }, []);

  const navigate = useCallback((page) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PAGE, payload: page });
  }, []);

  const selectProject = useCallback((id) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PROJECT, payload: id });
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
    removeTask,
    navigate,
    selectProject,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
