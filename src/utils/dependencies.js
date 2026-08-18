/* ═══════════════════════════════════════════════════════════════
   DEPENDÊNCIAS — tipos FS/SS/FF/SF com defasagem
   ═══════════════════════════════════════════════════════════════

   Formato antigo (v2):  dependsOn: "t1,t3"        — só FS, lag 0
   Formato novo  (v3):  dependsOn: [{ id, type, lag }]

   `readDependencies` aceita os DOIS. A migração do IndexedDB converte
   o banco, mas backups antigos e projetos importados continuam
   chegando no formato velho — ler os dois não é gentileza, é o que
   impede o import de virar perda de dados.
   ═══════════════════════════════════════════════════════════════ */

export const DEPENDENCY_TYPES = [
  { id: 'FS', label: 'Término → Início', hint: 'A sucessora começa depois que a predecessora termina' },
  { id: 'SS', label: 'Início → Início', hint: 'As duas começam juntas' },
  { id: 'FF', label: 'Término → Término', hint: 'As duas terminam juntas' },
  { id: 'SF', label: 'Início → Término', hint: 'A sucessora termina quando a predecessora começa' },
];

const VALID_TYPES = new Set(['FS', 'SS', 'FF', 'SF']);

/** Normaliza qualquer forma de `dependsOn` para a lista canônica. */
export function readDependencies(dependsOn) {
  if (!dependsOn) return [];

  if (Array.isArray(dependsOn)) {
    return dependsOn
      .map((d) => (typeof d === 'string'
        ? { id: d.trim(), type: 'FS', lag: 0 }
        : {
            id: String(d?.id ?? '').trim(),
            type: VALID_TYPES.has(d?.type) ? d.type : 'FS',
            lag: Number.isFinite(Number(d?.lag)) ? Number(d.lag) : 0,
          }))
      .filter((d) => d.id);
  }

  /* Formato v2: "t1, t3" — e também "3FS+2" digitado à mão, que o
     usuário pode ter colado vindo do MS Project. */
  return String(dependsOn)
    .split(',')
    .map((raw) => parseToken(raw.trim()))
    .filter(Boolean);
}

function parseToken(token) {
  if (!token) return null;
  const match = token.match(/^(.*?)(?:(FS|SS|FF|SF))?(?:([+-]\d+))?$/i);
  if (!match) return { id: token, type: 'FS', lag: 0 };

  const id = (match[1] || '').trim();
  if (!id) return null;
  return {
    id,
    type: match[2] ? match[2].toUpperCase() : 'FS',
    lag: match[3] ? parseInt(match[3], 10) : 0,
  };
}

/** Grava sempre no formato novo. */
export function writeDependencies(list) {
  return readDependencies(list).map(({ id, type, lag }) => ({ id, type, lag }));
}

/** Só os ids — para quem não se importa com tipo nem lag. */
export function dependencyIds(dependsOn) {
  return readDependencies(dependsOn).map((d) => d.id);
}

/** "2FS+3" — rótulo compacto estilo MS Project. Omite o que é padrão. */
export function formatDependency(dep, rowNumber) {
  const base = String(rowNumber);
  const type = dep.type && dep.type !== 'FS' ? dep.type : '';
  const lag = dep.lag ? (dep.lag > 0 ? `+${dep.lag}` : `${dep.lag}`) : '';
  return `${base}${type}${lag}`;
}

/**
 * Converte o texto da célula ("2, 4SS+1") em dependências reais.
 * @param {string} text
 * @param {object[]} rows tarefas na ordem exibida
 * @param {string} selfId id da própria tarefa, para recusar auto-referência
 */
export function parseDependencyInput(text, rows, selfId) {
  const deps = [];
  const invalid = [];
  if (!text?.trim()) return { deps, invalid };

  String(text).split(',').forEach((raw) => {
    const token = raw.trim();
    if (!token) return;

    const match = token.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?$/i);
    if (!match) { invalid.push(token); return; }

    /* Linha fora do projeto, ou a própria tarefa: o texto está bem
       formado mas não aponta para nada aproveitável. Entra em
       `invalid` do mesmo jeito — antes sumia sem deixar rastro, e a
       célula voltava vazia como se o campo não funcionasse. */
    const task = rows[parseInt(match[1], 10) - 1];
    if (!task || task.id === selfId) { invalid.push(token); return; }

    deps.push({
      id: task.id,
      type: match[2] ? match[2].toUpperCase() : 'FS',
      lag: match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0,
    });
  });

  return { deps, invalid };
}

/**
 * Uma dependência de `predecessorId` para `successor` criaria ciclo?
 * Sem esta checagem o forward pass entra em laço.
 */
export function wouldCreateCycle(predecessorId, successorId, tasks) {
  if (predecessorId === successorId) return true;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set();
  const stack = [predecessorId];

  while (stack.length) {
    const id = stack.pop();
    if (id === successorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const task = byId.get(id);
    if (task) stack.push(...dependencyIds(task.dependsOn));
  }
  return false;
}
