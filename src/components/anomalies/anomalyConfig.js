/* ═══════════════════════════════════════════════════════════════
   ANOMALIAS — vocabulário compartilhado

   As duas telas de anomalia (central global e a do projeto) tinham
   cópias próprias destas constantes e das cores. Um valor novo
   precisava ser adicionado em dois lugares, e as cores já não batiam
   entre elas.
   ═══════════════════════════════════════════════════════════════ */

export const SEVERITY_OPTIONS = ['baixa', 'média', 'alta', 'crítica'];

export const SEVERITY_TONE = {
  baixa: 'bg-sched-on-track-soft text-sched-on-track',
  média: 'bg-sched-at-risk-soft text-sched-at-risk',
  alta: 'bg-sched-late-soft text-sched-late',
  crítica: 'bg-sched-critical-soft text-sched-critical',
};

export const SEVERITY_DOT = {
  baixa: 'bg-sched-on-track',
  média: 'bg-sched-at-risk',
  alta: 'bg-sched-late',
  crítica: 'bg-sched-critical',
};

export const STATUS_OPTIONS = ['aberta', 'em análise', 'resolvida', 'cancelada'];

export const STATUS_TONE = {
  aberta: 'bg-sched-late-soft text-sched-late',
  'em análise': 'bg-sched-at-risk-soft text-sched-at-risk',
  resolvida: 'bg-sched-done-soft text-sched-done',
  cancelada: 'bg-surface-3 text-text-3',
};

export const TYPE_OPTIONS = [
  'Segurança', 'Qualidade', 'Prazo', 'Técnico', 'Ambiental', 'Outro',
];

export const DISCIPLINES = [
  'Civil', 'Mecânica', 'Elétrica', 'Instrumentação', 'Tubulação', 'Estrutura', 'Outro',
];

export const EMPTY_ANOMALY = {
  title: '', description: '', severity: 'média', type: 'Técnico',
  status: 'aberta', reportedBy: '', taskId: '',
  osNumber: '', equipment: '', location: '', discipline: '',
  rootCause: '', correctiveAction: '',
  photos: [],
};

export const FORM_STEPS = ['Identificação', 'Detalhes', 'Fotos', 'Revisar'];

export const MAX_PHOTOS = 5;

export function formatDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Comprime para ≤ maxKB reduzindo qualidade progressivamente.
 * As fotos ficam em base64 no IndexedDB — sem isso, meia dúzia de
 * registros de campo estouram a cota do navegador.
 */
export async function compressImage(file, maxKB = 300) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const MAX_DIM = 1200;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      let quality = 0.85;
      const attempt = () => {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const kb = Math.round((dataUrl.length * 0.75) / 1024);
        if (kb <= maxKB || quality <= 0.3) {
          URL.revokeObjectURL(url);
          resolve(dataUrl);
          return;
        }
        quality -= 0.1;
        attempt();
      };
      attempt();
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
