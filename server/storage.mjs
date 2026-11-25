import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolvePluginRoot() {
  if (typeof __dirname === 'string' && __dirname) {
    return path.resolve(__dirname, '..');
  }
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  }
  return process.cwd();
}

export const PLUGIN_ROOT = resolvePluginRoot();

export const DEFAULT_CONFIG = {
  planType: 'pro_ultra', // 'pro_ultra' | 'free_plus'
  weeklyResetMode: 'weekday', // 'weekday' | 'exact'
  weeklyResetWeekday: 1, // 0=Sun, 1=Mon, ..., 6=Sat
  weeklyResetTime: '09:00', // HH:MM local time
  weeklyResetExactIso: '', // Optional exact next reset ISO timestamp
  fiveHourHours: 5,
  fiveHourAnchorMode: 'auto', // 'auto' | 'manual'
  fiveHourResetExactIso: '', // Next 5h reset ISO timestamp when manual
  weeklyRefLimit: 300, // Optional user-defined reference calls/week (0 = hide bar)
  fiveHourRefLimit: 60, // Optional user-defined reference calls/5h (0 = hide bar)
  manualSnapshot: null, // { weeklyRemainingPct, fiveHourRemainingPct, note, recordedAt }
};

function isUsablePath(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (trimmed.includes('${PLUGIN_DATA}') || trimmed.includes('%PLUGIN_DATA%')) return false;
  return true;
}

export function resolveDataDir(explicitDir) {
  let dir = '';
  if (isUsablePath(explicitDir)) {
    dir = explicitDir.trim();
  } else if (isUsablePath(process.env.PLUGIN_DATA)) {
    dir = process.env.PLUGIN_DATA.trim();
  } else {
    dir = path.join(PLUGIN_ROOT, 'data');
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigPath(dataDir) {
  return path.join(dataDir, 'config.json');
}

export function getEventsPath(dataDir) {
  return path.join(dataDir, 'usage-events.jsonl');
}

export function loadConfig(dataDir) {
  const cfgPath = getConfigPath(dataDir);
  try {
    if (!fs.existsSync(cfgPath)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(dataDir, patch) {
  const current = loadConfig(dataDir);
  const next = { ...current };

  if (patch.planType === 'pro_ultra' || patch.planType === 'free_plus') {
    next.planType = patch.planType;
  }
  if (patch.weeklyResetMode === 'weekday' || patch.weeklyResetMode === 'exact') {
    next.weeklyResetMode = patch.weeklyResetMode;
  }
  if (patch.weeklyResetWeekday !== undefined) {
    const wd = Number(patch.weeklyResetWeekday);
    if (Number.isInteger(wd) && wd >= 0 && wd <= 6) {
      next.weeklyResetWeekday = wd;
    }
  }
  if (typeof patch.weeklyResetTime === 'string' && /^\d{2}:\d{2}$/.test(patch.weeklyResetTime)) {
    next.weeklyResetTime = patch.weeklyResetTime;
  }
  if (patch.weeklyResetExactIso !== undefined) {
    if (!patch.weeklyResetExactIso) {
      next.weeklyResetExactIso = '';
    } else {
      const d = new Date(patch.weeklyResetExactIso);
      if (!Number.isNaN(d.getTime())) {
        next.weeklyResetExactIso = d.toISOString();
      }
    }
  }
  if (patch.fiveHourHours !== undefined) {
    const h = Number(patch.fiveHourHours);
    if (Number.isFinite(h) && h >= 1 && h <= 24) {
      next.fiveHourHours = h;
    }
  }
  if (patch.fiveHourAnchorMode === 'auto' || patch.fiveHourAnchorMode === 'manual') {
    next.fiveHourAnchorMode = patch.fiveHourAnchorMode;
  }
  if (patch.fiveHourResetExactIso !== undefined) {
    if (!patch.fiveHourResetExactIso) {
      next.fiveHourResetExactIso = '';
    } else {
      const d = new Date(patch.fiveHourResetExactIso);
      if (!Number.isNaN(d.getTime())) {
        next.fiveHourResetExactIso = d.toISOString();
      }
    }
  }
  if (patch.weeklyRefLimit !== undefined) {
    const n = Number(patch.weeklyRefLimit);
    if (Number.isFinite(n) && n >= 0) next.weeklyRefLimit = Math.round(n);
  }
  if (patch.fiveHourRefLimit !== undefined) {
    const n = Number(patch.fiveHourRefLimit);
    if (Number.isFinite(n) && n >= 0) next.fiveHourRefLimit = Math.round(n);
  }
  if (patch.manualSnapshot !== undefined) {
    next.manualSnapshot = patch.manualSnapshot;
  }

  const cfgPath = getConfigPath(dataDir);
  const tmpPath = `${cfgPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpPath, cfgPath);
  return next;
}

export function appendEvent(dataDir, evt) {
  const eventsPath = getEventsPath(dataDir);
  const line = JSON.stringify({
    ts: evt.ts || new Date().toISOString(),
    event: evt.event || 'invocation',
    model: normalizeModelName(evt.model),
    conversationId: evt.conversationId || '',
    invocationNum: evt.invocationNum ?? null,
    terminationReason: evt.terminationReason || null,
    source: evt.source || 'hook',
  });
  fs.appendFileSync(eventsPath, `${line}\n`, 'utf8');
}

export function clearEvents(dataDir) {
  const eventsPath = getEventsPath(dataDir);
  if (fs.existsSync(eventsPath)) {
    fs.writeFileSync(eventsPath, '', 'utf8');
  }
}

export function loadEvents(dataDir) {
  const eventsPath = getEventsPath(dataDir);
  if (!fs.existsSync(eventsPath)) return [];
  const raw = fs.readFileSync(eventsPath, 'utf8');
  if (!raw.trim()) return [];
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.ts) {
        const ms = Date.parse(obj.ts);
        if (!Number.isNaN(ms)) {
          events.push({ ...obj, _ms: ms });
        }
      }
    } catch {
      // Skip malformed line safely
    }
  }
  events.sort((a, b) => a._ms - b._ms);
  return events;
}

export function normalizeModelName(raw) {
  if (!raw || typeof raw !== 'string') return 'Unknown Model';
  const s = raw.trim();
  if (!s) return 'Unknown Model';
  return s;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function computeWeeklyWindow(config, nowMs) {
  let endMs;
  if (config.weeklyResetMode === 'exact' && config.weeklyResetExactIso) {
    const parsed = Date.parse(config.weeklyResetExactIso);
    if (!Number.isNaN(parsed)) {
      endMs = parsed;
      while (endMs <= nowMs) {
        endMs += WEEK_MS;
      }
      while (endMs - WEEK_MS > nowMs) {
        endMs -= WEEK_MS;
      }
    }
  }

  if (!endMs) {
    const [hhStr, mmStr] = (config.weeklyResetTime || '09:00').split(':');
    const hh = Number(hhStr) || 0;
    const mm = Number(mmStr) || 0;
    const targetDay = Number.isInteger(config.weeklyResetWeekday) ? config.weeklyResetWeekday : 1;

    const now = new Date(nowMs);
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hh,
      mm,
      0,
      0,
    );
    const diffDays = (targetDay - now.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diffDays);
    if (candidate.getTime() <= nowMs) {
      candidate.setDate(candidate.getDate() + 7);
    }
    endMs = candidate.getTime();
  }

  const startMs = endMs - WEEK_MS;
  const remainingMs = Math.max(0, endMs - nowMs);
  const elapsedPct = Math.min(100, Math.max(0, ((nowMs - startMs) / WEEK_MS) * 100));

  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    remainingMs,
    elapsedPct: Number(elapsedPct.toFixed(1)),
  };
}

export function computeFiveHourWindow(config, invocations, nowMs) {
  const windowMs = (Number(config.fiveHourHours) || 5) * 60 * 60 * 1000;

  if (config.fiveHourAnchorMode === 'manual' && config.fiveHourResetExactIso) {
    const parsedEnd = Date.parse(config.fiveHourResetExactIso);
    if (!Number.isNaN(parsedEnd) && parsedEnd > nowMs) {
      const startMs = parsedEnd - windowMs;
      const remainingMs = parsedEnd - nowMs;
      const elapsedPct = Math.min(100, Math.max(0, ((nowMs - startMs) / windowMs) * 100));
      return {
        active: true,
        mode: 'manual',
        windowHours: Number(config.fiveHourHours) || 5,
        startMs,
        endMs: parsedEnd,
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(parsedEnd).toISOString(),
        remainingMs,
        elapsedPct: Number(elapsedPct.toFixed(1)),
      };
    }
  }

  const cutoffMs = nowMs - windowMs;
  const recent = invocations.filter((e) => e._ms >= cutoffMs && e._ms <= nowMs);
  if (recent.length === 0) {
    return {
      active: false,
      mode: config.fiveHourAnchorMode || 'auto',
      windowHours: Number(config.fiveHourHours) || 5,
      startMs: cutoffMs,
      endMs: null,
      startIso: new Date(cutoffMs).toISOString(),
      endIso: null,
      remainingMs: 0,
      elapsedPct: 0,
    };
  }

  const startMs = recent[0]._ms;
  const endMs = startMs + windowMs;
  const remainingMs = Math.max(0, endMs - nowMs);
  const elapsedPct = Math.min(100, Math.max(0, ((nowMs - startMs) / windowMs) * 100));

  return {
    active: true,
    mode: 'auto',
    windowHours: Number(config.fiveHourHours) || 5,
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    remainingMs,
    elapsedPct: Number(elapsedPct.toFixed(1)),
  };
}

function getLocalDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function summarizeSlice(events) {
  let calls = 0;
  let turns = 0;
  const convs = new Set();
  for (const e of events) {
    if (e.conversationId) convs.add(e.conversationId);
    if (e.event === 'turn_end') {
      turns += 1;
    } else {
      calls += 1;
    }
  }
  return { calls, turns, uniqueConversations: convs.size };
}

export function getDashboardState(dataDir, now = new Date()) {
  const nowMs = now.getTime();
  const config = loadConfig(dataDir);
  const allEvents = loadEvents(dataDir);
  const invocations = allEvents.filter((e) => e.event !== 'turn_end');

  const weeklyBase = computeWeeklyWindow(config, nowMs);
  const weeklyEvents = allEvents.filter((e) => e._ms >= weeklyBase.startMs && e._ms <= nowMs);
  const weeklyCounts = summarizeSlice(weeklyEvents);

  const fiveHourBase = computeFiveHourWindow(config, invocations, nowMs);
  const fiveHourEvents = allEvents.filter(
    (e) => e._ms >= fiveHourBase.startMs && e._ms <= nowMs,
  );
  const fiveHourCounts = summarizeSlice(fiveHourEvents);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const todayEvents = allEvents.filter((e) => e._ms >= todayStart && e._ms <= nowMs);
  const todayCounts = summarizeSlice(todayEvents);

  const allTimeCounts = summarizeSlice(allEvents);

  const modelMap = new Map();
  const ensureModel = (name) => {
    if (!modelMap.has(name)) {
      modelMap.set(name, {
        name,
        weeklyCalls: 0,
        fiveHourCalls: 0,
        todayCalls: 0,
        totalCalls: 0,
        lastUsedMs: 0,
      });
    }
    return modelMap.get(name);
  };

  for (const e of invocations) {
    const entry = ensureModel(normalizeModelName(e.model));
    entry.totalCalls += 1;
    if (e._ms >= weeklyBase.startMs && e._ms <= nowMs) entry.weeklyCalls += 1;
    if (e._ms >= fiveHourBase.startMs && e._ms <= nowMs) entry.fiveHourCalls += 1;
    if (e._ms >= todayStart && e._ms <= nowMs) entry.todayCalls += 1;
    if (e._ms > entry.lastUsedMs) entry.lastUsedMs = e._ms;
  }

  const totalWeeklyCalls = weeklyCounts.calls;
  const models = Array.from(modelMap.values())
    .map((m) => ({
      name: m.name,
      weeklyCalls: m.weeklyCalls,
      fiveHourCalls: m.fiveHourCalls,
      todayCalls: m.todayCalls,
      totalCalls: m.totalCalls,
      sharePct:
        totalWeeklyCalls > 0 ? Number(((m.weeklyCalls / totalWeeklyCalls) * 100).toFixed(1)) : 0,
      lastUsedIso: m.lastUsedMs ? new Date(m.lastUsedMs).toISOString() : null,
    }))
    .sort((a, b) => b.weeklyCalls - a.weeklyCalls || b.totalCalls - a.totalCalls);

  const dailyMap = new Map();
  const dailySeries = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = getLocalDateKey(d);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const item = { dateKey: key, label, calls: 0, turns: 0 };
    dailyMap.set(key, item);
    dailySeries.push(item);
  }
  for (const e of allEvents) {
    const key = getLocalDateKey(new Date(e._ms));
    const bucket = dailyMap.get(key);
    if (bucket) {
      if (e.event === 'turn_end') bucket.turns += 1;
      else bucket.calls += 1;
    }
  }

  let sinceSnapshot = null;
  if (config.manualSnapshot && config.manualSnapshot.recordedAt) {
    const snapMs = Date.parse(config.manualSnapshot.recordedAt);
    if (!Number.isNaN(snapMs)) {
      const slice = allEvents.filter((e) => e._ms > snapMs && e._ms <= nowMs);
      const counts = summarizeSlice(slice);
      sinceSnapshot = {
        callsSince: counts.calls,
        turnsSince: counts.turns,
      };
    }
  }

  const recentEvents = invocations.slice(-8).reverse().map((e) => ({
    ts: e.ts,
    model: normalizeModelName(e.model),
    source: e.source || 'hook',
  }));

  const weeklyRefLimit = Number(config.weeklyRefLimit) || 0;
  const fiveHourRefLimit = Number(config.fiveHourRefLimit) || 0;

  return {
    nowIso: now.toISOString(),
    dataDir,
    config,
    weeklyWindow: {
      startIso: weeklyBase.startIso,
      endIso: weeklyBase.endIso,
      remainingMs: weeklyBase.remainingMs,
      elapsedPct: weeklyBase.elapsedPct,
      calls: weeklyCounts.calls,
      turns: weeklyCounts.turns,
      uniqueConversations: weeklyCounts.uniqueConversations,
      refLimit: weeklyRefLimit,
      refUsagePct:
        weeklyRefLimit > 0
          ? Number(Math.min(100, (weeklyCounts.calls / weeklyRefLimit) * 100).toFixed(1))
          : null,
    },
    fiveHourWindow: {
      active: fiveHourBase.active,
      mode: fiveHourBase.mode,
      windowHours: fiveHourBase.windowHours,
      startIso: fiveHourBase.startIso,
      endIso: fiveHourBase.endIso,
      remainingMs: fiveHourBase.remainingMs,
      elapsedPct: fiveHourBase.elapsedPct,
      calls: fiveHourCounts.calls,
      turns: fiveHourCounts.turns,
      uniqueConversations: fiveHourCounts.uniqueConversations,
      refLimit: fiveHourRefLimit,
      refUsagePct:
        fiveHourRefLimit > 0
          ? Number(Math.min(100, (fiveHourCounts.calls / fiveHourRefLimit) * 100).toFixed(1))
          : null,
    },
    todayStats: todayCounts,
    allTimeStats: {
      ...allTimeCounts,
      firstEventIso: allEvents.length ? allEvents[0].ts : null,
      lastEventIso: allEvents.length ? allEvents[allEvents.length - 1].ts : null,
    },
    models,
    dailySeries,
    sinceSnapshot,
    recentEvents,
  };
}
