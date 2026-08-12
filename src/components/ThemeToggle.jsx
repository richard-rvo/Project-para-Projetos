import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { state, dispatch, ACTIONS } = useContext(AppContext);
  const isDark = state.theme === 'dark';

  return (
    <button
      className="btn-icon-only theme-toggle-btn"
      onClick={() => dispatch({ type: ACTIONS.SET_THEME, payload: isDark ? 'light' : 'dark' })}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      aria-label="Alternar tema"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
