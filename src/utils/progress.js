/* src/utils/progress.js */

export function daysBetweenUTC(a, b) {
  if (!a || !b) return 0;
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86400000);
}

export function calculateTaskPlannedProgress(baselineStart, baselineEnd) {
  if (!baselineStart || !baselineEnd) return 0;
  
  const todayStr = new Date().toISOString().slice(0, 10);
  
  if (todayStr < baselineStart) return 0;
  if (todayStr > baselineEnd) return 100;
  
  const totalDays = daysBetweenUTC(baselineStart, baselineEnd) + 1; // Inclusive
  if (totalDays <= 0) return 0;
  
  const elapsed = daysBetweenUTC(baselineStart, todayStr) + 1;
  const plannedProgress = Math.round((elapsed / totalDays) * 100);
  
  return Math.min(100, Math.max(0, plannedProgress));
}

export function calculateProjectMetrics(projectTasks) {
  if (!projectTasks || projectTasks.length === 0) {
    return { progress: 0, planned: 0, deviation: 0, health: 'N/A' };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  
  let totalDuration = 0;
  let earnedProgress = 0;
  let plannedProgressSum = 0;

  projectTasks.forEach(t => {
    const dur = (t.startDate && t.endDate) ? Math.max(1, daysBetweenUTC(t.startDate, t.endDate)) : 1;
    totalDuration += dur;
    
    // Earned: dur * progress
    earnedProgress += dur * (t.progress || 0);

    // Planned:
    if (t.startDate) {
      if (!t.endDate) {
        if (t.startDate <= todayStr) plannedProgressSum += dur * 100;
      } else {
        const elapsed = daysBetweenUTC(t.startDate, todayStr) + 1;
        if (elapsed <= 0) {
          // not started yet
        } else if (elapsed >= dur) {
          plannedProgressSum += dur * 100;
        } else {
          plannedProgressSum += dur * (elapsed / dur) * 100;
        }
      }
    }
  });

  const progress = totalDuration > 0 ? Math.round(earnedProgress / totalDuration) : 0;
  const planned = totalDuration > 0 ? Math.round(plannedProgressSum / totalDuration) : 0;
  const deviation = progress - planned;

  let health = 'N/A';
  if (deviation >= -5) health = 'Boa';
  else if (deviation >= -15) health = 'Atenção';
  else health = 'Crítica';

  return { progress, planned, deviation, health };
}
