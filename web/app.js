import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps/app-with-deps';

const app = new App({ name: 'Quota Tracker', version: '1.0.0' }, {});

let currentState = null;
let refreshInFlight = false;
let clearConfirmTimer = null;
let clearConfirmArmed = false;
let toastTimer = null;

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function pad2(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function formatHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatDayHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}天 ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatLocalDateTime(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${mm}-${dd} (${weekdays[d.getDay()]}) ${hh}:${mi}`;
}

function formatTimeOnly(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function barColorClass(pct) {
  if (pct >= 85) return 'danger';
  if (pct >= 65) return 'warn';
  return 'ok';
}

function populateSettingsForm(cfg) {
  if (!cfg) return;
  $('cfg-plan').value = cfg.planType || 'pro_ultra';
  $('cfg-weekly-mode').value = cfg.weeklyResetMode || 'weekday';
  $('cfg-weekday').value = String(cfg.weeklyResetWeekday ?? 1);
  $('cfg-weektime').value = cfg.weeklyResetTime || '09:00';
  $('cfg-weekexact').value = toDateTimeLocalValue(
    cfg.weeklyResetExactIso || currentState?.weeklyWindow?.endIso || '',
  );
  $('cfg-5h-mode').value = cfg.fiveHourAnchorMode || 'auto';
  $('cfg-week-limit').value = String(cfg.weeklyRefLimit ?? 300);
  $('cfg-5h-limit').value = String(cfg.fiveHourRefLimit ?? 60);

  if (cfg.fiveHourAnchorMode === 'manual' && cfg.fiveHourResetExactIso) {
    const remMs = Math.max(0, Date.parse(cfg.fiveHourResetExactIso) - Date.now());
    const totalMin = Math.ceil(remMs / 60000);
    $('cfg-5h-rem-h').value = String(Math.floor(totalMin / 60));
    $('cfg-5h-rem-m').value = String(totalMin % 60);
  } else {
    $('cfg-5h-rem-h').value = '';
    $('cfg-5h-rem-m').value = '';
  }

  toggleConditionalFields();
}

function toggleConditionalFields() {
  const weeklyMode = $('cfg-weekly-mode').value;
  $('weekly-weekday-fields').style.display = weeklyMode === 'weekday' ? 'grid' : 'none';
  $('weekly-exact-fields').style.display = weeklyMode === 'exact' ? 'grid' : 'none';

  const fiveMode = $('cfg-5h-mode').value;
  $('fiveh-manual-field').style.display = fiveMode === 'manual' ? 'flex' : 'none';
}

function renderTick() {
  if (!currentState) return;
  const nowMs = Date.now();
  const { weeklyWindow, fiveHourWindow, config } = currentState;

  const weeklyEndMs = Date.parse(weeklyWindow.endIso);
  const weeklyRemMs = Number.isNaN(weeklyEndMs) ? weeklyWindow.remainingMs : Math.max(0, weeklyEndMs - nowMs);
  $('cd-weekly').textContent = formatDayHMS(weeklyRemMs);

  if (!Number.isNaN(weeklyEndMs) && weeklyEndMs <= nowMs && !refreshInFlight) {
    refreshState(false);
    return;
  }

  if (config.planType === 'pro_ultra') {
    const cd5 = $('cd-5h');
    if (fiveHourWindow.active && fiveHourWindow.endIso) {
      const fiveEndMs = Date.parse(fiveHourWindow.endIso);
      const remMs = Number.isNaN(fiveEndMs) ? fiveHourWindow.remainingMs : Math.max(0, fiveEndMs - nowMs);
      if (remMs <= 0) {
        cd5.textContent = '窗口已刷新';
        cd5.classList.add('idle');
        if (!refreshInFlight) refreshState(false);
      } else {
        cd5.textContent = formatHMS(remMs);
        cd5.classList.remove('idle');
      }
    } else {
      cd5.textContent = '满额待命';
      cd5.classList.add('idle');
    }
  }
}

function renderState(state) {
  if (!state || !state.config) return;
  currentState = state;
  const { config, weeklyWindow, fiveHourWindow, todayStats, allTimeStats, models, dailySeries, sinceSnapshot } = state;

  $('plan-badge').textContent = config.planType === 'pro_ultra' ? 'Pro / Ultra' : 'Free / Plus';
  $('sync-status').textContent = `本地自动统计 · 最近同步 ${formatTimeOnly(state.nowIso)}（非官方实时余量）`;

  const card5h = $('card-5h');
  if (config.planType === 'free_plus') {
    card5h.style.display = 'none';
  } else {
    card5h.style.display = 'flex';
    $('fiveh-mode-badge').textContent = fiveHourWindow.mode === 'manual' ? '手动校准' : '自动滚动';
    $('fiveh-calls').textContent = String(fiveHourWindow.calls);
    if (fiveHourWindow.active && fiveHourWindow.endIso) {
      $('fiveh-reset-at').textContent = `预计刷新：${formatLocalDateTime(fiveHourWindow.endIso)}`;
    } else {
      $('fiveh-reset-at').textContent = `近 ${fiveHourWindow.windowHours || 5} 小时暂无调用`;
    }

    const fiveBar = $('fiveh-bar');
    fiveBar.className = 'bar-fill';
    if (fiveHourWindow.refLimit > 0 && fiveHourWindow.refUsagePct !== null) {
      $('fiveh-pct-label').textContent = `参考占比 ${fiveHourWindow.refUsagePct}% (上限 ${fiveHourWindow.refLimit})`;
      fiveBar.style.width = `${Math.min(100, fiveHourWindow.refUsagePct)}%`;
      fiveBar.classList.add(barColorClass(fiveHourWindow.refUsagePct));
    } else {
      $('fiveh-pct-label').textContent = `窗口时间已过 ${fiveHourWindow.elapsedPct}%`;
      fiveBar.style.width = `${Math.min(100, fiveHourWindow.elapsedPct)}%`;
    }
  }

  $('weekly-cycle-badge').textContent = config.weeklyResetMode === 'exact' ? '精确周期' : '每周循环';
  $('weekly-reset-at').textContent = `下次刷新：${formatLocalDateTime(weeklyWindow.endIso)}`;
  $('weekly-calls').textContent = String(weeklyWindow.calls);

  const weekBar = $('weekly-bar');
  weekBar.className = 'bar-fill';
  if (weeklyWindow.refLimit > 0 && weeklyWindow.refUsagePct !== null) {
    $('weekly-pct-label').textContent = `参考占比 ${weeklyWindow.refUsagePct}% (上限 ${weeklyWindow.refLimit})`;
    weekBar.style.width = `${Math.min(100, weeklyWindow.refUsagePct)}%`;
    weekBar.classList.add(barColorClass(weeklyWindow.refUsagePct));
  } else {
    $('weekly-pct-label').textContent = `本周已过 ${weeklyWindow.elapsedPct}%`;
    weekBar.style.width = `${Math.min(100, weeklyWindow.elapsedPct)}%`;
  }

  const snapEl = $('snapshot-display');
  snapEl.textContent = '';
  if (config.manualSnapshot) {
    const snap = config.manualSnapshot;
    const parts = [];
    if (typeof snap.weeklyRemainingPct === 'number') parts.push(`本周剩 ${snap.weeklyRemainingPct}%`);
    if (typeof snap.fiveHourRemainingPct === 'number') parts.push(`5h 剩 ${snap.fiveHourRemainingPct}%`);
    if (snap.note) parts.push(snap.note);

    const line1 = document.createElement('span');
    line1.className = 'snapshot-strong';
    line1.textContent = parts.length ? `官方快照：${parts.join(' · ')}` : '已记录官方快照';

    const line2 = document.createElement('span');
    const deltaText = sinceSnapshot
      ? `之后本地新增 ${sinceSnapshot.callsSince} 次调用 / ${sinceSnapshot.turnsSince} 轮对话`
      : '等待新调用';
    line2.textContent = `记录于 ${formatLocalDateTime(snap.recordedAt)} · ${deltaText}`;

    snapEl.appendChild(line1);
    snapEl.appendChild(line2);
  } else {
    const line1 = document.createElement('span');
    line1.className = 'snapshot-strong';
    line1.textContent = '尚未记录官方余量快照';
    const line2 = document.createElement('span');
    line2.textContent = '在 Settings → Models 看完官方余量后，可顺手记一笔做对照';
    snapEl.appendChild(line1);
    snapEl.appendChild(line2);
  }

  $('kpi-today').textContent = String(todayStats.calls);
  $('kpi-week-turns').textContent = String(weeklyWindow.turns);
  $('kpi-week-convs').textContent = String(weeklyWindow.uniqueConversations);

  const modelList = $('model-list');
  modelList.textContent = '';
  const weeklyActiveModels = models.filter((m) => m.weeklyCalls > 0 || m.totalCalls > 0);
  $('model-count-badge').textContent = `${weeklyActiveModels.length} 个模型`;

  if (weeklyActiveModels.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '暂无本地调用记录。继续正常聊天后，插件 Hook 会自动按模型记录每次调用。';
    modelList.appendChild(empty);
  } else {
    for (const m of weeklyActiveModels) {
      const item = document.createElement('div');
      item.className = 'model-item';

      const top = document.createElement('div');
      top.className = 'model-top';

      const nameEl = document.createElement('span');
      nameEl.className = 'model-name';
      nameEl.textContent = m.name;

      const numsEl = document.createElement('span');
      numsEl.className = 'model-nums';
      numsEl.textContent = `本周 ${m.weeklyCalls} · 5h ${m.fiveHourCalls} · 今日 ${m.todayCalls}`;

      top.appendChild(nameEl);
      top.appendChild(numsEl);

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = `${Math.max(m.weeklyCalls > 0 ? 4 : 0, m.sharePct)}%`;
      track.appendChild(fill);

      item.appendChild(top);
      item.appendChild(track);
      modelList.appendChild(item);
    }
  }

  const chart = $('daily-chart');
  chart.textContent = '';
  $('total-calls-badge').textContent = `累计 ${allTimeStats.calls} 次`;
  const maxVal = Math.max(1, ...dailySeries.map((d) => d.calls));
  for (const day of dailySeries) {
    const col = document.createElement('div');
    col.className = 'chart-col';

    const val = document.createElement('div');
    val.className = 'chart-val';
    val.textContent = day.calls > 0 ? String(day.calls) : '';

    const bar = document.createElement('div');
    bar.className = day.calls > 0 ? 'chart-bar' : 'chart-bar zero';
    const hPct = day.calls > 0 ? Math.max(10, Math.round((day.calls / maxVal) * 100)) : 4;
    bar.style.height = `${Math.round((hPct / 100) * 48)}px`;
    bar.title = `${day.dateKey}: ${day.calls} 次调用 / ${day.turns} 轮对话`;

    const lbl = document.createElement('div');
    lbl.className = 'chart-lbl';
    lbl.textContent = day.label;

    col.appendChild(val);
    col.appendChild(bar);
    col.appendChild(lbl);
    chart.appendChild(col);
  }

  renderTick();
}

async function callAppTool(name, args = {}) {
  const result = await app.callServerTool({ name, arguments: args });
  if (result?.structuredContent) {
    renderState(result.structuredContent);
  }
  return result;
}

async function refreshState(withToast = false) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    await callAppTool('app_get_dashboard_state', {});
    if (withToast) showToast('已刷新本地统计');
  } catch (err) {
    $('sync-status').textContent = `刷新失败：${err?.message || '请重试'}`;
  } finally {
    refreshInFlight = false;
  }
}

function wireEvents() {
  $('cfg-weekly-mode').addEventListener('change', toggleConditionalFields);
  $('cfg-5h-mode').addEventListener('change', toggleConditionalFields);

  $('btn-refresh').addEventListener('click', () => refreshState(true));

  $('btn-toggle-settings').addEventListener('click', () => {
    const drawer = $('settings-drawer');
    const opening = !drawer.classList.contains('open');
    $('snapshot-drawer').classList.remove('open');
    if (opening && currentState) populateSettingsForm(currentState.config);
    drawer.classList.toggle('open', opening);
  });

  $('btn-close-settings').addEventListener('click', () => {
    $('settings-drawer').classList.remove('open');
  });

  $('btn-save-settings').addEventListener('click', async () => {
    const weeklyMode = $('cfg-weekly-mode').value;
    const fiveMode = $('cfg-5h-mode').value;
    const payload = {
      planType: $('cfg-plan').value,
      weeklyResetMode: weeklyMode,
      weeklyResetWeekday: Number($('cfg-weekday').value),
      weeklyResetTime: $('cfg-weektime').value || '09:00',
      fiveHourAnchorMode: fiveMode,
      weeklyRefLimit: Math.max(0, Number($('cfg-week-limit').value) || 0),
      fiveHourRefLimit: Math.max(0, Number($('cfg-5h-limit').value) || 0),
    };

    if (weeklyMode === 'exact') {
      const val = $('cfg-weekexact').value;
      if (val) {
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) {
          payload.weeklyResetExactIso = d.toISOString();
        }
      }
    }

    if (fiveMode === 'manual') {
      const h = Number($('cfg-5h-rem-h').value) || 0;
      const m = Number($('cfg-5h-rem-m').value) || 0;
      const totalMin = h * 60 + m;
      if (totalMin > 0) {
        payload.fiveHourRemainingMinutes = totalMin;
      }
    } else {
      payload.fiveHourResetExactIso = '';
    }

    try {
      await callAppTool('app_save_settings', payload);
      $('settings-drawer').classList.remove('open');
      showToast('设置已保存');
    } catch (err) {
      showToast(`保存失败：${err?.message || '未知错误'}`);
    }
  });

  $('btn-reset-5h').addEventListener('click', async () => {
    try {
      await callAppTool('app_reset_5h_anchor', { mode: 'now' });
      showToast('已从现在开始重新计 5 小时倒计时');
    } catch (err) {
      showToast(`操作失败：${err?.message || '未知错误'}`);
    }
  });

  $('btn-open-snapshot').addEventListener('click', () => {
    $('settings-drawer').classList.remove('open');
    const drawer = $('snapshot-drawer');
    const snap = currentState?.config?.manualSnapshot;
    $('snap-weekly').value = typeof snap?.weeklyRemainingPct === 'number' ? String(snap.weeklyRemainingPct) : '';
    $('snap-5h').value = typeof snap?.fiveHourRemainingPct === 'number' ? String(snap.fiveHourRemainingPct) : '';
    $('snap-note').value = snap?.note || '';
    drawer.classList.toggle('open');
  });

  $('btn-close-snapshot').addEventListener('click', () => {
    $('snapshot-drawer').classList.remove('open');
  });

  $('btn-save-snapshot').addEventListener('click', async () => {
    const wRaw = $('snap-weekly').value.trim();
    const fRaw = $('snap-5h').value.trim();
    const payload = {
      weeklyRemainingPct: wRaw === '' ? null : Math.min(100, Math.max(0, Number(wRaw))),
      fiveHourRemainingPct: fRaw === '' ? null : Math.min(100, Math.max(0, Number(fRaw))),
      note: $('snap-note').value.trim(),
    };
    try {
      await callAppTool('app_record_snapshot', payload);
      $('snapshot-drawer').classList.remove('open');
      showToast('已记录校准快照');
    } catch (err) {
      showToast(`记录失败：${err?.message || '未知错误'}`);
    }
  });

  $('btn-clear-snapshot').addEventListener('click', async () => {
    try {
      await callAppTool('app_record_snapshot', { clear: true });
      $('snapshot-drawer').classList.remove('open');
      showToast('已清除校准快照');
    } catch (err) {
      showToast(`清除失败：${err?.message || '未知错误'}`);
    }
  });

  $('btn-log-test').addEventListener('click', async () => {
    try {
      await callAppTool('app_log_manual_call', { model: '手动记次' });
      showToast('已手动 +1 记录');
    } catch (err) {
      showToast(`记录失败：${err?.message || '未知错误'}`);
    }
  });

  $('btn-clear-events').addEventListener('click', async () => {
    const btn = $('btn-clear-events');
    if (!clearConfirmArmed) {
      clearConfirmArmed = true;
      btn.textContent = '再点一次确认清空';
      if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
      clearConfirmTimer = setTimeout(() => {
        clearConfirmArmed = false;
        btn.textContent = '清空本地调用记录';
      }, 4000);
      return;
    }
    clearConfirmArmed = false;
    if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
    btn.textContent = '清空本地调用记录';
    try {
      await callAppTool('app_clear_events', {});
      showToast('已清空所有本地调用记录');
    } catch (err) {
      showToast(`清空失败：${err?.message || '未知错误'}`);
    }
  });
}

function applyThemeFromContext(ctx) {
  if (!ctx) return;
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.setAttribute('data-theme', ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
}

async function init() {
  wireEvents();

  app.ontoolinput = () => {
    if (!currentState) {
      $('sync-status').textContent = '正在加载本地统计数据…';
    }
  };
  app.ontoolresult = (result) => {
    if (result?.structuredContent) {
      renderState(result.structuredContent);
    }
  };
  app.onhostcontextchanged = (ctx) => {
    applyThemeFromContext(ctx);
  };

  await app.connect();
  applyThemeFromContext(app.getHostContext());

  if (!currentState) {
    await refreshState(false);
  }

  setInterval(renderTick, 1000);

  setInterval(() => {
    if (document.visibilityState === 'visible') {
      refreshState(false);
    }
  }, 15000);
}

init().catch((err) => {
  $('sync-status').textContent = `初始化失败：${err?.message || String(err)}`;
});
