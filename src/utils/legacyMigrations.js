import { readDependencies } from './dependencies';
import {
  DEFAULT_CALENDAR, DEFAULT_CALENDAR_ID, defaultCalendarOf,
  workdayStart, workdayEnd,
} from './calendar';
import { hasTime } from './schedule';

/* Compatibilidade somente para importar/converter dados antigos.
   Este arquivo nao abre banco local nem participa da persistencia atual. */
export function upgradeProjectToV4(project) {
  if (!project || Array.isArray(project.calendars)) return project;

  const legacy = project.calendar;
  const base = {
    ...DEFAULT_CALENDAR,
    id: DEFAULT_CALENDAR_ID,
    name: DEFAULT_CALENDAR.name,
    workdays: legacy?.workdays?.length ? legacy.workdays : DEFAULT_CALENDAR.workdays,
    holidays: Array.isArray(legacy?.holidays) ? legacy.holidays : [],
  };

  const next = { ...project, calendars: [base], defaultCalendarId: base.id };
  if (legacy) next.calendarLegacy = legacy;
  delete next.calendar;
  return next;
}

export function upgradeTaskToV4(task, cal) {
  if (!task) return task;
  if (hasTime(task.startDate) && hasTime(task.endDate)) return task;

  const legacy = {
    startDate: task.startDate,
    endDate: task.endDate,
    baselineStart: task.baselineStart,
    baselineEnd: task.baselineEnd,
  };

  const pair = (start, end) => {
    if (!start && !end) return [start, end];
    if (start && start === end) {
      const instant = workdayStart(cal, start);
      return [instant, instant];
    }
    return [
      start ? workdayStart(cal, start) : start,
      end ? workdayEnd(cal, end) : end,
    ];
  };

  const [startDate, endDate] = pair(task.startDate, task.endDate);
  const [baselineStart, baselineEnd] = pair(task.baselineStart, task.baselineEnd);
  return { ...task, startDate, endDate, baselineStart, baselineEnd, datesLegacy: legacy };
}

export function upgradeTaskToV5(task) {
  if (!task || !task.status) return task;
  const next = { ...task, statusLegacy: task.status };
  if (task.status === 'Concluída' && (Number(task.progress) || 0) < 100) next.progress = 100;
  delete next.status;
  return next;
}

export function normalizeLegacyBackup(data) {
  const projects = (data.projects || []).map(upgradeProjectToV4);
  const calendarByProject = new Map(projects.map((p) => [p.id, defaultCalendarOf(p)]));
  const tasks = (data.tasks || []).map((task) => upgradeTaskToV5(
    upgradeTaskToV4(
      { ...task, dependsOn: readDependencies(task.dependsOn) },
      calendarByProject.get(task.projectId) || DEFAULT_CALENDAR
    )
  ));
  return { projects, tasks, anomalies: data.anomalies || [] };
}
