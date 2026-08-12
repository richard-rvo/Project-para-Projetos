import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';

export default function Toast() {
  const { state } = useContext(AppContext);
  if (!state.toast) return null;

  const typeClass = `toast--${state.toast.type || 'info'}`;

  return (
    <div className={`toast ${typeClass}`} role="alert">
      <span>{state.toast.message}</span>
    </div>
  );
}
