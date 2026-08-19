import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MS_DAY = 86_400_000;
const now = new Date();
const localIso = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 10);
const TODAY = localIso(now);

const shift = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const workday = (date, offset) => {
  let value = date;
  let remaining = offset;
  const direction = offset >= 0 ? 1 : -1;
  while (remaining !== 0) {
    value = shift(value, direction);
    const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= direction;
  }
  while ([0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay())) value = shift(value, 1);
  return value;
};

const at = (date, time) => `${date}T${time}`;
const OPEN = '08:00';
const CLOSE = '17:00';

const STANDARD = {
  id: 'padrao', name: 'Padrão', workdays: [1, 2, 3, 4, 5],
  shifts: [{ from: '08:00', to: '12:00' }, { from: '13:00', to: '17:00' }],
  holidays: ['2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15'],
};
const CONTINUOUS = {
  id: '24h', name: 'Operação 24 Horas', workdays: [0, 1, 2, 3, 4, 5, 6],
  shifts: [{ from: '00:00', to: '24:00' }], holidays: [],
};
const SIX_BY_ONE = {
  id: 'seis-por-um', name: 'Campo 6 × 1', workdays: [1, 2, 3, 4, 5, 6],
  shifts: [{ from: '07:00', to: '13:00' }], holidays: [],
};

const projects = [];
const tasks = [];
const anomalies = [];

function addProject(id, name, options) {
  const project = {
    id, name, description: options.description,
    startDate: options.startDate, endDate: options.endDate, status: options.status,
    createdAt: new Date(now.getTime() - options.createdDaysAgo * MS_DAY).toISOString(),
    calendars: options.calendars ?? [STANDARD],
    defaultCalendarId: options.defaultCalendarId ?? STANDARD.id,
  };
  projects.push(project);
  return project;
}

function addTask(project, anchor, id, name, options = {}) {
  const continuous = options.calendarId === CONTINUOUS.id;
  const move = continuous ? shift : workday;
  const start = move(anchor, options.startOffset ?? 0);
  const end = options.milestone
    ? start
    : move(start, continuous ? (options.days ?? 1) : Math.max(0, (options.days ?? 1) - 1));
  const task = {
    id, projectId: project.id, name,
    startDate: at(start, continuous ? '00:00' : OPEN),
    endDate: at(end, options.milestone ? (continuous ? '00:00' : OPEN) : (continuous ? '00:00' : CLOSE)),
    progress: options.progress ?? 0,
    dependsOn: options.dependsOn ?? [],
    indentLevel: options.level ?? 0,
    order: tasks.filter((item) => item.projectId === project.id).length,
    scheduleMode: options.manual ? 'manual' : 'auto',
  };

  if (options.baselineOffset !== undefined) {
    const baselineStart = move(anchor, options.baselineOffset);
    const baselineEnd = options.milestone
      ? baselineStart
      : move(baselineStart, continuous
        ? (options.baselineDays ?? options.days ?? 1)
        : Math.max(0, (options.baselineDays ?? options.days ?? 1) - 1));
    task.baselineStart = at(baselineStart, continuous ? '00:00' : OPEN);
    task.baselineEnd = at(baselineEnd, options.milestone
      ? (continuous ? '00:00' : OPEN)
      : (continuous ? '00:00' : CLOSE));
  }
  if (options.resources) task.resources = options.resources;
  if (options.group) task.resourceGroup = options.group;
  if (options.calendarId) task.calendarId = options.calendarId;
  if (options.notes) task.notes = options.notes;
  if (options.constraintType) {
    task.constraintType = options.constraintType;
    task.constraintDate = at(move(anchor, options.constraintOffset), continuous ? '00:00' : OPEN);
  }
  tasks.push(task);
  return task;
}

const dependency = (task, type = 'FS', lag = 0) => [{ id: task.id, type, lag }];

function addAnomaly(project, task, id, options) {
  anomalies.push({
    id, projectId: project.id, taskId: task?.id ?? '', title: options.title,
    description: options.description, severity: options.severity,
    type: options.type ?? 'Técnico', status: options.status,
    reportedBy: options.reportedBy,
    reportedAt: new Date(now.getTime() - options.daysAgo * MS_DAY).toISOString(),
    osNumber: options.osNumber ?? '', equipment: options.equipment ?? '',
    location: options.location, discipline: options.discipline,
    rootCause: options.rootCause ?? '', correctiveAction: options.correctiveAction ?? '', photos: [],
  });
}

// 1. Absorvedora de NH3: engenharia concluída e montagem com desvio.
{
  const anchor = workday(TODAY, -42);
  const project = addProject('usr-project-absorvedora-nh3', 'Revamp da Absorvedora de NH3 — Carboquímicos', {
    description: 'Recuperação interna, substituição de recheios, revisão de distribuidores e adequação do circuito de licor da absorvedora de amônia.',
    startDate: anchor, endDate: workday(anchor, 64), status: 'Em Andamento',
    createdDaysAgo: 70, calendars: [STANDARD, SIX_BY_ONE],
  });

  addTask(project, anchor, 'nh3-engineering', 'Engenharia e preparação', { level: 0 });
  const survey = addTask(project, anchor, 'nh3-survey', 'Levantamento dimensional e inspeção interna', {
    level: 1, days: 5, progress: 100, baselineOffset: 0, baselineDays: 5,
    resources: '2 Inspetores + Operação', group: 'Inspeção',
  });
  const engineering = addTask(project, anchor, 'nh3-detailing', 'Detalhamento de internos e suportação', {
    level: 1, startOffset: 5, days: 10, progress: 100, dependsOn: dependency(survey),
    baselineOffset: 5, baselineDays: 10, resources: '3 Projetistas', group: 'Engenharia',
  });
  const procurement = addTask(project, anchor, 'nh3-procurement', 'Fabricação dos recheios e distribuidores', {
    level: 1, startOffset: 15, days: 18, progress: 100, dependsOn: dependency(engineering),
    baselineOffset: 15, baselineDays: 16, resources: 'Suprimentos + Fornecedor', group: 'Suprimentos',
    notes: 'Itens em aço inoxidável; inspeção dimensional antes do embarque.',
  });
  addTask(project, anchor, 'nh3-field', 'Intervenção em campo', { level: 0, startOffset: 33 });
  const isolation = addTask(project, anchor, 'nh3-isolation', 'Bloqueio, lavagem e liberação para entrada', {
    level: 1, startOffset: 33, days: 3, progress: 100, dependsOn: dependency(procurement),
    baselineOffset: 31, baselineDays: 3, resources: 'Operação + Segurança', group: 'Operação',
  });
  const removal = addTask(project, anchor, 'nh3-removal', 'Remoção dos internos existentes', {
    level: 1, startOffset: 36, days: 6, progress: 100, dependsOn: dependency(isolation),
    baselineOffset: 34, baselineDays: 5, resources: '8 Caldeireiros', group: 'Mecânica',
    calendarId: SIX_BY_ONE.id,
  });
  const repair = addTask(project, anchor, 'nh3-shell-repair', 'Reparo de costado e suportes internos', {
    level: 1, startOffset: 42, days: 9, progress: 62, dependsOn: dependency(removal),
    baselineOffset: 39, baselineDays: 6, resources: '6 Caldeireiros + 3 Soldadores', group: 'Mecânica',
    calendarId: SIX_BY_ONE.id,
    notes: 'Espessura abaixo do mínimo no quadrante norte, entre as cotas +8,2 m e +9,1 m.',
  });
  const internals = addTask(project, anchor, 'nh3-internals', 'Montagem de recheios e distribuidores', {
    level: 1, startOffset: 51, days: 8, progress: 20, dependsOn: dependency(repair),
    baselineOffset: 45, baselineDays: 7, resources: '10 Montadores', group: 'Mecânica',
    calendarId: SIX_BY_ONE.id,
  });
  const piping = addTask(project, anchor, 'nh3-piping', 'Adequação das linhas de licor e amônia', {
    level: 1, startOffset: 45, days: 9, progress: 48, dependsOn: dependency(repair, 'SS', 3),
    baselineOffset: 42, baselineDays: 8, resources: '5 Tubistas + 2 Soldadores', group: 'Tubulação',
  });
  const test = addTask(project, anchor, 'nh3-test', 'Teste de estanqueidade e flushing', {
    level: 1, startOffset: 59, days: 4, progress: 0,
    dependsOn: [{ id: internals.id, type: 'FS', lag: 0 }, { id: piping.id, type: 'FS', lag: 0 }],
    baselineOffset: 52, baselineDays: 4, resources: 'Operação + Qualidade', group: 'Comissionamento',
  });
  addTask(project, anchor, 'nh3-startup', 'Retorno da absorvedora à operação', {
    level: 0, startOffset: 64, milestone: true, progress: 0, dependsOn: dependency(test),
    baselineOffset: 56, resources: 'Operação', group: 'Operação',
  });

  addAnomaly(project, repair, 'usr-anomaly-nh3-thickness', {
    title: 'Perda de espessura no costado acima do previsto',
    description: 'Ultrassom identificou região com 4,8 mm para espessura nominal de 8 mm, ampliando o escopo de chapa de reparo.',
    severity: 'crítica', status: 'em análise', reportedBy: 'Carlos Menezes', daysAgo: 3,
    osNumber: 'OS-CRQ-26841', equipment: 'Absorvedora NH3 A-2101',
    location: 'Carboquímicos — cota +8,5 m', discipline: 'Mecânica',
    rootCause: 'Corrosão sob depósito associada à distribuição irregular do licor.',
    correctiveAction: 'Escopo de chapa ampliado; memória de cálculo em aprovação.',
  });
  addAnomaly(project, internals, 'usr-anomaly-nh3-distributor', {
    title: 'Furação do distribuidor fora do desenho aprovado',
    description: 'Doze furos apresentam diâmetro 2 mm acima da especificação, com risco de má distribuição do licor.',
    severity: 'alta', type: 'Qualidade', status: 'aberta', reportedBy: 'Juliana Reis', daysAgo: 1,
    osNumber: 'RNC-2026-117', equipment: 'Distribuidor superior D-2101',
    location: 'Área de pré-montagem', discipline: 'Mecânica',
  });
}

// 2. Selo pote: intervenção curta na parada do exaustor principal.
{
  const anchor = workday(TODAY, -12);
  const project = addProject('usr-project-selo-pote-exaustor', 'Adequação do Selo Pote — Exaustor Principal', {
    description: 'Substituição do selo pote, adequação das linhas de transbordo e drenagem e revisão dos intertravamentos do exaustor de gás.',
    startDate: anchor, endDate: workday(anchor, 24), status: 'Em Andamento',
    createdDaysAgo: 31, calendars: [STANDARD, CONTINUOUS],
  });

  addTask(project, anchor, 'seal-preparation', 'Preparação da intervenção', { level: 0 });
  const design = addTask(project, anchor, 'seal-design', 'Revisão do arranjo e memória de cálculo', {
    level: 1, days: 5, progress: 100, baselineOffset: 0, baselineDays: 5,
    resources: '2 Engenheiros', group: 'Engenharia',
  });
  const fabrication = addTask(project, anchor, 'seal-fabrication', 'Fabricação do novo selo pote e spools', {
    level: 1, startOffset: 5, days: 8, progress: 100, dependsOn: dependency(design),
    baselineOffset: 5, baselineDays: 8, resources: 'Caldeiraria externa', group: 'Suprimentos',
  });
  const preassembly = addTask(project, anchor, 'seal-preassembly', 'Pré-montagem e inspeção dimensional', {
    level: 1, startOffset: 13, days: 3, progress: 100, dependsOn: dependency(fabrication),
    baselineOffset: 13, baselineDays: 3, resources: '2 Inspetores + 4 Montadores', group: 'Qualidade',
  });
  addTask(project, anchor, 'seal-shutdown', 'Janela de parada', { level: 0, startOffset: 16 });
  const stop = addTask(project, anchor, 'seal-stop', 'Parada, bloqueio e inertização do exaustor', {
    level: 1, startOffset: 16, days: 1, progress: 100, dependsOn: dependency(preassembly),
    baselineOffset: 16, baselineDays: 1, resources: 'Operação + Segurança', group: 'Operação',
    calendarId: CONTINUOUS.id,
  });
  const dismantle = addTask(project, anchor, 'seal-dismantle', 'Desmontagem do selo pote existente', {
    level: 1, startOffset: 17, days: 2, progress: 70, dependsOn: dependency(stop),
    baselineOffset: 17, baselineDays: 2, resources: '6 Mecânicos', group: 'Mecânica',
    calendarId: CONTINUOUS.id,
  });
  const installation = addTask(project, anchor, 'seal-installation', 'Instalação do novo conjunto', {
    level: 1, startOffset: 19, days: 2, progress: 0, dependsOn: dependency(dismantle),
    baselineOffset: 19, baselineDays: 2, resources: '6 Mecânicos + 2 Soldadores', group: 'Mecânica',
    calendarId: CONTINUOUS.id,
  });
  const instrumentation = addTask(project, anchor, 'seal-instrumentation', 'Montagem de nível, drenos e intertravamentos', {
    level: 1, startOffset: 19, days: 2, progress: 0, dependsOn: dependency(installation, 'SS', 0),
    baselineOffset: 19, baselineDays: 2, resources: '3 Instrumentistas', group: 'Instrumentação',
    calendarId: CONTINUOUS.id,
  });
  const leakTest = addTask(project, anchor, 'seal-leak-test', 'Teste de estanqueidade e funcional', {
    level: 1, startOffset: 21, days: 1, progress: 0,
    dependsOn: [{ id: installation.id, type: 'FS', lag: 0 }, { id: instrumentation.id, type: 'FS', lag: 0 }],
    baselineOffset: 21, baselineDays: 1, resources: 'Qualidade + Operação', group: 'Comissionamento',
    calendarId: CONTINUOUS.id,
  });
  addTask(project, anchor, 'seal-restart', 'Partida do exaustor principal', {
    level: 0, startOffset: 22, milestone: true, progress: 0, dependsOn: dependency(leakTest),
    baselineOffset: 22, resources: 'Operação', group: 'Operação', calendarId: CONTINUOUS.id,
    constraintType: 'mso', constraintOffset: 22,
  });

  addAnomaly(project, dismantle, 'usr-anomaly-seal-bolts', {
    title: 'Prisioneiros da flange com corrosão severa',
    description: 'Seis prisioneiros não responderam ao torque de desmontagem e exigem corte controlado.',
    severity: 'alta', status: 'aberta', reportedBy: 'André Souza', daysAgo: 1,
    osNumber: 'OS-GAS-27102', equipment: 'Selo pote SP-3102',
    location: 'Casa do Exaustor — linha de sucção', discipline: 'Mecânica',
    correctiveAction: 'Equipe de corte mobilizada e kit de prisioneiros reserva conferido.',
  });
  addAnomaly(project, instrumentation, 'usr-anomaly-seal-level', {
    title: 'Transmissor de nível entregue sem certificação de área',
    description: 'Modelo recebido não possui certificado Ex compatível com a classificação do local.',
    severity: 'crítica', type: 'Segurança', status: 'em análise', reportedBy: 'Mariana Costa', daysAgo: 2,
    osNumber: 'RNC-2026-124', equipment: 'LT-3102',
    location: 'Almoxarifado de parada', discipline: 'Instrumentação',
  });
}

// 3. Nova planta: projeto longo em engenharia e suprimentos.
{
  const anchor = workday(TODAY, -18);
  const project = addProject('usr-project-tratamento-gas', 'Implantação da Planta de Tratamento de Gás — Siderúrgica', {
    description: 'Nova unidade para resfriamento, remoção de particulados, NH3 e H2S do gás de coqueria, integrada às utilidades existentes.',
    startDate: anchor, endDate: workday(anchor, 132), status: 'Em Andamento',
    createdDaysAgo: 58, calendars: [STANDARD, SIX_BY_ONE],
  });

  addTask(project, anchor, 'gtp-engineering', 'Engenharia', { level: 0 });
  const basic = addTask(project, anchor, 'gtp-basic', 'Consolidar engenharia básica e balanço de massa', {
    level: 1, days: 12, progress: 100, baselineOffset: 0, baselineDays: 12,
    resources: 'Processo + Operação', group: 'Engenharia',
  });
  const detail = addTask(project, anchor, 'gtp-detail', 'Engenharia detalhada multidisciplinar', {
    level: 1, startOffset: 12, days: 28, progress: 45, dependsOn: dependency(basic),
    baselineOffset: 12, baselineDays: 25, resources: '12 Projetistas', group: 'Engenharia',
    notes: 'Priorizar fundações, pipe rack e equipamentos de longo fornecimento.',
  });
  const hazop = addTask(project, anchor, 'gtp-hazop', 'HAZOP e consolidação das salvaguardas', {
    level: 1, startOffset: 31, days: 5, progress: 20, dependsOn: dependency(detail, 'SS', 19),
    baselineOffset: 28, baselineDays: 5, resources: 'Processo + Segurança + Operação', group: 'Segurança',
  });
  addTask(project, anchor, 'gtp-procurement', 'Suprimentos', { level: 0, startOffset: 20 });
  const packages = addTask(project, anchor, 'gtp-packages', 'Contratar pacotes de processo e equipamentos', {
    level: 1, startOffset: 20, days: 35, progress: 28, dependsOn: dependency(basic),
    baselineOffset: 20, baselineDays: 32, resources: 'Suprimentos + Engenharia', group: 'Suprimentos',
  });
  const fabrication = addTask(project, anchor, 'gtp-fabrication', 'Fabricação e diligenciamento', {
    level: 1, startOffset: 55, days: 38, progress: 0, dependsOn: dependency(packages),
    baselineOffset: 52, baselineDays: 35, resources: 'Fornecedores + Diligenciamento', group: 'Suprimentos',
  });
  addTask(project, anchor, 'gtp-construction', 'Construção e montagem', { level: 0, startOffset: 40 });
  const civil = addTask(project, anchor, 'gtp-civil', 'Terraplenagem, fundações e drenagem', {
    level: 1, startOffset: 40, days: 28, progress: 0, dependsOn: dependency(detail),
    baselineOffset: 37, baselineDays: 26, resources: '20 Civis', group: 'Civil', calendarId: SIX_BY_ONE.id,
  });
  const structures = addTask(project, anchor, 'gtp-structures', 'Montagem de estruturas e pipe rack', {
    level: 1, startOffset: 68, days: 22, progress: 0, dependsOn: dependency(civil),
    baselineOffset: 63, baselineDays: 20, resources: '14 Montadores', group: 'Estrutura', calendarId: SIX_BY_ONE.id,
  });
  const equipment = addTask(project, anchor, 'gtp-equipment', 'Montagem dos equipamentos de processo', {
    level: 1, startOffset: 90, days: 18, progress: 0,
    dependsOn: [{ id: fabrication.id, type: 'FS', lag: 0 }, { id: structures.id, type: 'FS', lag: 0 }],
    baselineOffset: 83, baselineDays: 18, resources: '12 Mecânicos', group: 'Mecânica', calendarId: SIX_BY_ONE.id,
  });
  const piping = addTask(project, anchor, 'gtp-piping', 'Montagem de tubulação e interligações', {
    level: 1, startOffset: 94, days: 24, progress: 0, dependsOn: dependency(equipment, 'SS', 4),
    baselineOffset: 87, baselineDays: 22, resources: '18 Tubistas e Soldadores', group: 'Tubulação',
    calendarId: SIX_BY_ONE.id,
  });
  const electrical = addTask(project, anchor, 'gtp-electrical', 'Elétrica, instrumentação e automação', {
    level: 1, startOffset: 96, days: 24, progress: 0, dependsOn: dependency(structures),
    baselineOffset: 89, baselineDays: 22, resources: '12 E&I', group: 'Instrumentação',
  });
  const commissioning = addTask(project, anchor, 'gtp-commissioning', 'Pré-operação e comissionamento integrado', {
    level: 0, startOffset: 120, days: 10, progress: 0,
    dependsOn: [{ id: piping.id, type: 'FS', lag: 0 }, { id: electrical.id, type: 'FS', lag: 0 }],
    baselineOffset: 111, baselineDays: 10, resources: 'Comissionamento + Operação', group: 'Comissionamento',
  });
  addTask(project, anchor, 'gtp-operation', 'Entrada de gás na nova planta', {
    level: 0, startOffset: 131, milestone: true, progress: 0, dependsOn: dependency(commissioning),
    baselineOffset: 122, resources: 'Operação', group: 'Operação',
  });

  addAnomaly(project, detail, 'usr-anomaly-gtp-tiein', {
    title: 'Tie-in de gás interfere com linha de vapor existente',
    description: 'Levantamento a laser mostrou conflito entre a nova linha DN900 e o coletor de vapor de média pressão.',
    severity: 'alta', status: 'em análise', reportedBy: 'Felipe Rocha', daysAgo: 5,
    osNumber: 'RFI-GTP-0047', equipment: 'Coletor principal de gás',
    location: 'Pipe rack PR-03 — eixo 14', discipline: 'Tubulação',
    rootCause: 'Modelo da área existente não refletia modificação executada em 2023.',
    correctiveAction: 'Rota alternativa em estudo e trecho afetado congelado.',
  });
  addAnomaly(project, packages, 'usr-anomaly-gtp-delivery', {
    title: 'Prazo do soprador excede marco de montagem',
    description: 'Proposta técnica indica 42 semanas de fabricação contra 34 semanas disponíveis no cronograma.',
    severity: 'crítica', type: 'Prazo', status: 'aberta', reportedBy: 'Ana Martins', daysAgo: 3,
    osNumber: 'PC-2026-8831', equipment: 'Soprador de gás BG-4101',
    location: 'Pacote de suprimentos', discipline: 'Mecânica',
    correctiveAction: 'Negociar fabricação prioritária e avaliar equipamento provisório.',
  });
}

// 4. Parada integrada: execução contínua com frentes simultâneas.
{
  const anchor = shift(TODAY, -5);
  const project = addProject('usr-project-parada-gas-coqueria', 'Parada Integrada do Sistema de Gás — Coqueria', {
    description: 'Parada coordenada para inspeção do coletor principal, limpeza de precipitadores, revisão de válvulas e testes.',
    startDate: anchor, endDate: shift(anchor, 14), status: 'Em Andamento',
    createdDaysAgo: 38, calendars: [STANDARD, CONTINUOUS], defaultCalendarId: CONTINUOUS.id,
  });

  addTask(project, anchor, 'shutdown-preparation', 'Preparação e liberação', { level: 0, calendarId: CONTINUOUS.id });
  const stop = addTask(project, anchor, 'shutdown-stop', 'Redução de carga, bloqueios e inertização', {
    level: 1, days: 2, progress: 100, baselineOffset: 0, baselineDays: 2,
    resources: 'Operação + Segurança', group: 'Operação', calendarId: CONTINUOUS.id,
  });
  const release = addTask(project, anchor, 'shutdown-release', 'Medição de gases e liberação das frentes', {
    level: 1, startOffset: 2, days: 1, progress: 100, dependsOn: dependency(stop),
    baselineOffset: 2, baselineDays: 1, resources: 'Segurança + Operação', group: 'Segurança',
    calendarId: CONTINUOUS.id,
  });
  addTask(project, anchor, 'shutdown-execution', 'Execução simultânea', { level: 0, startOffset: 3, calendarId: CONTINUOUS.id });
  const collector = addTask(project, anchor, 'shutdown-collector', 'Inspeção e reparo do coletor principal', {
    level: 1, startOffset: 3, days: 6, progress: 58, dependsOn: dependency(release),
    baselineOffset: 3, baselineDays: 5, resources: '8 Caldeireiros + 4 Soldadores', group: 'Mecânica',
    calendarId: CONTINUOUS.id,
  });
  const precipitator = addTask(project, anchor, 'shutdown-precipitator', 'Limpeza dos precipitadores eletrostáticos', {
    level: 1, startOffset: 3, days: 5, progress: 75, dependsOn: dependency(release),
    baselineOffset: 3, baselineDays: 5, resources: '12 Mecânicos', group: 'Mecânica', calendarId: CONTINUOUS.id,
  });
  const valves = addTask(project, anchor, 'shutdown-valves', 'Revisão das válvulas de isolamento', {
    level: 1, startOffset: 3, days: 6, progress: 46, dependsOn: dependency(release),
    baselineOffset: 3, baselineDays: 5, resources: '6 Mecânicos', group: 'Mecânica', calendarId: CONTINUOUS.id,
  });
  const drains = addTask(project, anchor, 'shutdown-drains', 'Limpeza de drenos e selos hidráulicos', {
    level: 1, startOffset: 4, days: 4, progress: 90, dependsOn: dependency(release, 'FS', 1),
    baselineOffset: 4, baselineDays: 4, resources: '5 Operadores', group: 'Operação', calendarId: CONTINUOUS.id,
  });
  const instruments = addTask(project, anchor, 'shutdown-instruments', 'Calibração de detectores e transmissores', {
    level: 1, startOffset: 4, days: 5, progress: 52, dependsOn: dependency(release, 'FS', 1),
    baselineOffset: 4, baselineDays: 4, resources: '6 Instrumentistas', group: 'Instrumentação',
    calendarId: CONTINUOUS.id,
  });
  addTask(project, anchor, 'shutdown-return', 'Testes e retorno operacional', { level: 0, startOffset: 9, calendarId: CONTINUOUS.id });
  const leak = addTask(project, anchor, 'shutdown-leak', 'Teste geral de estanqueidade', {
    level: 1, startOffset: 9, days: 2, progress: 0,
    dependsOn: [collector, precipitator, valves, drains, instruments].map((item) => ({ id: item.id, type: 'FS', lag: 0 })),
    baselineOffset: 8, baselineDays: 2, resources: 'Qualidade + Operação', group: 'Comissionamento',
    calendarId: CONTINUOUS.id,
  });
  const purge = addTask(project, anchor, 'shutdown-purge', 'Purga, pressurização e alinhamento', {
    level: 1, startOffset: 11, days: 2, progress: 0, dependsOn: dependency(leak),
    baselineOffset: 10, baselineDays: 2, resources: 'Operação', group: 'Operação', calendarId: CONTINUOUS.id,
  });
  addTask(project, anchor, 'shutdown-gas-in', 'Entrada de gás no sistema', {
    level: 0, startOffset: 13, milestone: true, progress: 0, dependsOn: dependency(purge),
    baselineOffset: 12, resources: 'Operação', group: 'Operação', calendarId: CONTINUOUS.id,
    constraintType: 'fnlt', constraintOffset: 13,
  });

  addAnomaly(project, collector, 'usr-anomaly-shutdown-crack', {
    title: 'Trinca em solda longitudinal do coletor',
    description: 'Líquido penetrante revelou indicação linear de 180 mm próxima ao reforço do bocal B-17.',
    severity: 'crítica', type: 'Segurança', status: 'em análise', reportedBy: 'Paulo Tavares', daysAgo: 1,
    osNumber: 'OS-COQ-27311', equipment: 'Coletor principal CG-01',
    location: 'Coqueria — eixo 17', discipline: 'Mecânica',
    correctiveAction: 'Região isolada; engenharia avaliando remoção e reparo com reforço.',
  });
  addAnomaly(project, valves, 'usr-anomaly-shutdown-valve', {
    title: 'Válvula de isolamento não atinge estanqueidade',
    description: 'Passagem residual acima do limite após lapidação da sede da válvula.',
    severity: 'alta', status: 'aberta', reportedBy: 'Roberto Lima', daysAgo: 1,
    osNumber: 'OS-COQ-27326', equipment: 'Válvula VG-118',
    location: 'Linha de gás para subprodutos', discipline: 'Mecânica',
    rootCause: 'Deformação do obturador e desgaste irregular da sede.',
    correctiveAction: 'Conjunto reserva em transferência do almoxarifado central.',
  });
}

const backup = { projects, tasks, anomalies, exportedAt: now.toISOString(), version: 5 };

function validate(data) {
  const projectIds = new Set(data.projects.map((project) => project.id));
  const taskById = new Map(data.tasks.map((task) => [task.id, task]));
  const errors = [];
  if (data.projects.length !== 4) errors.push('A base precisa conter quatro projetos.');
  if (projectIds.size !== data.projects.length) errors.push('Há IDs de projeto duplicados.');
  if (taskById.size !== data.tasks.length) errors.push('Há IDs de tarefa duplicados.');
  for (const task of data.tasks) {
    if (!projectIds.has(task.projectId)) errors.push(`Projeto ausente na tarefa ${task.id}.`);
    if (!task.name || !task.startDate || !task.endDate) errors.push(`Tarefa incompleta: ${task.id}.`);
    if (task.progress < 0 || task.progress > 100) errors.push(`Progresso inválido: ${task.id}.`);
    for (const link of task.dependsOn) {
      const predecessor = taskById.get(link.id);
      if (!predecessor) errors.push(`Predecessora ausente: ${link.id}.`);
      else if (predecessor.projectId !== task.projectId) errors.push(`Dependência entre projetos: ${task.id}.`);
    }
  }
  for (const anomaly of data.anomalies) {
    if (!projectIds.has(anomaly.projectId)) errors.push(`Projeto ausente na anomalia ${anomaly.id}.`);
    if (anomaly.taskId && !taskById.has(anomaly.taskId)) errors.push(`Tarefa ausente na anomalia ${anomaly.id}.`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

validate(backup);
const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../test-data/rv-user-test-portfolio.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
console.log(`Backup criado em ${output}`);
console.log(`${projects.length} projetos, ${tasks.length} tarefas e ${anomalies.length} anomalias.`);
