import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  PLUGIN_ROOT,
  appendEvent,
  clearEvents,
  getDashboardState,
  resolveDataDir,
  saveConfig,
} from './storage.mjs';

const APP_URI = 'ui://quota-tracker/dashboard.html';
const APP_MIME = 'text/html;profile=mcp-app';

function parseDataDirArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--data-dir=')) {
      return arg.slice('--data-dir='.length);
    }
    if (arg === '--data-dir' && argv[i + 1]) {
      return argv[i + 1];
    }
  }
  return '';
}

const DATA_DIR = resolveDataDir(parseDataDirArg(process.argv.slice(2)));

function loadAppHtml() {
  const htmlPath = process.env.QUOTA_TRACKER_APP_HTML || path.join(PLUGIN_ROOT, 'dist', 'app.html');
  return fs.readFileSync(htmlPath, 'utf8');
}

function formatDurationShort(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}小时 ${mins}分`;
  return `${hours}小时 ${mins}分`;
}

function summarizeStateForModel(state) {
  const lines = [
    '已打开/刷新「额度统计与倒计时」本地面板（注：数据为本地 Hook 统计与用户配置倒计时，非官方实时余量）。',
    `- 订阅模式：${state.config.planType === 'pro_ultra' ? 'Pro / Ultra（5小时 + 每周）' : 'Free / Plus（仅每周）'}`,
    `- 本周重置倒计时：${formatDurationShort(state.weeklyWindow.remainingMs)}（重置时间：${state.weeklyWindow.endIso}）`,
    `- 本周本地统计：${state.weeklyWindow.calls} 次模型调用 / ${state.weeklyWindow.turns} 轮对话 / ${state.weeklyWindow.uniqueConversations} 个会话`,
  ];
  if (state.config.planType === 'pro_ultra') {
    if (state.fiveHourWindow.active) {
      lines.push(
        `- 5 小时窗口倒计时：${formatDurationShort(state.fiveHourWindow.remainingMs)}，窗口内调用 ${state.fiveHourWindow.calls} 次`,
      );
    } else {
      lines.push('- 5 小时窗口：近 5 小时暂无调用（待命状态）');
    }
  }
  if (state.models.length > 0) {
    const top = state.models
      .slice(0, 5)
      .map((m) => `${m.name}: 本周 ${m.weeklyCalls} 次 / 5h ${m.fiveHourCalls} 次`)
      .join('；');
    lines.push(`- 模型分布：${top}`);
  }
  return lines.join('\n');
}

const server = new McpServer({
  name: 'quota-tracker',
  version: '1.0.0',
});

server.registerResource(
  'quota-tracker-dashboard',
  APP_URI,
  {
    title: '额度统计与倒计时',
    description: 'Local model usage statistics and quota reset countdown dashboard',
    mimeType: APP_MIME,
    _meta: {
      ui: {
        prefersBorder: false,
      },
    },
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: APP_MIME,
        text: loadAppHtml(),
        _meta: {
          ui: {
            prefersBorder: false,
          },
        },
      },
    ],
  }),
);

server.registerTool(
  'open_quota_dashboard',
  {
    title: '额度统计与倒计时',
    description:
      'Open or refresh the local model usage statistics and quota reset countdown dashboard in the Antigravity side pane.',
    inputSchema: {
      note: z.string().optional().describe('Optional note (unused; all arguments are optional for entrypoint launch).'),
    },
    _meta: {
      ui: {
        resourceUri: APP_URI,
      },
      'com.google.antigravity/ui': {
        entrypoints: [
          { type: 'aux_pane', title: '额度统计与倒计时' },
          { type: 'global', title: '额度统计与倒计时' },
        ],
      },
    },
  },
  async () => {
    const state = getDashboardState(DATA_DIR);
    return {
      content: [{ type: 'text', text: summarizeStateForModel(state) }],
      structuredContent: state,
    };
  },
);

const settingsSchema = {
  planType: z.enum(['pro_ultra', 'free_plus']).optional().describe('Subscription plan preset.'),
  weeklyResetMode: z.enum(['weekday', 'exact']).optional().describe('Weekly reset calculation mode.'),
  weeklyResetWeekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .optional()
    .describe('Weekday for weekly reset (0=Sun, 1=Mon, ..., 6=Sat).'),
  weeklyResetTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe('Local HH:MM time for weekly reset (e.g. "09:00").'),
  weeklyResetExactIso: z
    .string()
    .optional()
    .describe('Exact ISO timestamp for the next weekly reset (used when weeklyResetMode is "exact").'),
  fiveHourAnchorMode: z.enum(['auto', 'manual']).optional().describe('5-hour rolling window mode.'),
  fiveHourResetExactIso: z
    .string()
    .optional()
    .describe('Exact ISO timestamp for next 5-hour window reset when manual.'),
  fiveHourRemainingMinutes: z
    .number()
    .min(0)
    .max(1440)
    .optional()
    .describe('Convenience shortcut: set manual 5h reset to N minutes from now.'),
  weeklyRefLimit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional reference weekly call count for progress bar (0 hides bar).'),
  fiveHourRefLimit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional reference 5-hour call count for progress bar (0 hides bar).'),
};

function applySettingsPatch(args) {
  const patch = { ...args };
  if (typeof args.fiveHourRemainingMinutes === 'number' && args.fiveHourRemainingMinutes > 0) {
    patch.fiveHourAnchorMode = 'manual';
    patch.fiveHourResetExactIso = new Date(
      Date.now() + args.fiveHourRemainingMinutes * 60 * 1000,
    ).toISOString();
    delete patch.fiveHourRemainingMinutes;
  }
  saveConfig(DATA_DIR, patch);
  return getDashboardState(DATA_DIR);
}

server.registerTool(
  'update_quota_settings',
  {
    title: '更新额度倒计时设置',
    description:
      'Update local quota tracker settings such as subscription plan, weekly reset schedule, 5-hour countdown, or reference limits.',
    inputSchema: settingsSchema,
  },
  async (args) => {
    const state = applySettingsPatch(args || {});
    return {
      content: [
        {
          type: 'text',
          text: `已更新本地额度统计设置。\n${summarizeStateForModel(state)}`,
        },
      ],
      structuredContent: state,
    };
  },
);

server.registerTool(
  'reset_usage_stats',
  {
    title: '重置本地统计或 5h 起点',
    description:
      'Reset the 5-hour rolling window anchor to start from now ("5h_anchor"), switch 5h back to auto ("5h_auto"), or clear all local usage records ("all").',
    inputSchema: {
      scope: z.enum(['5h_anchor', '5h_auto', 'all']).optional().describe('What to reset (default: 5h_anchor).'),
    },
  },
  async (args) => {
    const scope = args?.scope || '5h_anchor';
    if (scope === 'all') {
      clearEvents(DATA_DIR);
    } else if (scope === '5h_auto') {
      saveConfig(DATA_DIR, { fiveHourAnchorMode: 'auto', fiveHourResetExactIso: '' });
    } else {
      const stateBefore = getDashboardState(DATA_DIR);
      const hours = Number(stateBefore.config.fiveHourHours) || 5;
      saveConfig(DATA_DIR, {
        fiveHourAnchorMode: 'manual',
        fiveHourResetExactIso: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
      });
    }
    const state = getDashboardState(DATA_DIR);
    return {
      content: [{ type: 'text', text: `已完成重置（${scope}）。\n${summarizeStateForModel(state)}` }],
      structuredContent: state,
    };
  },
);

const APP_ONLY_META = { ui: { visibility: ['app'] } };

server.registerTool(
  'app_get_dashboard_state',
  {
    title: 'Get Dashboard State',
    description: 'Fetch latest local quota statistics and countdown state for the UI.',
    inputSchema: {},
    _meta: APP_ONLY_META,
  },
  async () => {
    const state = getDashboardState(DATA_DIR);
    return {
      content: [{ type: 'text', text: 'ok' }],
      structuredContent: state,
    };
  },
);

server.registerTool(
  'app_save_settings',
  {
    title: 'Save Dashboard Settings',
    description: 'Persist settings from the MCP App UI.',
    inputSchema: settingsSchema,
    _meta: APP_ONLY_META,
  },
  async (args) => {
    const state = applySettingsPatch(args || {});
    return {
      content: [{ type: 'text', text: 'saved' }],
      structuredContent: state,
    };
  },
);

server.registerTool(
  'app_record_snapshot',
  {
    title: 'Record Official Quota Snapshot',
    description: 'Save or clear a user-entered reference snapshot observed from Settings -> Models.',
    inputSchema: {
      clear: z.boolean().optional(),
      weeklyRemainingPct: z.number().min(0).max(100).nullable().optional(),
      fiveHourRemainingPct: z.number().min(0).max(100).nullable().optional(),
      note: z.string().max(120).optional(),
    },
    _meta: APP_ONLY_META,
  },
  async (args) => {
    if (args?.clear) {
      saveConfig(DATA_DIR, { manualSnapshot: null });
    } else {
      saveConfig(DATA_DIR, {
        manualSnapshot: {
          weeklyRemainingPct:
            typeof args?.weeklyRemainingPct === 'number' ? args.weeklyRemainingPct : null,
          fiveHourRemainingPct:
            typeof args?.fiveHourRemainingPct === 'number' ? args.fiveHourRemainingPct : null,
          note: (args?.note || '').trim(),
          recordedAt: new Date().toISOString(),
        },
      });
    }
    const state = getDashboardState(DATA_DIR);
    return {
      content: [{ type: 'text', text: 'snapshot_saved' }],
      structuredContent: state,
    };
  },
);

server.registerTool(
  'app_reset_5h_anchor',
  {
    title: 'Reset 5h Window Anchor',
    description: 'Start a fresh 5-hour countdown from now or return to automatic detection.',
    inputSchema: {
      mode: z.enum(['now', 'auto']).optional(),
    },
    _meta: APP_ONLY_META,
  },
  async (args) => {
    if (args?.mode === 'auto') {
      saveConfig(DATA_DIR, { fiveHourAnchorMode: 'auto', fiveHourResetExactIso: '' });
    } else {
      const current = getDashboardState(DATA_DIR);
      const hours = Number(current.config.fiveHourHours) || 5;
      saveConfig(DATA_DIR, {
        fiveHourAnchorMode: 'manual',
        fiveHourResetExactIso: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
      });
    }
    const state = getDashboardState(DATA_DIR);
    return {
      content: [{ type: 'text', text: 'anchor_updated' }],
      structuredContent: state,
    };
  },
);

server.registerTool(
  'app_log_manual_call',
  {
    title: 'Log Manual Invocation',
    description: 'Record a manual model call entry from the UI.',
    inputSchema: {
      model: z.string().max(80).optional(),
    },
    _meta: APP_ONLY_META,
  },
  async (args) => {
    appendEvent(DATA_DIR, {
      event: 'invocation',
      model: (args?.model || '').trim() || 'Manual Entry',
      source: 'manual',
    });
    const state = getDashboardState(DATA_DIR);
    return {
      content: [{ type: 'text', text: 'logged' }],
      structuredContent: state,
    };
  },
);

server.registerTool(
  'app_clear_events',
  {
    title: 'Clear Local Usage Events',
    description: 'Clear all locally logged invocation events.',
    inputSchema: {},
    _meta: APP_ONLY_META,
  },
  async () => {
    clearEvents(DATA_DIR);
    const state = getDashboardState(DATA_DIR);
    return {
      content: [{ type: 'text', text: 'cleared' }],
      structuredContent: state,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('quota-tracker MCP server fatal error:', err);
  process.exit(1);
});
