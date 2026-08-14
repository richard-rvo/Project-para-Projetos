import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import AnomalyBoard from '../components/anomalies/AnomalyBoard';

/* Central global: as anomalias de TODOS os projetos.
   Registrar exige um projeto, então aqui é só leitura e triagem —
   a coluna de projeto aparece para dar o contexto que falta. */

export default function PageAnomalies() {
  const { state, updateAnomaly, removeAnomaly, showToast } = useContext(AppContext);

  return (
    <AnomalyBoard
      anomalies={state.anomalies}
      tasks={state.tasks}
      projects={state.projects}
      showProject
      canCreate={false}
      onError={(msg) => showToast(msg, 'error')}
      onUpdate={async (data) => { await updateAnomaly(data); return data; }}
      onDelete={removeAnomaly}
    />
  );
}
