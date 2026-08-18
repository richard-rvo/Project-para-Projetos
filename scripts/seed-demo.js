/* ═══════════════════════════════════════════════════════════════
   SEED DE DEMONSTRAÇÃO — cinco projetos com dados realistas
   ═══════════════════════════════════════════════════════════════

   COMO USAR
   1. `npm run dev` e abra http://localhost:5174
   2. DevTools → Console
   3. Cole o conteúdo deste arquivo inteiro e dê Enter
   4. A página recarrega sozinha com os dados

   ⚠️  APAGA tudo que estiver no banco. Exporte um backup antes
       (Configurações → Dados → Exportar) se houver algo real ali.

   Os cinco projetos foram escolhidos para exercitar justamente os
   casos que o app precisa saber distinguir:

   · Coqueria    — em andamento, COM linha de base, algumas atrasadas
   · Subestação  — planejado, SEM linha de base (estado vazio honesto)
   · Envase      — derrapou feio: baseline curta, execução longa
   · SAP         — adiantado em relação ao plano
   · Preditiva   — concluído, para o Portfólio ter um caso pronto

   Calendários: a Coqueria usa turno de campo 24h na execução e o
   administrativo 8h/dia no resto — o caso que motivou a biblioteca
   de calendários por tarefa.
   ═══════════════════════════════════════════════════════════════ */

(async () => {
  /* ── Datas ──────────────────────────────────────────────────── */
  const MS_DAY = 86400000;
  const today = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
  const TODAY = iso(today);

  const shift = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  /** Anda `n` dias ÚTEIS (pula sábado e domingo). */
  const workday = (dateStr, n) => {
    let d = dateStr;
    let left = n;
    const step = n >= 0 ? 1 : -1;
    while (left !== 0) {
      d = shift(d, step);
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (dow !== 0 && dow !== 6) left -= step;
    }
    /* Se caiu em fim de semana com n = 0, empurra para a frente. */
    while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = shift(d, 1);
    return d;
  };

  const at = (dateStr, time) => `${dateStr}T${time}`;
  const OPEN = '08:00';
  const CLOSE = '17:00';

  const uid = (() => { let n = 0; return (p) => `${p}-${(++n).toString(36)}`; })();

  /* ── Calendários ────────────────────────────────────────────── */
  const PADRAO = {
    id: 'padrao',
    name: 'Padrão',
    workdays: [1, 2, 3, 4, 5],
    shifts: [{ from: '08:00', to: '12:00' }, { from: '13:00', to: '17:00' }],
    holidays: ['2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15'],
  };
  const CAMPO24 = {
    id: '24h',
    name: '24 Horas',
    workdays: [0, 1, 2, 3, 4, 5, 6],
    shifts: [{ from: '00:00', to: '24:00' }],
    holidays: [],
  };
  const SEIS_UM = {
    id: 'seis-por-um',
    name: 'Seis por Um',
    workdays: [1, 2, 3, 4, 5, 6],
    shifts: [{ from: '07:00', to: '13:00' }],
    holidays: [],
  };

  /* ── Construtores ───────────────────────────────────────────── */
  const projects = [];
  const tasks = [];
  const anomalies = [];

  function project(name, opts) {
    const p = {
      id: uid('p'),
      name,
      description: opts.description || '',
      startDate: opts.startDate || '',
      endDate: opts.endDate || '',
      status: opts.status || 'Planejado',
      createdAt: new Date().toISOString(),
      calendars: opts.calendars || [PADRAO],
      defaultCalendarId: opts.defaultCalendarId || 'padrao',
    };
    projects.push(p);
    return p;
  }

  /**
   * Adiciona uma tarefa. `startOffset` é em dias úteis a partir da
   * âncora do projeto; `days` é a duração em dias úteis.
   *
   * `baseOffset` / `baseDays` gravam a linha de base. Quando ausentes,
   * a tarefa fica SEM baseline — que é o caso do projeto Subestação.
   */
  function task(projectId, anchor, name, o = {}) {
    const start = workday(anchor, o.startOffset ?? 0);
    const end = o.milestone ? start : workday(start, Math.max(0, (o.days ?? 1) - 1));

    const t = {
      id: uid('t'),
      projectId,
      name,
      startDate: o.milestone ? at(start, OPEN) : at(start, OPEN),
      endDate: o.milestone ? at(start, OPEN) : at(end, CLOSE),
      progress: o.progress ?? 0,
      dependsOn: o.deps || [],
      indentLevel: o.level ?? 0,
      order: tasks.filter((x) => x.projectId === projectId).length,
      scheduleMode: o.manual ? 'manual' : 'auto',
    };

    if (o.resources) t.resources = o.resources;
    if (o.group) t.resourceGroup = o.group;
    if (o.calendarId) t.calendarId = o.calendarId;
    if (o.notes) t.notes = o.notes;

    if (o.baseOffset !== undefined) {
      const bs = workday(anchor, o.baseOffset);
      const be = o.milestone ? bs : workday(bs, Math.max(0, (o.baseDays ?? o.days ?? 1) - 1));
      t.baselineStart = o.milestone ? at(bs, OPEN) : at(bs, OPEN);
      t.baselineEnd = o.milestone ? at(bs, OPEN) : at(be, CLOSE);
    }

    tasks.push(t);
    return t;
  }

  const dep = (t, type = 'FS', lag = 0) => [{ id: t.id, type, lag }];

  function anomaly(projectId, taskId, o) {
    anomalies.push({
      id: uid('a'),
      projectId,
      taskId: taskId || '',
      title: o.title,
      description: o.description || '',
      severity: o.severity || 'média',
      type: o.type || 'Técnico',
      status: o.status || 'aberta',
      reportedBy: o.reportedBy || 'Fiscal de campo',
      reportedAt: new Date(Date.now() - (o.daysAgo || 1) * MS_DAY).toISOString(),
      osNumber: o.os || '',
      equipment: o.equipment || '',
      location: o.location || '',
      discipline: o.discipline || '',
      rootCause: o.rootCause || '',
      correctiveAction: o.correctiveAction || '',
      photos: [],
    });
  }

  /* ═══ 1. Parada de Manutenção — Coqueria ═══════════════════════
     Em andamento, com linha de base. A execução derrapou alguns dias
     em relação ao plano; duas tarefas passaram do término sem estar
     concluídas. Turno de campo 24h na execução. */
  {
    const anchor = workday(TODAY, -18);
    const p = project('Parada de Manutenção — Coqueria Bateria 3', {
      description: 'Parada programada de 30 dias para substituição de refratário, '
        + 'recuperação de trilhos e revisão geral da bateria 3.',
      startDate: anchor,
      endDate: workday(anchor, 30),
      status: 'Em Andamento',
      calendars: [PADRAO, CAMPO24],
    });

    task(p.id, anchor, 'Preparação', { level: 0 });
    const mob = task(p.id, anchor, 'Mobilização de equipes', {
      level: 1, startOffset: 0, days: 3, progress: 100,
      baseOffset: 0, baseDays: 3, resources: '12 Montadores', group: 'Mecânica',
    });
    const and = task(p.id, anchor, 'Montagem de andaimes', {
      level: 1, startOffset: 3, days: 5, progress: 100, deps: dep(mob),
      baseOffset: 3, baseDays: 4, resources: '8 Andaimeiros', group: 'Estrutura',
    });
    const loto = task(p.id, anchor, 'Bloqueio e etiquetagem (LOTO)', {
      level: 1, startOffset: 8, days: 2, progress: 100, deps: dep(and),
      baseOffset: 7, baseDays: 2, resources: '2 Eletricistas', group: 'Elétrica',
    });

    task(p.id, anchor, 'Execução', { level: 0 });
    const desm = task(p.id, anchor, 'Desmontagem das portas', {
      level: 1, startOffset: 10, days: 4, progress: 100, deps: dep(loto),
      baseOffset: 9, baseDays: 4, resources: '10 Mecânicos', group: 'Mecânica',
      calendarId: '24h',
    });
    const refr = task(p.id, anchor, 'Substituição de refratário', {
      level: 1, startOffset: 14, days: 9, progress: 55, deps: dep(desm),
      baseOffset: 13, baseDays: 8, resources: '16 Refratistas', group: 'Refratário',
      calendarId: '24h',
      notes: 'Frente crítica da parada. Atraso aqui empurra a partida inteira.',
    });
    const tril = task(p.id, anchor, 'Recuperação de trilhos', {
      level: 1, startOffset: 16, days: 6, progress: 40, deps: dep(desm, 'SS', 2),
      baseOffset: 15, baseDays: 5, resources: '6 Soldadores', group: 'Mecânica',
    });
    const sold = task(p.id, anchor, 'Soldagem estrutural', {
      level: 1, startOffset: 17, days: 5, progress: 20, deps: dep(tril, 'SS', 1),
      baseOffset: 16, baseDays: 5, resources: '4 Soldadores', group: 'Estrutura',
    });

    task(p.id, anchor, 'Comissionamento', { level: 0 });
    const estan = task(p.id, anchor, 'Testes de estanqueidade', {
      level: 1, startOffset: 23, days: 3, progress: 0, deps: dep(refr),
      baseOffset: 21, baseDays: 3, resources: '3 Inspetores', group: 'Qualidade',
    });
    const aque = task(p.id, anchor, 'Aquecimento controlado', {
      level: 1, startOffset: 26, days: 6, progress: 0, deps: dep(estan),
      baseOffset: 24, baseDays: 6, resources: '4 Operadores', group: 'Operação',
      calendarId: '24h',
    });
    task(p.id, anchor, 'Partida da bateria', {
      level: 1, startOffset: 32, progress: 0, milestone: true, deps: dep(aque),
      baseOffset: 30, group: 'Operação',
    });

    anomaly(p.id, refr.id, {
      title: 'Trinca em viga de sustentação do teto da câmara 7',
      description: 'Trinca longitudinal de aproximadamente 40 cm identificada durante '
        + 'a remoção do refratário antigo. Região sob carga.',
      severity: 'crítica', type: 'Segurança', status: 'em análise',
      reportedBy: 'Marcos Andrade', daysAgo: 3,
      os: 'OS-2026-4417', equipment: 'Bateria 3 — Câmara 7',
      location: 'Coqueria, nível +12m', discipline: 'Estrutura',
      rootCause: 'Fadiga térmica acumulada; última inspeção estrutural há 6 anos.',
      correctiveAction: 'Escoramento provisório instalado. Aguardando laudo de '
        + 'engenharia para definir reforço definitivo.',
    });
    anomaly(p.id, tril.id, {
      title: 'Desalinhamento no trilho lado coque',
      description: 'Desvio de 8 mm em relação ao projeto, medido a cada 3 m.',
      severity: 'alta', type: 'Qualidade', status: 'aberta',
      reportedBy: 'Juliana Reis', daysAgo: 1,
      os: 'OS-2026-4423', equipment: 'Trilho lado coque',
      location: 'Coqueria, nível 0', discipline: 'Mecânica',
    });
    anomaly(p.id, and.id, {
      title: 'Andaime sem placa de liberação na frente norte',
      severity: 'média', type: 'Segurança', status: 'resolvida',
      reportedBy: 'Carlos Menezes', daysAgo: 9,
      os: 'OS-2026-4390', discipline: 'Estrutura',
      location: 'Coqueria, frente norte',
      correctiveAction: 'Liberação emitida pelo técnico de segurança em campo.',
    });
  }

  /* ═══ 2. Ampliação Subestação — SEM linha de base ══════════════
     Existe para mostrar o estado vazio honesto: sem baseline, a
     Curva S e a saúde do projeto dizem que não há o que comparar em
     vez de inventar um desvio. */
  {
    const anchor = workday(TODAY, 6);
    const p = project('Ampliação da Subestação 138 kV', {
      description: 'Implantação de novo bay de entrada e ampliação do barramento '
        + 'principal para suportar a linha 4.',
      startDate: anchor,
      endDate: workday(anchor, 45),
      status: 'Planejado',
    });

    const proj = task(p.id, anchor, 'Projeto executivo', {
      level: 0, startOffset: 0, days: 10, progress: 0,
      resources: '2 Projetistas', group: 'Elétrica',
    });
    const supr = task(p.id, anchor, 'Suprimentos', { level: 0, startOffset: 10, days: 1 });
    const compra = task(p.id, anchor, 'Compra de disjuntor 138 kV', {
      level: 1, startOffset: 10, days: 20, progress: 0, deps: dep(proj),
      resources: 'Suprimentos', group: 'Suprimentos',
      notes: 'Lead time de fábrica: 18 semanas. Item de caminho crítico.',
    });
    task(p.id, anchor, 'Compra de TC e TP', {
      level: 1, startOffset: 10, days: 12, progress: 0, deps: dep(proj),
      resources: 'Suprimentos', group: 'Suprimentos',
    });
    const civil = task(p.id, anchor, 'Obra civil', { level: 0 });
    task(p.id, anchor, 'Fundações do bay', {
      level: 1, startOffset: 12, days: 8, progress: 0, deps: dep(proj, 'FS', 2),
      resources: '10 Civis', group: 'Civil',
    });
    task(p.id, anchor, 'Canaletas e drenagem', {
      level: 1, startOffset: 20, days: 6, progress: 0, resources: '6 Civis', group: 'Civil',
    });
    const mont = task(p.id, anchor, 'Montagem eletromecânica', {
      level: 0, startOffset: 30, days: 12, progress: 0, deps: dep(compra),
      resources: '8 Eletricistas', group: 'Elétrica',
    });
    task(p.id, anchor, 'Energização', {
      level: 0, startOffset: 43, progress: 0, milestone: true, deps: dep(mont),
      group: 'Operação',
    });
  }

  /* ═══ 3. Revamp Envase — derrapou feio ════════════════════════
     Baseline curta contra execução longa: é o caso em que o cálculo
     antigo perdia o atraso, porque o "planejado" andava junto com o
     término replanejado. */
  {
    const anchor = workday(TODAY, -40);
    const p = project('Revamp da Linha de Envase 3', {
      description: 'Substituição da enchedora e da rotuladora, com adequação '
        + 'do transporte de garrafas.',
      startDate: anchor,
      endDate: workday(anchor, 35),
      status: 'Em Andamento',
      calendars: [PADRAO, SEIS_UM],
    });

    const desm = task(p.id, anchor, 'Desmontagem da enchedora antiga', {
      level: 0, startOffset: 0, days: 6, progress: 100,
      baseOffset: 0, baseDays: 5, resources: '6 Mecânicos', group: 'Mecânica',
    });
    const adeq = task(p.id, anchor, 'Adequação de piso e drenagem', {
      level: 0, startOffset: 6, days: 14, progress: 80, deps: dep(desm),
      baseOffset: 5, baseDays: 6, resources: '8 Civis', group: 'Civil',
      notes: 'Estouro por interferência não mapeada na drenagem existente.',
    });
    const inst = task(p.id, anchor, 'Instalação da nova enchedora', {
      level: 0, startOffset: 20, days: 12, progress: 35, deps: dep(adeq),
      baseOffset: 11, baseDays: 8, resources: '6 Montadores', group: 'Mecânica',
      calendarId: 'seis-por-um',
    });
    const rot = task(p.id, anchor, 'Instalação da rotuladora', {
      level: 0, startOffset: 32, days: 8, progress: 0, deps: dep(inst),
      baseOffset: 19, baseDays: 6, resources: '4 Montadores', group: 'Mecânica',
    });
    const auto = task(p.id, anchor, 'Automação e integração CLP', {
      level: 0, startOffset: 40, days: 10, progress: 0, deps: dep(rot, 'SS', 3),
      baseOffset: 25, baseDays: 8, resources: '3 Instrumentistas', group: 'Instrumentação',
    });
    task(p.id, anchor, 'Validação sanitária', {
      level: 0, startOffset: 50, days: 5, progress: 0, deps: dep(auto),
      baseOffset: 33, baseDays: 4, resources: '2 Qualidade', group: 'Qualidade',
    });

    anomaly(p.id, adeq.id, {
      title: 'Drenagem existente fora do as-built',
      description: 'Tubulação de 200 mm encontrada 1,2 m fora da posição indicada '
        + 'no as-built, atravessando a área da nova base.',
      severity: 'alta', type: 'Técnico', status: 'resolvida',
      reportedBy: 'Renato Lima', daysAgo: 22,
      os: 'OS-2026-3980', equipment: 'Drenagem industrial',
      location: 'Envase 3', discipline: 'Civil',
      rootCause: 'As-built desatualizado desde a reforma de 2019.',
      correctiveAction: 'Redesenho da base e desvio da tubulação. Impacto de 8 dias.',
    });
    anomaly(p.id, inst.id, {
      title: 'Base da enchedora com nivelamento fora de tolerância',
      severity: 'alta', type: 'Qualidade', status: 'aberta',
      reportedBy: 'Renato Lima', daysAgo: 2,
      os: 'OS-2026-4402', equipment: 'Enchedora ENV-3',
      location: 'Envase 3', discipline: 'Mecânica',
    });
  }

  /* ═══ 4. SAP Fase 2 — adiantado ══════════════════════════════ */
  {
    const anchor = workday(TODAY, -25);
    const p = project('Implantação SAP — Fase 2 (PM e MM)', {
      description: 'Rollout dos módulos de Manutenção e Materiais nas unidades '
        + 'de Cubatão e Santos.',
      startDate: anchor,
      endDate: workday(anchor, 40),
      status: 'Em Andamento',
    });

    const bp = task(p.id, anchor, 'Business Blueprint', {
      level: 0, startOffset: 0, days: 8, progress: 100,
      baseOffset: 0, baseDays: 10, resources: '4 Consultores', group: 'TI',
    });
    const par = task(p.id, anchor, 'Parametrização PM', {
      level: 0, startOffset: 8, days: 10, progress: 100, deps: dep(bp),
      baseOffset: 10, baseDays: 12, resources: '3 Consultores', group: 'TI',
    });
    const carga = task(p.id, anchor, 'Carga de dados mestres', {
      level: 0, startOffset: 18, days: 6, progress: 70, deps: dep(par),
      baseOffset: 22, baseDays: 6, resources: '2 Analistas', group: 'TI',
    });
    const teste = task(p.id, anchor, 'Testes integrados', {
      level: 0, startOffset: 24, days: 8, progress: 10, deps: dep(carga),
      baseOffset: 28, baseDays: 8, resources: '6 Key users', group: 'TI',
    });
    task(p.id, anchor, 'Go-live', {
      level: 0, startOffset: 34, progress: 0, milestone: true, deps: dep(teste),
      baseOffset: 38, group: 'TI',
    });
  }

  /* ═══ 5. Preditiva — concluído ═══════════════════════════════ */
  {
    const anchor = workday(TODAY, -60);
    const p = project('Inspeção Preditiva — Frota de Motores CA', {
      description: 'Campanha de análise de vibração e termografia em 84 motores '
        + 'de média tensão.',
      startDate: anchor,
      endDate: workday(anchor, 20),
      status: 'Concluído',
    });

    const plan = task(p.id, anchor, 'Planejamento da campanha', {
      level: 0, startOffset: 0, days: 4, progress: 100,
      baseOffset: 0, baseDays: 4, resources: '1 Engenheiro', group: 'Preditiva',
    });
    const vib = task(p.id, anchor, 'Coleta de vibração', {
      level: 0, startOffset: 4, days: 8, progress: 100, deps: dep(plan),
      baseOffset: 4, baseDays: 8, resources: '2 Técnicos', group: 'Preditiva',
    });
    const term = task(p.id, anchor, 'Termografia', {
      level: 0, startOffset: 6, days: 6, progress: 100, deps: dep(vib, 'SS', 2),
      baseOffset: 6, baseDays: 6, resources: '1 Técnico', group: 'Preditiva',
    });
    const laudo = task(p.id, anchor, 'Emissão de laudos', {
      level: 0, startOffset: 12, days: 5, progress: 100, deps: dep(term),
      baseOffset: 12, baseDays: 5, resources: '1 Engenheiro', group: 'Preditiva',
    });
    task(p.id, anchor, 'Entrega do relatório final', {
      level: 0, startOffset: 18, progress: 100, milestone: true, deps: dep(laudo),
      baseOffset: 18, group: 'Preditiva',
    });

    anomaly(p.id, vib.id, {
      title: 'Motor MT-042 com assinatura de desalinhamento severo',
      description: 'Pico em 2× rotação com amplitude 4,8 mm/s RMS.',
      severity: 'alta', type: 'Técnico', status: 'resolvida',
      reportedBy: 'Paulo Tavares', daysAgo: 48,
      os: 'OS-2026-3120', equipment: 'Motor MT-042',
      location: 'Casa de bombas 2', discipline: 'Mecânica',
      rootCause: 'Alinhamento a laser não refeito após a última troca de acoplamento.',
      correctiveAction: 'Realinhamento executado; amplitude caiu para 1,1 mm/s.',
    });
  }

  /* ── Gravação ───────────────────────────────────────────────── */
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('gantt-dinamico-db');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'tasks', 'anomalies'], 'readwrite');
    tx.objectStore('projects').clear();
    tx.objectStore('tasks').clear();
    tx.objectStore('anomalies').clear();
    projects.forEach((p) => tx.objectStore('projects').put(p));
    tasks.forEach((t) => tx.objectStore('tasks').put(t));
    anomalies.forEach((a) => tx.objectStore('anomalies').put(a));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  console.log(
    `✅ Seed gravado: ${projects.length} projetos, ${tasks.length} tarefas, `
    + `${anomalies.length} anomalias. Recarregando…`
  );
  setTimeout(() => location.reload(), 400);
})();
