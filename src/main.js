const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, spawn, execFileSync } = require('child_process');
const crypto = require('crypto');

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch {}

// stable data location: identical for dev (electron .) and the installed app,
// so updates/reinstalls never lose chats or settings
app.setPath('userData', path.join(app.getPath('appData'), 'clop'));

// one instance only — a second copy (e.g. dev + installed simultaneously)
// would share the same userData and could corrupt or shadow it
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const chatsPath = () => path.join(app.getPath('userData'), 'chats.json');
const backupDir = () => {
  const d = path.join(app.getPath('documents'), 'clop-projects', '.clop-backup');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
};
// every save is mirrored to Documents\clop-projects\.clop-backup;
// a missing/corrupt primary file is silently restored from there
function saveWithBackup(file, data) {
  fs.writeFileSync(file, data, 'utf8');
  try { fs.writeFileSync(path.join(backupDir(), path.basename(file)), data, 'utf8'); } catch {}
}
function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  try {
    const j = JSON.parse(fs.readFileSync(path.join(backupDir(), path.basename(file)), 'utf8'));
    try { fs.writeFileSync(file, JSON.stringify(j), 'utf8'); } catch {}
    return j;
  } catch {}
  return fallback;
}

function loadSettings() {
  return loadJson(settingsPath(), { baseUrl: '', apiKey: '', model: '', models: '' });
}
function saveSettings(s) {
  saveWithBackup(settingsPath(), JSON.stringify(s, null, 2));
}
function loadChats() {
  return loadJson(chatsPath(), []);
}
function saveChats(chats) {
  saveWithBackup(chatsPath(), JSON.stringify(chats));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    backgroundColor: '#262624',
    title: 'clop',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  try {
    if (autoUpdater && app.isPackaged) {
      autoUpdater.on('update-downloaded', async (info) => {
        try {
          const r = await dialog.showMessageBox({
            type: 'info',
            title: 'clop',
            message: 'Update ' + (info?.version || '') + ' downloaded',
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            cancelId: 1
          });
          if (r.response === 0) autoUpdater.quitAndInstall();
        } catch {}
      });
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
  } catch {}
});
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return 'dev';
  if (!autoUpdater) return 'error: updater unavailable';
  try {
    const r = await autoUpdater.checkForUpdates();
    const v = r?.updateInfo?.version;
    if (v && v !== app.getVersion()) return 'available: ' + v;
    return 'none';
  } catch (err) {
    return 'error: ' + String(err && err.message || err).slice(0, 200);
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- projects folder & version ----------
const projectsRoot = () => {
  const p = path.join(app.getPath('documents'), 'clop-projects');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
};
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('shell:open', (_e, u) => {
  if (typeof u === 'string' && /^https?:\/\//i.test(u)) shell.openExternal(u);
  return true;
});
ipcMain.handle('projects:root', () => projectsRoot());

// ---------- settings & chats ----------
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_e, s) => { saveSettings(s); return true; });
ipcMain.handle('chats:get', () => loadChats());
ipcMain.handle('chats:set', (_e, chats) => { saveChats(chats); return true; });

// ---------- files ----------
ipcMain.handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

function listDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !['node_modules', '.git', '.DS_Store'].includes(e.name))
    .map(e => ({ name: e.name, dir: e.isDirectory(), path: path.join(dir, e.name) }));
  entries.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  return entries;
}
ipcMain.handle('fs:list', (_e, dir) => listDir(dir));
ipcMain.handle('fs:read', (_e, p) => fs.readFileSync(p, 'utf8'));
ipcMain.handle('fs:readb64', (_e, p) => fs.readFileSync(p).toString('base64'));
ipcMain.handle('fs:write', (_e, p, content) => { fs.writeFileSync(p, content, 'utf8'); return true; });
ipcMain.handle('attach:save', (_e, name, base64) => {
  const dir = path.join(app.getPath('userData'), 'attachments');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, Date.now() + '-' + name.replace(/[^\w.\-]/g, '_'));
  fs.writeFileSync(p, Buffer.from(base64, 'base64'));
  return p;
});

// ---------- artifact versions ----------
function artverDir(filePath) {
  const hash = crypto.createHash('sha1').update(String(filePath)).digest('hex').slice(0, 16);
  return path.join(app.getPath('userData'), 'artifact-versions', hash);
}
function artverListDir(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(n => /^\d+\.v$/.test(n))
      .map(n => parseInt(n, 10))
      .sort((a, b) => b - a);
  } catch { return []; }
}
function artverSave(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const dir = artverDir(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(filePath, path.join(dir, Date.now() + '.v'));
    const all = artverListDir(dir);
    for (const ts of all.slice(20)) {
      try { fs.unlinkSync(path.join(dir, ts + '.v')); } catch {}
    }
    return true;
  } catch { return false; }
}
ipcMain.handle('artver:save', (_e, filePath) => artverSave(filePath));
ipcMain.handle('artver:list', (_e, filePath) => artverListDir(artverDir(filePath)).map(ts => ({ ts })));
ipcMain.handle('artver:read', (_e, filePath, ts) =>
  fs.readFileSync(path.join(artverDir(filePath), Number(ts) + '.v')).toString('base64'));
ipcMain.handle('artver:restore', (_e, filePath, ts) => {
  const snap = fs.readFileSync(path.join(artverDir(filePath), Number(ts) + '.v'));
  artverSave(filePath);
  fs.writeFileSync(filePath, snap);
  return true;
});

// ---------- CLI-агенты (Claude Code / Codex / Gemini) ----------
ipcMain.handle('cli:detect', () => {
  const found = {};
  for (const c of ['claude', 'codex', 'gemini']) {
    try {
      execSync(`where.exe ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] });
      found[c] = true;
    } catch { found[c] = false; }
  }
  return found;
});

// ---------- running requests (reqId -> kill fn) ----------
const running = new Map();
ipcMain.handle('ai:stop', (_e, reqId) => { running.get(reqId)?.(); return true; });

function runCli(sender, { reqId, cliAgent, prompt, cwd, cont, cliModel, perm }) {
  // perm: 'auto' — agent can edit/create files (standard); 'ask' — CLI default permission flow;
  // 'all' — everything allowed, no confirmation (dangerous, user's explicit choice)
  const PERM = {
    claude: { auto: ['--permission-mode', 'acceptEdits'], ask: [], all: ['--dangerously-skip-permissions'] },
    codex:  { auto: ['--full-auto'], ask: [], all: ['--dangerously-bypass-approvals-and-sandbox'] },
    gemini: { auto: ['--approval-mode', 'auto_edit'], ask: [], all: ['--yolo'] }
  };
  // connected MCP integrations become tools of the Claude Code agent
  const mcpArgs = (() => {
    if (cliAgent !== 'claude') return [];
    const s = loadSettings();
    const servers = s.mcpServers && Object.keys(s.mcpServers).length ? s.mcpServers : null;
    if (!servers) return [];
    const p = path.join(app.getPath('userData'), 'mcp-config.json');
    try { fs.writeFileSync(p, JSON.stringify({ mcpServers: servers }), 'utf8'); } catch { return []; }
    return ['--mcp-config', `"${p}"`];
  })();
  const permArgs = (PERM[cliAgent] || {})[perm || 'auto'] || [];
  // lets the agent ask the user a question with clickable options in the chat;
  // no double quotes inside — the arg is wrapped in quotes for the Windows shell
  const ASK_NOTE = 'If you need the user to make a choice or answer a question before you can continue, end your reply with one line in this exact format: [[ASK]] your question | option 1 | option 2 | option 3. Use 2 to 4 short options, written in the same language the user writes in. Use it only when a real decision from the user is required.';
  const CFG = {
    claude: { bin: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--append-system-prompt', `"${ASK_NOTE}"`, ...mcpArgs, ...(cont ? ['-c'] : []), ...(cliModel ? ['--model', cliModel] : []), ...permArgs] },
    codex:  { bin: 'codex',  args: [...(cont ? ['exec', 'resume', '--last'] : ['exec']), ...permArgs, '-'] },
    gemini: { bin: 'gemini', args: [...permArgs] }
  };
  const cfg = CFG[cliAgent];
  if (!cfg) return Promise.reject(new Error('Unknown CLI agent: ' + cliAgent));
  const jsonStream = cliAgent === 'claude';
  return new Promise((resolve, reject) => {
    const proc = spawn(cfg.bin, cfg.args, {
      cwd: cwd || projectsRoot(),
      shell: true,
      windowsHide: true
    });
    let out = '', err = '', buf = '', killed = false;
    let sawTextDelta = false, sawThinkDelta = false;
    const meta = {};
    if (reqId) running.set(reqId, () => {
      killed = true;
      try { spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f']); } catch {}
    });
    const done = (v) => { if (reqId) running.delete(reqId); resolve(v); };
    const fail = (e2) => { if (reqId) running.delete(reqId); reject(e2); };
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      if (!jsonStream) {
        out += s;
        sender.send('ai:delta', { id: reqId, chunk: s });
        return;
      }
      buf += s;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        // live token stream (Claude Code style): partial message events
        if (j.type === 'stream_event' && j.event) {
          const ev = j.event;
          if (ev.type === 'content_block_delta' && ev.delta) {
            if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
              sawThinkDelta = true;
              sender.send('ai:activity', { id: reqId, name: 'thinking_delta', detail: ev.delta.thinking });
            } else if (ev.delta.type === 'text_delta' && ev.delta.text) {
              sawTextDelta = true;
              out += ev.delta.text;
              sender.send('ai:delta', { id: reqId, chunk: ev.delta.text });
            }
          }
          continue;
        }
        if (j.type === 'assistant' && j.message?.content) {
          for (const b of j.message.content) {
            if (b.type === 'text' && b.text) {
              if (sawTextDelta) continue; // already streamed live via text_delta
              out += b.text;
              sender.send('ai:delta', { id: reqId, chunk: b.text });
            } else if (b.type === 'tool_use') {
              let detail = '';
              try {
                const inp = b.input || {};
                detail = inp.url || inp.command || inp.file_path || inp.path || inp.query || inp.pattern || inp.description || JSON.stringify(inp);
              } catch {}
              sender.send('ai:activity', { id: reqId, name: b.name, detail: String(detail).slice(0, 300) });
            } else if (b.type === 'thinking' && b.thinking) {
              if (sawThinkDelta) continue; // already streamed live via thinking_delta
              sender.send('ai:activity', { id: reqId, name: 'thinking', detail: String(b.thinking).slice(0, 300) });
            }
          }
        } else if (j.type === 'result') {
          meta.duration_ms = j.duration_ms;
          const u = j.usage || {};
          meta.tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0);
          if (!out.trim() && typeof j.result === 'string') {
            out = j.result;
            sender.send('ai:delta', { id: reqId, chunk: j.result });
          }
        }
      }
    });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (e2) => fail(new Error(`Failed to start ${cfg.bin}: ${e2.message}`)));
    proc.on('close', (code) => {
      if (killed) { meta.stopped = true; done({ content: out.trim(), meta }); }
      else if (code !== 0 && !out.trim()) fail(new Error(`${cfg.bin} exited with code ${code}: ${err.slice(0, 500)}`));
      else done({ content: out.trim(), meta });
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// ---------- built-in terminal (persistent PowerShell per window) ----------
const terms = new Map(); // sender.id -> proc
ipcMain.handle('term:start', (e, cwd) => {
  const prev = terms.get(e.sender.id);
  if (prev) { try { prev.kill(); } catch {} terms.delete(e.sender.id); }
  const sender = e.sender;
  const proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile'], {
    cwd: cwd || projectsRoot(),
    windowsHide: true
  });
  terms.set(sender.id, proc);
  const pipe = (d) => { if (!sender.isDestroyed()) sender.send('term:data', d.toString()); };
  proc.stdout.on('data', pipe);
  proc.stderr.on('data', pipe);
  proc.on('close', () => {
    if (terms.get(sender.id) === proc) terms.delete(sender.id);
    if (!sender.isDestroyed()) sender.send('term:data', '\n[terminal exited]\n');
  });
  proc.on('error', (err) => { if (!sender.isDestroyed()) sender.send('term:data', '\n' + err.message + '\n'); });
  return true;
});
ipcMain.handle('term:input', (e, s) => {
  const proc = terms.get(e.sender.id);
  if (proc) { try { proc.stdin.write(String(s) + '\r\n'); } catch {} }
  return true;
});
ipcMain.handle('term:kill', (e) => {
  const proc = terms.get(e.sender.id);
  if (proc) { try { proc.kill(); } catch {} terms.delete(e.sender.id); }
  return true;
});

// ---------- git ----------
function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}
ipcMain.handle('git:info', (_e, dir) => {
  try {
    const out = git(dir, ['status', '--porcelain=v1', '-b']);
    const lines = out.split('\n').filter(Boolean);
    let branch = '';
    const changes = [];
    for (const line of lines) {
      if (line.startsWith('##')) {
        branch = line.slice(2).trim().split('...')[0];
      } else {
        const status = line.slice(0, 2).trim();
        const file = line.slice(3).trim().replace(/^"|"$/g, '');
        changes.push({ file, status });
      }
    }
    return { branch, changes };
  } catch (err) { return { error: String(err.message || err).slice(0, 500) }; }
});
ipcMain.handle('git:diff', (_e, dir, file) => {
  try {
    let out = '';
    try { out = git(dir, ['diff', 'HEAD', '--', file]); }
    catch { out = git(dir, ['diff', '--', file]); }
    return { diff: out };
  } catch (err) { return { error: String(err.message || err).slice(0, 500) }; }
});
ipcMain.handle('git:commit', (_e, dir, msg) => {
  try {
    git(dir, ['add', '-A']);
    const out = git(dir, ['commit', '-m', String(msg)]);
    return { result: out.trim().slice(0, 500) };
  } catch (err) { return { error: String(err.message || err).slice(0, 500) }; }
});
ipcMain.handle('git:init', (_e, dir) => {
  try { return { result: git(dir, ['init']).trim() }; }
  catch (err) { return { error: String(err.message || err).slice(0, 500) }; }
});

// ---------- AI proxy (streaming, OpenAI-compatible) ----------
ipcMain.handle('ai:chat', async (e, payload) => {
  if (payload.cliAgent) return runCli(e.sender, payload);
  return apiChat(e, payload);
});

// local models via Ollama (no key needed)
const OLLAMA = 'http://127.0.0.1:11434';
ipcMain.handle('ollama:models', async () => {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 1500);
    const r = await fetch(OLLAMA + '/api/tags', { signal: ac.signal });
    clearTimeout(to);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models || []).map(m => m.name);
  } catch { return []; }
});

async function apiChat(e, { reqId, messages, tools, model, reasoning }) {
  const s = loadSettings();
  const isLocal = typeof model === 'string' && model.startsWith('local:');
  if (!isLocal && !s.apiKey) throw new Error('API key is not set. Open Settings.');
  const url = (isLocal ? OLLAMA + '/v1' : s.baseUrl.replace(/\/+$/, '')) + '/chat/completions';
  const body = {
    model: isLocal ? model.slice(6) : (model || s.model),
    messages,
    tools: tools && tools.length ? tools : undefined,
    stream: true
  };
  if (!isLocal && reasoning && reasoning !== 'none') body.reasoning_effort = reasoning;
  const ac = new AbortController();
  if (reqId) running.set(reqId, () => ac.abort());
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isLocal ? {} : { 'Authorization': 'Bearer ' + s.apiKey })
      },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Провайдер вернул ${res.status}: ${t.slice(0, 500)}`);
    }
    const sender = e.sender;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = { content: '', tool_calls: [] };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const m = line.trim();
        if (!m.startsWith('data:')) continue;
        const data = m.slice(5).trim();
        if (data === '[DONE]') continue;
        let j;
        try { j = JSON.parse(data); } catch { continue; }
        const delta = j.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          full.content += delta.content;
          sender.send('ai:delta', { id: reqId, chunk: delta.content });
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            if (!full.tool_calls[i]) full.tool_calls[i] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
            if (tc.id) full.tool_calls[i].id = tc.id;
            if (tc.function?.name) full.tool_calls[i].function.name += tc.function.name;
            if (tc.function?.arguments) full.tool_calls[i].function.arguments += tc.function.arguments;
          }
        }
      }
    }
    if (!full.tool_calls.length) delete full.tool_calls;
    return full;
  } catch (err) {
    if (ac.signal.aborted) throw new Error('STOPPED');
    throw err;
  } finally {
    if (reqId) running.delete(reqId);
  }
}
