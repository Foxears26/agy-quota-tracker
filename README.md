# Antigravity Quota Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](#english) | [简体中文](#简体中文)

---

<a id="english"></a>

## English

A local model usage statistics and quota reset countdown dashboard plugin for **Google Antigravity**, docked in the right-hand side pane (`aux_pane`) alongside your main chat canvas. Built strictly on official **Plugins + Lifecycle Hooks + MCP Apps** — **zero `npm install` required for end users**.

> **Transparency Note**
> This plugin uses **only documented, official Antigravity extension APIs** and never probes undocumented internal services. The dashboard tracks **local model invocation counts and user-configured reset countdowns**, rather than reading Google's live server-side remaining percentage. After checking official remaining quota in **Settings → Models**, you can log a quick calibration snapshot in the panel, and the plugin will automatically count every local invocation since that snapshot.

### Features

- **Zero-Dependency Runtime**: Pre-bundled single-file MCP server (`dist/server.cjs`) and single-file MCP App UI (`dist/app.html`) are included in the repository. Just clone into your Antigravity plugins directory — only Node.js ≥ 20 is required.
- **Side Pane & Sidebar Support**: Keep it docked next to the chat canvas via the side pane `+` menu (`aux_pane`), or open it full-page from the left sidebar (`global`). Automatically adapts to Antigravity light and dark themes.
- **Dual Live Countdowns**:
  - **5-Hour Rolling Window**: Automatically infers the active rolling window from your earliest call in the last 5 hours, or lets you set a manual remaining countdown / click **Start 5h from now**.
  - **Weekly Reset Countdown**: Supports recurring weekly schedule (weekday + local time) or an exact next reset timestamp copied from **Settings → Models** (automatically rolls forward by 7 days after reset).
  - Switchable between **Pro / Ultra** (5-hour + weekly) and **Free / Plus** (weekly only).
- **Automatic Local Tracking via Lifecycle Hooks**: `PreInvocation` and `Stop` hooks silently record per-model invocation counts, completed turns, unique conversations, model distribution bars, and a 7-day daily trend chart.
- **Official Quota Snapshot Reference**: Optionally save your latest observed official percentage (weekly / 5h) and a note; the dashboard tracks how many local calls have occurred since that snapshot.
- **Privacy First**: All runtime stats and user preferences are stored in Antigravity's isolated `${PLUGIN_DATA}` directory, completely separate from the plugin source folder.

### Installation

#### Prerequisites
- Google Antigravity (Desktop App or IDE)
- Node.js ≥ 20 (`node` available on your `PATH`)

#### Option 1: Clone directly into Antigravity's global plugins folder (Recommended — no `npm install`)

**Windows (PowerShell):**
```powershell
git clone https://github.com/Foxears26/agy-quota-tracker.git "$env:USERPROFILE\.gemini\config\plugins\quota-tracker"
```

**macOS / Linux:**
```bash
git clone https://github.com/Foxears26/agy-quota-tracker.git ~/.gemini/config/plugins/quota-tracker
```

Antigravity discovers and loads the plugin automatically (no restart usually required; if the `+` menu item does not appear immediately, refresh the MCP server in **MCP Servers** settings or restart the app).

#### Option 2: Install via Antigravity CLI (`agy`)
```bash
git clone https://github.com/Foxears26/agy-quota-tracker.git
agy plugin install ./agy-quota-tracker
```

### Usage

1. **Open the dashboard**:
   - Click **`+`** in the right-hand side pane of the chat view and select **额度统计与倒计时**,
   - Or open it from the left sidebar,
   - Or ask the agent directly in chat: `Open the quota tracker dashboard`.
2. **Configure your reset cycle**:
   - Click **⚙ 设置 (Settings)** in the top-right corner of the panel to pick your plan type, weekly reset schedule, optional reference thresholds, or manual 5-hour countdown.
   - You can also ask the agent in natural language (e.g., `Set weekly quota reset to every Monday at 09:00`).
3. **Record a calibration snapshot**:
   - Check your official remaining quota under **Settings → Models**, then click **记录校准** in the side pane to store a timestamped snapshot and track subsequent local calls.

### Project Structure

```text
agy-quota-tracker/
├── plugin.json             # Antigravity plugin manifest
├── mcp_config.json         # MCP server entry (runs pre-bundled dist/server.cjs)
├── hooks.json              # PreInvocation & Stop lifecycle hooks
├── assets/logo.svg         # Plugin icon
├── skills/quota-tracker/   # Bundled agent skill
├── hooks/record-usage.mjs  # Lightweight usage logger (Node built-ins only)
├── server/                 # MCP server & analytics source
│   ├── index.mjs
│   └── storage.mjs
├── web/                    # MCP App frontend source
│   ├── template.html
│   └── app.js
├── scripts/build.mjs       # esbuild bundler for dist/app.html and dist/server.cjs
└── dist/                   # Pre-built bundles (enables zero-npm-install usage)
    ├── app.html
    └── server.cjs
```

### Development & Rebuilding

If you modify files under `web/` or `server/`, install dev dependencies and rebuild the `dist/` bundles:

```bash
npm install
npm run build
```

Or rebuild targets individually:

```bash
npm run build:ui      # Rebuild dist/app.html only
npm run build:server  # Rebuild dist/server.cjs only
```

---

<a id="简体中文"></a>

## 简体中文

一个运行在 **Google Antigravity** 主聊天界面右侧辅助面板（`aux_pane`）中的本地模型调用统计与额度刷新倒计时插件，严格基于官方 **Plugins + Lifecycle Hooks + MCP Apps** 机制构建，**最终用户克隆即可用，无需执行 `npm install`**。

> **透明说明**
> 本插件严格遵循 Antigravity 官方公开扩展接口，**不探测或依赖任何未公开的内部服务**。面板展示的是**本地自动统计的调用次数与你设定的刷新倒计时**，而非 Google 官方后台实时剩余额度百分比。你可以在查看完官方 **Settings → Models** 后，在面板中一键记录参考余量快照，插件会自动统计此后新增的本地调用次数方便对照。

### 主要功能

- **零依赖开箱即用**：仓库内已预打包单文件 MCP 服务端（`dist/server.cjs`）与单文件前端 UI（`dist/app.html`），克隆到插件目录即可直接加载，仅要求本机已安装 Node.js ≥ 20。
- **右侧面板常驻显示**：可在主聊天界面右侧辅助面板（`aux_pane`）并排常驻，也可从左侧边栏全屏打开，并自动跟随 Antigravity 浅色 / 深色主题。
- **双倒计时卡片**：
  - **5 小时滚动窗口**：默认根据近 5 小时内首次调用自动推算滚动窗口，也支持手动输入剩余倒计时或一键「从现在计 5h」。
  - **每周额度刷新倒计时**：支持按「每周固定星期 + 时间」循环滚算，或直接填入 **Settings → Models** 显示的精确重置日期时间（到期后自动顺延 7 天）。
  - 支持 **Pro / Ultra**（5 小时 + 每周）与 **Free / Plus**（仅每周）两种订阅预设切换。
- **自动本地调用统计**：通过 `PreInvocation` 和 `Stop` 生命周期 Hook 静默记录每次模型调用、完成轮次与会话数，展示**本周各模型调用分布**与**近 7 天调用趋势柱状图**。
- **官方余量快照对照**：可随时记录当前官方剩余百分比（本周 / 5h）及备注，面板会自动统计快照之后新增的本地调用次数。
- **隐私安全隔离**：个人统计日志与设置保存在 Antigravity 管理的独立 `${PLUGIN_DATA}` 目录中，与插件源码目录完全分离。

### 快速安装

#### 环境要求
- Google Antigravity（桌面端 / IDE）
- Node.js ≥ 20（确保 `node` 在系统 `PATH` 中可用）

#### 方式一：直接克隆到 Antigravity 全局插件目录（推荐，免 `npm install`）

**Windows (PowerShell):**
```powershell
git clone https://github.com/Foxears26/agy-quota-tracker.git "$env:USERPROFILE\.gemini\config\plugins\quota-tracker"
```

**macOS / Linux:**
```bash
git clone https://github.com/Foxears26/agy-quota-tracker.git ~/.gemini/config/plugins/quota-tracker
```

Antigravity 会自动发现并加载该插件，通常**无需重启**（若右侧 `+` 菜单未立即出现，可在 **MCP Servers** 设置中刷新或重启一次应用）。

#### 方式二：通过 Antigravity CLI（`agy`）安装
```bash
git clone https://github.com/Foxears26/agy-quota-tracker.git
agy plugin install ./agy-quota-tracker
```

### 使用说明

1. **打开面板**：
   - 在聊天界面右侧辅助面板点击 **`+`** 按钮，选择 **额度统计与倒计时**；
   - 或从左侧边栏入口打开完整视图；
   - 也可以直接在对话中发送：`打开额度统计与倒计时面板`。
2. **首次校准设置**：
   - 点击面板右上角 **⚙ 设置**，配置订阅模式、每周刷新时间、可选参考调用上限或手动 5 小时倒计时；
   - 也可以直接用自然语言让 Agent 帮你修改，例如：`把每周额度刷新时间设为每周三早上 8:30`。
3. **记录官方快照**：
   - 点开 Antigravity 原生 **Settings → Models** 查看官方剩余比例后，回到面板点击 **记录校准** 顺手记一笔，后续即可在主界面旁实时跟踪此后新增的调用量。

### 二次开发与重新构建

如果你修改了 `web/` 或 `server/` 目录下的源码，需要安装开发依赖并重新构建 `dist/` 产物：

```bash
npm install
npm run build
```

也可以按需单独构建：

```bash
npm run build:ui      # 仅重新打包 dist/app.html
npm run build:server  # 仅重新打包 dist/server.cjs
```

---

## License

[MIT](LICENSE)
