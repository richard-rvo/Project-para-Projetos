/* ═══════════════════════════════════════════════════════════════
   DEPENDÊNCIAS — tipos TI/II/TT/IT com defasagem
   ═══════════════════════════════════════════════════════════════

   Formato antigo (v2):  dependsOn: "t1,t3"        — só FS, lag 0
   Formato novo  (v3):  dependsOn: [{ id, type, lag }]

   O motor guarda FS/SS/FF/SF, mas a UI aceita e exibe os equivalentes
   em português: TI, II, TT e IT.

   `readDependencies` aceita os DOIS. A migração do IndexedDB converte
   o banco, mas backups antigos e projetos importados continuam
   chegando no formato velho — ler os dois não é gentileza, é o que
   impede o import de virar perda de dados.
   ═══════════════════════════════════════════════════════════════ */

export const DEPENDENCY_TYPES = [
  { id: 'FS', code: 'TI', label: 'Término → Início', hint: 'A sucessora começa depois que a predecessora termina' },
  { id: 'SS', code: 'II', label: 'Início → Início', hint: 'As duas começam juntas' },
  { id: 'FF', code: 'TT', label: 'Término → Término', hint: 'As duas terminam juntas' },
  { id: 'SF', code: 'IT', label: 'Início → Término', hint: 'A sucessora termina quando a predecessora começa' },
];

const UI_CODE_BY_TYPE = new Map(DEPENDENCY_TYPES.map((type) => [type.id, type.code]));
const TYPE_BY_UI_CODE = new Map(DEPENDENCY_TYPES.map((type) => [type.code, type.id]));
const VALID_TYPES = new Set(['FS', 'SS', 'FF', 'SF']);
const TYPE_PATTERN = 'FS|SS|FF|SF|TI|II|TT|IT';

export function normalizeDependencyType(type) {
  const code = String(type || '').trim().toUpperCase();
  return VALID_TYPES.has(code) ? code : TYPE_BY_UI_CODE.get(code) || 'FS';
}

export function dependencyTypeCode(type) {
  return UI_CODE_BY_TYPE.get(normalizeDependencyType(type)) || 'TI';
}

function splitDependencyTokens(value) {
  return String(value)
    .split(/[;,]/)
    .map((raw) => raw.trim())
    .filter(Boolean);
}

/** Normaliza qualquer forma de `dependsOn` para a lista canônica. */
export function readDependencies(dependsOn) {
  if (!dependsOn) return [];

  if (Array.isArray(dependsOn)) {
    return dependsOn
      .map((d) => (typeof d === 'string'
        ? { id: d.trim(), type: 'FS', lag: 0 }
        : {
            id: String(d?.id ?? '').trim(),
            type: normalizeDependencyType(d?.type),
            lag: Number.isFinite(Number(d?.lag)) ? Number(d.lag) : 0,
          }))
      .filter((d) => d.id);
  }

  /* Formato v2: "t1, t3" — e também "3TI+2; 4II", que o usuário pode
     ter colado vindo do MS Project em português. Vírgula continua
     aceita para compatibilidade com backups/células antigas. */
  return splitDependencyTokens(dependsOn)
    .map((raw) => parseToken(raw))
    .filter(Boolean);
}

function parseToken(token) {
  if (!token) return null;
  const match = token.match(new RegExp(`^(.*?)(?:(${TYPE_PATTERN}))?(?:([+-]\\d+))?$`, 'i'));
  if (!match) return { id: token, type: 'FS', lag: 0 };

  const id = (match[1] || '').trim();
  if (!id) return null;
  return {
    id,
    type: normalizeDependencyType(match[2]),
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

/** "2+3; 4II" — TI é padrão implícito; outros tipos ficam explícitos. */
export function formatDependency(dep, rowNumber) {
  const base = String(rowNumber);
  const type = normalizeDependencyType(dep.type);
  const code = type === 'FS' ? '' : dependencyTypeCode(type);
  const lag = dep.lag ? (dep.lag > 0 ? `+${dep.lag}` : `${dep.lag}`) : '';
  return `${base}${code}${lag}`;
}

/**
 * Converte o texto da célula ("2; 4II+1") em dependências reais.
 * @param {string} text
 * @param {object[]} rows tarefas na ordem exibida
 * @param {string} selfId id da própria tarefa, para recusar auto-referência
 */
export function parseDependencyInput(text, rows, selfId) {
  const deps = [];
  const invalid = [];
  if (!text?.trim()) return { deps, invalid };

  splitDependencyTokens(text).forEach((token) => {
    const match = token.match(new RegExp(`^(\\d+)\\s*(${TYPE_PATTERN})?\\s*([+-]\\s*\\d+)?\\s*(?:d|dia|dias)?$`, 'i'));
    if (!match) { invalid.push(token); return; }

    /* Linha fora do projeto, ou a própria tarefa: o texto está bem
       formado mas não aponta para nada aproveitável. Entra em
       `invalid` do mesmo jeito — antes sumia sem deixar rastro, e a
       célula voltava vazia como se o campo não funcionasse. */
    const task = rows[parseInt(match[1], 10) - 1];
    if (!task || task.id === selfId) { invalid.push(token); return; }

    deps.push({
      id: task.id,
      type: normalizeDependencyType(match[2]),
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
