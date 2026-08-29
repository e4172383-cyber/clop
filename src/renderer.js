const $ = (id) => document.getElementById(id);

let rootDir = null;
let currentFile = null;
let chats = [];
let activeChat = null;
let cliAgents = {};
let settings = { baseUrl: '', apiKey: '', model: '', models: '', lang: 'en', enabledClis: [] };

// ================= per-chat runtime state (never persisted) =================
const RT = new Map(); // chat.id -> { busy, reqId, live, queue }
function rt(chat) {
  let r = RT.get(chat.id);
  if (!r) {
    r = { busy: false, reqId: null, live: { text: '', acts: [], mode: null, t0: 0 }, queue: [], touched: new Set(), pages: new Set() };
    RT.set(chat.id, r);
  }
  return r;
}
const streams = new Map(); // reqId -> stream handler { aiDiv, act, delta(), activity() }
function newReqId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// single persistent subscriptions; events are routed by reqId
clop.onDelta((p) => { const h = streams.get(p.id); if (h) h.delta(p.chunk); });
clop.onActivity((p) => { const h = streams.get(p.id); if (h) h.activity(p); });

// ================= i18n =================
const T_OLD = {
  en: {
    newChat: 'New chat', openFolder: 'Open project folder', settings: 'Settings',
    code: 'Code', send: 'Send', save: 'Save', saved: 'Saved', cancel: 'Cancel',
    welcome: 'How can I help?',
    welcomeSub: 'Open a project folder and configure a provider — I can read and edit code',
    promptPh: 'Ask anything or request code changes...',
    editorPh: '// select a file on the left',
    noFile: 'no file', treeEmpty: 'Open a project folder', open: 'Open',
    settingsTitle: 'Settings', lang: 'Language', providerTitle: 'API provider',
    providerHint: 'Any OpenAI-compatible server: OpenAI, OpenRouter, Ollama (http://localhost:11434/v1), your own proxy...',
    baseUrl: 'Base URL', apiKey: 'API key',
    models: 'Models (comma-separated; first is default)',
    agents: 'Agents on this computer',
    connect: 'Connect', disconnect: 'Disconnect',
    connected: 'connected', found: 'found', notInstalled: 'not installed',
    noModel: 'no model set', emptyReply: '(empty reply)',
    reasonNone: 'No reasoning', reasonLow: 'Reasoning: low', reasonMedium: 'Reasoning: medium', reasonHigh: 'Reasoning: high',
    openFileErr: 'Failed to open file: ', folderNotOpen: 'Project folder is not open',
    unknownTool: 'Unknown tool: ', toolErr: 'Error: ',
    sysPrompt: 'You are an assistant agent in the clop IDE. You have tools list_dir, read_file, write_file for the opened project folder. Answer briefly, in the user\'s language. Read a file before editing it.',
    sysFolder: ' Opened folder: ', sysNoFolder: ' No project folder is opened yet.'
  },
  ru: {
    newChat: 'Новый чат', openFolder: 'Открыть папку проекта', settings: 'Настройки',
    code: 'Код', send: 'Отправить', save: 'Сохранить', saved: 'Сохранено', cancel: 'Отмена',
    welcome: 'Чем помочь?',
    welcomeSub: 'Открой папку проекта и настрой провайдера — я смогу читать и править код',
    promptPh: 'Спросите или попросите изменить код…',
    editorPh: '// выберите файл слева',
    noFile: 'нет файла', treeEmpty: 'Откройте папку проекта', open: 'Открыть',
    settingsTitle: 'Настройки', lang: 'Язык', providerTitle: 'API-провайдер',
    providerHint: 'Любой OpenAI-совместимый сервер: OpenAI, OpenRouter, Ollama (http://localhost:11434/v1), свой прокси…',
    baseUrl: 'Base URL', apiKey: 'API-ключ',
    models: 'Модели (через запятую; первая — по умолчанию)',
    agents: 'Агенты на компьютере',
    connect: 'Подключить', disconnect: 'Отключить',
    connected: 'подключён', found: 'найден', notInstalled: 'не установлен',
    noModel: 'модель не задана', emptyReply: '(пустой ответ)',
    reasonNone: 'Без раздумий', reasonLow: 'Раздумия: низкие', reasonMedium: 'Раздумия: средние', reasonHigh: 'Раздумия: высокие',
    openFileErr: 'Не удалось открыть файл: ', folderNotOpen: 'Папка проекта не открыта',
    unknownTool: 'Неизвестный инструмент: ', toolErr: 'Ошибка: ',
    sysPrompt: 'Ты — агент-помощник в IDE clop. У тебя есть инструменты list_dir, read_file, write_file для работы с открытой папкой проекта. Отвечай кратко, на языке пользователя. Перед правкой файла читай его.',
    sysFolder: ' Открыта папка: ', sysNoFolder: ' Папка проекта пока не открыта.'
  }
};
const T = window.CLOP_LANGS || T_OLD;
const t = (k) => (T[settings.lang] && T[settings.lang][k]) ?? T.en[k] ?? k;

function fillSelect(sel, pairs) {
  const prev = sel.value;
  sel.innerHTML = '';
  for (const [v, label] of pairs) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    sel.appendChild(o);
  }
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function applyLang() {
  const set = (id, key, prop = 'textContent') => {
    const el = document.getElementById(id);
    if (el) el[prop] = t(key);
  };
  set('tNewChat', 'newChat'); set('openBtn', 'openFolder'); set('settingsBtn', 'settings');
  set('filesToggle', 'code'); set('sendBtn', 'send'); set('stopBtn', 'stop'); set('saveBtn', 'save');
  set('sCancel', 'cancel'); set('sSave', 'save');
  set('tWelcome', 'welcome'); set('tWelcomeSub', 'welcomeSub');
  set('prompt', 'promptPh', 'placeholder'); set('editor', 'editorPh', 'placeholder');
  if (!currentFile) set('fileName', 'noFile');
  set('tTreeEmpty', 'treeEmpty'); set('openBtn2', 'open');
  set('tabCode', 'code'); set('tNoArtifacts', 'noArtifacts');
  // keep the badge element alive across re-labels (textContent wipes children)
  if (!window.__artBadge) window.__artBadge = $('artBadge');
  $('tabArt').textContent = t('artifacts');
  if (window.__artBadge) $('tabArt').appendChild(window.__artBadge);
  set('tabGit', 'gitTab');
  set('tTerminal', 'terminal'); set('termClear', 'clear');
  set('gitMsg', 'commitPh', 'placeholder');
  set('gitCommitBtn', 'commit'); set('gitRefresh', 'refresh');
  set('tSettingsTitle', 'settingsTitle'); set('tLang', 'lang');
  set('tProviderTitle', 'providerTitle'); set('tProviderHint', 'providerHint');
  set('tBaseUrl', 'baseUrl'); set('tApiKey', 'apiKey');
  set('tModels', 'models'); set('tAgents', 'agents');
  set('tIntegrations', 'integrations'); set('tIntHint', 'intHint');
  set('intSearch', 'intSearchPh', 'placeholder'); set('intCustomAdd', 'add');
  set('updBtn', 'checkUpdates'); set('artRestoreBtn', 'restore');
  fillSelect($('reasonSelect'), [
    ['none', t('reasonNone')], ['low', t('reasonLow')], ['medium', t('reasonMedium')], ['high', t('reasonHigh')]
  ]);
  fillSelect($('permSelect'), [
    ['auto', t('permAuto')], ['ask', t('permAsk')], ['all', t('permAll')]
  ]);
  fillSelect($('sLang'), Object.entries(T).map(([code, d]) => [code, d._name || code]));
  $('sLang').value = settings.lang || 'en';
  if (!activeChat || !activeChat.messages.length) $('chatName').textContent = t('newChat');
}

// ================= models & agents =================
const CLI_LABELS = { claude: 'Claude Code', codex: 'Codex CLI (GPT)', gemini: 'Gemini CLI' };
const CLI_INSTALL = { claude: 'claude.com/claude-code', codex: 'npm i -g @openai/codex', gemini: 'npm i -g @google/gemini-cli' };
const CLAUDE_MODELS = [
  ['claude-fable-5', 'Fable 5'],
  ['claude-opus-5', 'Opus 5'],
  ['claude-sonnet-5', 'Sonnet 5'],
  ['claude-haiku-4-5', 'Haiku 4.5'],
  ['claude-sonnet-4-6', 'Sonnet 4.6'],
  ['claude-opus-4-8', 'Opus 4.8']
];

function enabledClis() {
  return Array.isArray(settings.enabledClis) ? settings.enabledClis : [];
}
function modelList() {
  const list = (settings.models || '').split(',').map(m => m.trim()).filter(Boolean);
  if (!list.length && settings.model) list.push(settings.model);
  return list;
}
let localModels = [];
function renderModelSelect() {
  const sel = $('modelSelect');
  const prev = sel.value;
  sel.innerHTML = '';
  for (const k of enabledClis()) {
    if (!cliAgents[k]) continue;
    if (k === 'claude') {
      for (const [id, label] of CLAUDE_MODELS) {
        const o = document.createElement('option');
        o.value = 'cli:claude:' + id;
        o.textContent = 'Claude Code · ' + label;
        sel.appendChild(o);
      }
    } else {
      const o = document.createElement('option');
      o.value = 'cli:' + k;
      o.textContent = CLI_LABELS[k];
      sel.appendChild(o);
    }
  }
  for (const m of localModels) {
    const o = document.createElement('option');
    o.value = 'local:' + m;
    o.textContent = 'Ollama · ' + m;
    sel.appendChild(o);
  }
  // API models are only usable with a key — without one they are not offered
  if (settings.apiKey) {
    for (const m of modelList()) {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      sel.appendChild(o);
    }
  }
  if (!sel.options.length) sel.innerHTML = `<option value="">${t('noAI')}</option>`;
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  sel.dispatchEvent(new Event('change'));
}
$('modelSelect').addEventListener('change', () => {
  const v = $('modelSelect').value;
  const isCli = v.startsWith('cli:');
  $('reasonSelect').style.display = (isCli || v.startsWith('local:') || !v) ? 'none' : '';
  $('permSelect').style.display = isCli ? '' : 'none';
});

function renderAgentList() {
  const box = $('agentList');
  box.innerHTML = '';
  // read-only row: local models via Ollama (auto-detected, no connect needed)
  const or = document.createElement('div');
  or.className = 'agentRow' + (localModels.length ? ' connected' : ' missing');
  or.innerHTML = `<span class="aname">Ollama (local)</span>
    <span class="astate">${localModels.length ? '● ' + localModels.length + ' models' : t('notInstalled') + ' — ollama.com'}</span>`;
  box.appendChild(or);
  for (const k of ['claude', 'codex', 'gemini']) {
    const found = !!cliAgents[k];
    const on = enabledClis().includes(k);
    const row = document.createElement('div');
    row.className = 'agentRow' + (on ? ' connected' : '') + (found ? '' : ' missing');
    row.innerHTML = `<span class="aname">${CLI_LABELS[k]}</span>
      <span class="astate">${found ? (on ? '\u25CF ' + t('connected') : t('found')) : t('notInstalled') + ' — ' + CLI_INSTALL[k]}</span>
      <button>${on ? t('disconnect') : t('connect')}</button>`;
    if (found) {
      row.querySelector('button').onclick = async () => {
        const list = enabledClis();
        settings.enabledClis = on ? list.filter(x => x !== k) : [...list, k];
        await clop.setSettings(settings);
        renderAgentList();
        renderModelSelect();
      };
    }
    box.appendChild(row);
  }
}

// ================= MCP integrations =================
const CATALOG = window.CLOP_INTEGRATIONS || [];
function mcpEnabled() {
  if (!settings.mcpEnabled || typeof settings.mcpEnabled !== 'object') settings.mcpEnabled = {};
  return settings.mcpEnabled;
}
function mcpCustom() {
  if (!Array.isArray(settings.mcpCustom)) settings.mcpCustom = [];
  return settings.mcpCustom;
}
// resolve enabled entries into the final mcpServers spec used by main.js (--mcp-config)
function rebuildMcpServers() {
  const servers = {};
  const fill = (s, env) => s.replace(/\{(\w+)\}/g, (_, k) => (k === 'PROJECTS' ? (rootDir || '') : (env[k] || '')));
  for (const [id, cfg] of Object.entries(mcpEnabled())) {
    const e = CATALOG.find(x => x.id === id);
    if (!e) continue;
    const env = (cfg && cfg.env) || {};
    if (e.kind === 'http') servers[e.id] = { type: 'http', url: fill(e.url, env) };
    else servers[e.id] = {
      command: 'npx',
      args: ['-y', e.pkg, ...(e.args || []).map(a => fill(a, env))].filter(Boolean),
      ...(Object.keys(env).length ? { env } : {})
    };
  }
  for (const c of mcpCustom()) {
    if (/^https?:\/\//i.test(c.command)) servers[c.name] = { type: 'http', url: c.command };
    else {
      const parts = c.command.trim().split(/\s+/);
      servers[c.name] = { command: parts[0], args: parts.slice(1) };
    }
  }
  settings.mcpServers = servers;
}
async function saveMcp() {
  rebuildMcpServers();
  await clop.setSettings(settings);
  renderIntegrations();
}
function renderIntegrations() {
  const box = $('intList');
  if (!box) return;
  const q = ($('intSearch').value || '').toLowerCase();
  box.innerHTML = '';
  const enabled = mcpEnabled();
  const items = CATALOG.filter(e => !q || e.name.toLowerCase().includes(q) || e.id.includes(q) || e.cat.includes(q));
  for (const e of items) {
    const on = !!enabled[e.id];
    const row = document.createElement('div');
    row.className = 'intRow' + (on ? ' connected' : '');
    row.innerHTML = `<span class="iname"></span><span class="icat"></span>${on ? `<span class="istate">●</span>` : ''}<button></button>`;
    row.querySelector('.iname').textContent = e.name;
    row.querySelector('.icat').textContent = e.cat;
    const btn = row.querySelector('button');
    btn.textContent = on ? t('disconnect') : t('connect');
    btn.onclick = async () => {
      if (on) { delete enabled[e.id]; await saveMcp(); return; }
      if (!e.env || !e.env.length) { enabled[e.id] = { env: {} }; await saveMcp(); return; }
      // needs keys: expand inline inputs
      if (row.querySelector('.intEnv')) { row.querySelector('.intEnv').remove(); return; }
      const envBox = document.createElement('div');
      envBox.className = 'intEnv';
      const inputs = {};
      for (const k of e.env) {
        const inp = document.createElement('input');
        inp.placeholder = k;
        inp.type = /KEY|TOKEN|SECRET/i.test(k) ? 'password' : 'text';
        inputs[k] = inp;
        envBox.appendChild(inp);
      }
      const ok = document.createElement('button');
      ok.textContent = t('connect');
      ok.onclick = async () => {
        const env = {};
        for (const [k, inp] of Object.entries(inputs)) { if (inp.value.trim()) env[k] = inp.value.trim(); }
        enabled[e.id] = { env };
        await saveMcp();
      };
      envBox.appendChild(ok);
      row.appendChild(envBox);
    };
    box.appendChild(row);
  }
  // custom servers
  for (const c of mcpCustom()) {
    const row = document.createElement('div');
    row.className = 'intRow connected';
    row.innerHTML = `<span class="iname"></span><span class="icat">custom</span><span class="istate">●</span><button></button>`;
    row.querySelector('.iname').textContent = c.name;
    const btn = row.querySelector('button');
    btn.textContent = t('disconnect');
    btn.onclick = async () => {
      settings.mcpCustom = mcpCustom().filter(x => x !== c);
      await saveMcp();
    };
    box.appendChild(row);
  }
}
$('intSearch').addEventListener('input', renderIntegrations);
$('intCustomAdd').onclick = async () => {
  const name = $('intCustomName').value.trim().replace(/\W/g, '_');
  const cmd = $('intCustomCmd').value.trim();
  if (!name || !cmd) return;
  mcpCustom().push({ name, command: cmd });
  $('intCustomName').value = ''; $('intCustomCmd').value = '';
  await saveMcp();
};

// ================= settings modal =================
$('settingsBtn').onclick = () => {
  $('sBaseUrl').value = settings.baseUrl || '';
  $('sApiKey').value = settings.apiKey || '';
  $('sModels').value = settings.models || settings.model || '';
  $('sLang').value = settings.lang || 'en';
  renderAgentList();
  renderIntegrations();
  $('modal').classList.add('open');
};
$('sLang').addEventListener('change', async () => {
  settings.lang = $('sLang').value;
  await clop.setSettings(settings);
  applyLang();
  renderAgentList();
  renderModelSelect();
  renderChatList();
  renderMessages();
});
$('sCancel').onclick = () => $('modal').classList.remove('open');
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').classList.remove('open'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('modal').classList.remove('open'); });
$('sSave').onclick = async () => {
  const models = $('sModels').value.trim();
  settings = {
    ...settings,
    baseUrl: $('sBaseUrl').value.trim(),
    apiKey: $('sApiKey').value.trim(),
    models,
    model: models.split(',')[0]?.trim() || '',
    lang: $('sLang').value
  };
  await clop.setSettings(settings);
  $('modal').classList.remove('open');
  applyLang();
  renderModelSelect();
};
$('updBtn').onclick = async () => {
  const st = $('updStatus');
  st.textContent = 'checking...';
  let s = '';
  try { s = String(await clop.updateCheck()); }
  catch (e) { s = 'error: ' + (e.message || e); }
  if (s === 'dev') st.textContent = t('updDev');
  else if (s.startsWith('error')) st.textContent = t('updError') + ' (' + s.slice(7, 107) + ')';
  else if (s.startsWith('available')) st.textContent = s;
  else st.textContent = t('updNone');
};

// ================= sidebar =================
$('collapseBtn').onclick = () => { $('sidebar').classList.add('hidden'); $('showSideBtn').hidden = false; };
$('showSideBtn').onclick = () => { $('sidebar').classList.remove('hidden'); $('showSideBtn').hidden = true; };
$('filesToggle').onclick = () => {
  $('idePanel').classList.toggle('hidden');
  $('filesToggle').classList.toggle('on', !$('idePanel').classList.contains('hidden'));
};

// ================= chats =================
function newChat() {
  const chat = { id: Date.now().toString(36), title: t('newChat'), messages: [] };
  chats.unshift(chat);
  activeChat = chat;
  renderChatList();
  renderMessages();
  persistChats();
}
function persistChats() { clop.setChats(chats); }
function renderChatList() {
  const list = $('chatList');
  list.innerHTML = '';
  for (const c of chats) {
    const div = document.createElement('div');
    div.className = 'chatItem' + (c === activeChat ? ' active' : '');
    div.innerHTML = `<span class="title"></span><span class="del">\u00D7</span>`;
    if (RT.get(c.id)?.busy) {
      const sp = document.createElement('span');
      sp.className = 'chatSpin';
      div.insertBefore(sp, div.firstChild);
    }
    div.querySelector('.title').textContent = c.title;
    div.onclick = () => { activeChat = c; activeArtifact = null; renderChatList(); renderMessages(); renderArtifacts(); };
    div.querySelector('.del').onclick = (e) => {
      e.stopPropagation();
      const rr = RT.get(c.id);
      if (rr?.reqId) clop.stop(rr.reqId);
      RT.delete(c.id);
      chats = chats.filter(x => x !== c);
      if (activeChat === c) activeChat = chats[0] || null;
      if (!activeChat) return newChat();
      renderChatList(); renderMessages(); persistChats();
    };
    list.appendChild(div);
  }
  $('chatName').textContent = activeChat ? activeChat.title : '';
}
function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  // detach every live stream from the DOM: nodes were just wiped, and streaming
  // output must never land in the DOM of a different chat
  for (const h of streams.values()) {
    if (h.act) { h.act.dispose(); h.act = null; }
    h.aiDiv = null;
  }
  const r = activeChat ? rt(activeChat) : null;
  const idle = !(r && (r.busy || r.queue.length));
  const visible = [];
  (activeChat?.messages || []).forEach((m, idx) => {
    const content = Array.isArray(m.content)
      ? m.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
      : m.content;
    if ((m.role === 'user' || m.role === 'assistant') && ((typeof content === 'string' && content) || m.ask)) {
      visible.push({ role: m.role, content: content || '', idx });
    }
  });
  if (!visible.length && idle) {
    box.innerHTML = `<div id="welcome"><span class="big">clop</span><span id="tWelcome">${t('welcome')}</span><br><span class="sub" id="tWelcomeSub">${t('welcomeSub')}</span></div>`;
    updateStopBtn();
    return;
  }
  for (let i = 0; i < visible.length; i++) {
    const m = visible[i];
    const orig0 = activeChat.messages[m.idx];
    const div = m.content ? addMsg(m.role === 'user' ? 'user' : 'ai', m.content, false) : null;
    if (!div) {
      if (m.role === 'assistant') {
        if (orig0?.pages?.length) renderSources(box, orig0.pages);
        if (orig0?.ask) renderAskCard(box, orig0, i === visible.length - 1 && idle);
      }
      continue;
    }
    if (m.role === 'user' && idle) {
      const btn = document.createElement('button');
      btn.className = 'msgEditBtn';
      btn.textContent = t('edit');
      btn.onclick = () => startEditMsg(div, m);
      div.appendChild(btn);
    }
    if (m.role === 'assistant') {
      const orig = activeChat.messages[m.idx];
      if (orig?.pages?.length) renderSources(box, orig.pages);
      if (orig?.ask) renderAskCard(box, orig, i === visible.length - 1 && idle);
    }
  }
  if (idle && visible.length && visible[visible.length - 1].role === 'assistant') {
    const btn = document.createElement('button');
    btn.className = 'retryBtn';
    btn.textContent = t('retry');
    btn.onclick = retryLast;
    box.appendChild(btn);
  }
  if (r) {
    // recreate the in-progress UI from chat.live and re-bind it into the stream handler
    if (r.busy && r.reqId) {
      const h = streams.get(r.reqId);
      if (h) {
        if (r.live.mode === 'cli') h.act = startActivity(r.live.t0, r.live.acts);
        const aiDiv = addMsg('ai', '', false);
        if (r.live.text) aiDiv.textContent = r.live.text;
        else aiDiv.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        h.aiDiv = aiDiv;
      }
    }
    for (const q of r.queue) {
      const shown = q.text + (q.atts.length ? '\n[' + q.atts.map(a => a.name).join(', ') + ']' : '');
      const div = addMsg('user', shown, false);
      div.classList.add('queued');
      div.title = t('queued');
    }
  }
  scrollDown();
  updateStopBtn();
}
function scrollDown() { $('messagesWrap').scrollTop = $('messagesWrap').scrollHeight; }

// ================= file tree =================
const expanded = new Set();
async function renderTree() {
  const tree = $('tree');
  tree.innerHTML = '';
  if (!rootDir) return;
  await renderLevel(rootDir, tree, 0);
}
async function renderLevel(dir, container, depth) {
  const entries = await clop.listDir(dir);
  for (const e of entries) {
    const div = document.createElement('div');
    div.className = 'node';
    if (!e.dir) {
      div.dataset.path = e.path;
      if (e.path === currentFile) div.classList.add('active');
    }
    div.style.paddingLeft = (6 + depth * 14) + 'px';
    div.innerHTML = `<span class="icon">${e.dir ? (expanded.has(e.path) ? '\u25BE' : '\u25B8') : ''}</span>`;
    div.appendChild(document.createTextNode(e.name));
    container.appendChild(div);
    if (e.dir) {
      const sub = document.createElement('div');
      container.appendChild(sub);
      div.onclick = async () => {
        if (expanded.has(e.path)) { expanded.delete(e.path); sub.innerHTML = ''; }
        else { expanded.add(e.path); await renderLevel(e.path, sub, depth + 1); }
        div.querySelector('.icon').textContent = expanded.has(e.path) ? '\u25BE' : '\u25B8';
      };
      if (expanded.has(e.path)) await renderLevel(e.path, sub, depth + 1);
    } else {
      div.onclick = () => openFile(e.path, div);
    }
  }
}
async function pickFolder() {
  const dir = await clop.openFolder();
  if (!dir) return;
  rootDir = dir;
  expanded.clear();
  renderTree();
  $('idePanel').classList.remove('hidden');
  $('filesToggle').classList.add('on');
}
$('openBtn').onclick = pickFolder;
document.addEventListener('click', (e) => { if (e.target.id === 'openBtn2') pickFolder(); });

// ================= editor =================
let openTabs = []; // {path, name}
function syncTreeActive() {
  document.querySelectorAll('.node.active').forEach(n => n.classList.remove('active'));
  if (currentFile) {
    const n = document.querySelector(`.node[data-path="${CSS.escape(currentFile)}"]`);
    if (n) n.classList.add('active');
  }
}
function renderFileTabs() {
  const box = $('fileTabs');
  box.innerHTML = '';
  $('fileName').hidden = openTabs.length > 0;
  if (!openTabs.length) {
    $('fileName').textContent = t('noFile');
    $('fileName').classList.remove('open');
  }
  for (const tab of openTabs) {
    const el = document.createElement('span');
    el.className = 'fileTab' + (tab.path === currentFile ? ' active' : '');
    el.title = tab.path;
    const n = document.createElement('span');
    n.className = 'fn'; n.textContent = tab.name;
    el.appendChild(n);
    const x = document.createElement('span');
    x.className = 'x'; x.textContent = '×';
    x.onclick = (e) => { e.stopPropagation(); closeTab(tab.path); };
    el.appendChild(x);
    el.onclick = () => { if (tab.path !== currentFile) openFile(tab.path); };
    box.appendChild(el);
  }
  const act = box.querySelector('.fileTab.active');
  if (act) act.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
async function closeTab(p) {
  const i = openTabs.findIndex(x => x.path === p);
  if (i < 0) return;
  const wasActive = currentFile === p;
  if (wasActive) await saveFile();
  openTabs.splice(i, 1);
  if (wasActive) {
    const next = openTabs[i] || openTabs[i - 1];
    if (next) return openFile(next.path);
    currentFile = null;
    $('editor').value = '';
    $('saveBtn').hidden = true;
  }
  renderFileTabs();
  syncTreeActive();
}
async function openFile(p, node) {
  try {
    if (currentFile && currentFile !== p) await saveFile(); // auto-save before switching
    const text = await clop.readFile(p);
    currentFile = p;
    $('editor').value = text;
    if (!openTabs.some(x => x.path === p)) {
      openTabs.push({ path: p, name: p.split(/[\\/]/).pop() || p });
    }
    $('saveBtn').hidden = false;
    renderFileTabs();
    syncTreeActive();
  } catch (err) {
    addMsg('err', t('openFileErr') + err.message);
  }
}
async function saveFile() {
  if (!currentFile) return;
  await clop.writeFile(currentFile, $('editor').value);
  $('saveBtn').textContent = t('saved');
  setTimeout(() => $('saveBtn').textContent = t('save'), 1200);
}
$('saveBtn').onclick = saveFile;
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveFile(); }
});

// ================= agent =================
const TOOLS = [
  { type: 'function', function: { name: 'list_dir', description: 'List files in the project folder (relative path, "" is root)', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: [] } } },
  { type: 'function', function: { name: 'read_file', description: 'Read a file by relative path', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Write a whole file by relative path', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }
];
function joinPath(rel) {
  if (!rootDir) throw new Error(t('folderNotOpen'));
  return rootDir + (rel ? '\\' + rel.replaceAll('/', '\\').replace(/^[\\]+/, '') : '');
}
async function runTool(name, args, chat) {
  if (name === 'list_dir') {
    const list = await clop.listDir(joinPath(args.path || ''));
    return list.map(e => (e.dir ? '[dir] ' : '') + e.name).join('\n') || '(empty)';
  }
  if (name === 'read_file') return await clop.readFile(joinPath(args.path));
  if (name === 'write_file') {
    const full = joinPath(args.path);
    try { await clop.artverSave(full); } catch {} // pre-write snapshot
    await clop.writeFile(full, args.content);
    if (currentFile === full) $('editor').value = args.content;
    renderTree();
    const c = chat || activeChat;
    addArtifact(full, c);
    if (c) rt(c).touched.add(full);
    return 'ok';
  }
  throw new Error(t('unknownTool') + name);
}

// ================= attachments =================
let attachments = []; // {path, name, isImage, dataUrl?}
function renderAttachRow() {
  const row = $('attachRow');
  row.innerHTML = '';
  attachments.forEach((a, i) => {
    const chip = document.createElement('span');
    chip.className = 'attChip';
    if (a.isImage && a.dataUrl) {
      const img = document.createElement('img');
      img.src = a.dataUrl;
      chip.appendChild(img);
    }
    const n = document.createElement('span');
    n.className = 'n'; n.textContent = a.name;
    chip.appendChild(n);
    const x = document.createElement('span');
    x.className = 'x'; x.textContent = '×';
    x.onclick = () => { attachments.splice(i, 1); renderAttachRow(); };
    chip.appendChild(x);
    row.appendChild(chip);
  });
}
async function addAttachmentFile(file) {
  try {
    const p = clop.getFilePath(file);
    const isImage = (file.type || '').startsWith('image/');
    let dataUrl = null;
    if (isImage) {
      const b64 = await clop.readFileB64(p);
      dataUrl = `data:${file.type};base64,${b64}`;
    }
    attachments.push({ path: p, name: file.name, isImage, mime: file.type, dataUrl });
    renderAttachRow();
  } catch (e) { addMsg('err', t('openFileErr') + (e.message || e)); }
}
async function addAttachmentBlob(blob, name) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  const p = await clop.attachSave(name, b64);
  const isImage = (blob.type || '').startsWith('image/');
  attachments.push({ path: p, name, isImage, mime: blob.type, dataUrl: isImage ? `data:${blob.type};base64,${b64}` : null });
  renderAttachRow();
}
const composerEl = $('composer');
composerEl.addEventListener('dragover', (e) => { e.preventDefault(); composerEl.classList.add('dragging'); });
composerEl.addEventListener('dragleave', () => composerEl.classList.remove('dragging'));
composerEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  composerEl.classList.remove('dragging');
  for (const f of e.dataTransfer.files) await addAttachmentFile(f);
});
$('prompt').addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.kind === 'file') {
      e.preventDefault();
      const f = it.getAsFile();
      if (!f) continue;
      let p = '';
      try { p = clop.getFilePath(f); } catch {}
      if (p) await addAttachmentFile(f);
      else await addAttachmentBlob(f, f.name && f.name !== 'image.png' ? f.name : 'pasted-' + Date.now() + (f.type === 'image/png' ? '.png' : ''));
    }
  }
});

// ================= artifacts =================
let activeArtifact = null;
function chatArtifacts() {
  if (!activeChat) return [];
  if (!Array.isArray(activeChat.artifacts)) activeChat.artifacts = [];
  return activeChat.artifacts;
}
function addArtifact(p, chat = activeChat) {
  if (!chat || !p || !/[\\/]/.test(p) || !/\.\w{1,8}$/.test(p)) return;
  if (!Array.isArray(chat.artifacts)) chat.artifacts = [];
  const arts = chat.artifacts;
  if (!arts.includes(p)) {
    arts.push(p);
    persistChats();
    if (chat !== activeChat) return; // never touch the UI of a different chat
    if (window.__artBadge) window.__artBadge.hidden = false;
    // Claude-like: first artifact opens the panel on the Artifacts tab
    if ($('idePanel').classList.contains('hidden')) {
      $('idePanel').classList.remove('hidden');
      $('filesToggle').classList.add('on');
      switchIdeTab(true);
    } else {
      renderArtifacts();
    }
  }
}
function switchIdeTab(name) {
  // backward compat: previous boolean signature (true = artifacts)
  if (typeof name === 'boolean') name = name ? 'art' : 'code';
  $('tabCode').classList.toggle('active', name === 'code');
  $('tabArt').classList.toggle('active', name === 'art');
  $('tabGit').classList.toggle('active', name === 'git');
  $('codeView').hidden = name !== 'code';
  $('artView').hidden = name !== 'art';
  $('gitView').hidden = name !== 'git';
  if (name === 'art') { if (window.__artBadge) window.__artBadge.hidden = true; renderArtifacts(); }
  if (name === 'git') refreshGit();
}
$('tabCode').onclick = () => switchIdeTab('code');
$('tabArt').onclick = () => switchIdeTab('art');
$('tabGit').onclick = () => switchIdeTab('git');
function renderArtifacts() {
  const arts = chatArtifacts();
  const list = $('artList');
  list.innerHTML = '';
  for (const p of arts) {
    const chip = document.createElement('span');
    chip.className = 'artChip' + (p === activeArtifact ? ' active' : '');
    chip.textContent = p.split(/[\\/]/).pop();
    chip.title = p;
    chip.onclick = () => previewArtifact(p);
    list.appendChild(chip);
  }
  if (!activeArtifact && arts.length) previewArtifact(arts[arts.length - 1]);
  else if (!arts.length) {
    activeArtifact = null;
    $('artVerBar').hidden = true;
    $('artPreview').innerHTML = `<div class="placeholder" id="tNoArtifacts">${t('noArtifacts')}</div>`;
  }
}
async function loadArtVersions(p) {
  const bar = $('artVerBar');
  const sel = $('artVerSel');
  let list = [];
  try { list = await clop.artverList(p); } catch {}
  sel.innerHTML = '';
  const cur = document.createElement('option');
  cur.value = 'current';
  cur.textContent = t('current');
  sel.appendChild(cur);
  for (const v of list) {
    const o = document.createElement('option');
    o.value = String(v.ts);
    o.textContent = new Date(v.ts).toLocaleString();
    sel.appendChild(o);
  }
  sel.value = 'current';
  bar.hidden = p !== activeArtifact || !list.length;
  $('artRestoreBtn').hidden = true;
}
$('artVerSel').addEventListener('change', async () => {
  const p = activeArtifact;
  if (!p) return;
  const val = $('artVerSel').value;
  $('artRestoreBtn').hidden = val === 'current';
  if (val === 'current') { previewArtifact(p); return; }
  const box = $('artPreview');
  box.innerHTML = '';
  const ext = p.split('.').pop().toLowerCase();
  try {
    const b64 = await clop.artverRead(p, Number(val));
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'].includes(ext)) {
      const img = document.createElement('img');
      img.src = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`;
      box.appendChild(img);
    } else {
      // old versions of text/html are shown as source text
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const pre = document.createElement('pre');
      pre.textContent = new TextDecoder().decode(bytes).slice(0, 200000);
      box.appendChild(pre);
    }
  } catch (e) {
    box.innerHTML = `<div class="placeholder">${t('openFileErr')}${e.message || e}</div>`;
  }
});
$('artRestoreBtn').onclick = async () => {
  const p = activeArtifact;
  const val = $('artVerSel').value;
  if (!p || val === 'current') return;
  try { await clop.artverRestore(p, Number(val)); }
  catch (e) { $('artPreview').innerHTML = `<div class="placeholder">${t('openFileErr')}${e.message || e}</div>`; return; }
  await previewArtifact(p);
  if (rootDir) renderTree();
};
async function previewArtifact(p) {
  activeArtifact = p;
  document.querySelectorAll('.artChip').forEach(c => c.classList.toggle('active', c.title === p));
  loadArtVersions(p);
  const box = $('artPreview');
  box.innerHTML = '';
  const ext = p.split('.').pop().toLowerCase();
  try {
    if (['html', 'htm', 'svg'].includes(ext)) {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.src = 'file:///' + p.replaceAll('\\', '/');
      box.appendChild(f);
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'].includes(ext)) {
      const b64 = await clop.readFileB64(p);
      const img = document.createElement('img');
      img.src = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`;
      box.appendChild(img);
    } else {
      const body = await clop.readFile(p);
      const pre = document.createElement('pre');
      pre.textContent = body.slice(0, 200000);
      box.appendChild(pre);
    }
  } catch (e) {
    box.innerHTML = `<div class="placeholder">${t('openFileErr')}${e.message || e}</div>`;
  }
}

// ================= activity block =================
function startActivity(startedAt, prefill) {
  const w = document.getElementById('welcome');
  if (w) w.remove();
  const act = document.createElement('details');
  act.className = 'activity';
  act.open = true; // expanded while running, like Claude Code; collapses on finish
  act.innerHTML = `<summary><span class="spinner"></span><span class="arrow">▶</span><span class="actTitle">${t('working')}</span><span class="actMeta">0s</span></summary><div class="actBody"></div>`;
  $('messages').appendChild(act);
  scrollDown();
  const t0 = startedAt || Date.now();
  const meta = act.querySelector('.actMeta');
  meta.textContent = Math.round((Date.now() - t0) / 1000) + 's';
  const timer = setInterval(() => { meta.textContent = Math.round((Date.now() - t0) / 1000) + 's'; }, 1000);
  let count = 0;
  let curThink = null; // growing thinking line for live thinking_delta stream
  const body = act.querySelector('.actBody');
  const title = act.querySelector('.actTitle');
  const bodyScroll = () => { body.scrollTop = body.scrollHeight; };
  const ctl = {
    el: act,
    dispose() { clearInterval(timer); },
    add(ev) {
      count++;
      if (ev.name === 'thinking' || ev.name === 'thinking_delta') {
        // live thinking streams into one growing line, like Claude Code
        if (!curThink) {
          curThink = document.createElement('div');
          curThink.className = 'actLine think';
          body.appendChild(curThink);
        }
        curThink.textContent += ev.detail;
        title.textContent = t('thinking');
        bodyScroll();
        if (act.open) scrollDown();
        return;
      }
      curThink = null; // a tool call ends the current thinking paragraph
      const line = document.createElement('div');
      line.className = 'actLine';
      const tn = document.createElement('span');
      tn.className = 'tn'; tn.textContent = ev.name + ' ';
      line.appendChild(tn);
      line.appendChild(document.createTextNode(ev.detail));
      body.appendChild(line);
      title.textContent = ev.name;
      bodyScroll();
      scrollDown();
    },
    finish(m) {
      clearInterval(timer);
      act.classList.add('done');
      act.open = false;
      const secs = Math.round(((m && m.duration_ms) || (Date.now() - t0)) / 1000);
      const tok = m && m.tokens ? ' · ' + m.tokens + ' tok' : '';
      act.querySelector('.actTitle').textContent = t('workedFor');
      meta.textContent = secs + 's' + tok;
      if (!count) act.remove();
    }
  };
  if (prefill) for (const ev of prefill) ctl.add(ev);
  return ctl;
}

function addMsg(cls, text, animateScroll = true) {
  const w = document.getElementById('welcome');
  if (w) w.remove();
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.textContent = text;
  $('messages').appendChild(div);
  if (animateScroll) scrollDown();
  return div;
}

function updateStopBtn() {
  $('stopBtn').hidden = !(activeChat && rt(activeChat).busy);
}
$('stopBtn').onclick = () => {
  if (!activeChat) return;
  const r = rt(activeChat);
  if (r.reqId) clop.stop(r.reqId);
};

function makeHandler(chat, r) {
  return {
    aiDiv: null, // bound only while this chat is the active one
    act: null,
    delta(chunk) {
      r.live.text += chunk;
      if (this.aiDiv) {
        this.aiDiv.textContent = r.live.text;
        if (chat === activeChat) scrollDown();
      }
    },
    activity(ev) {
      if (ev.name === 'thinking_delta') {
        // merge the live thinking stream so re-renders (chat switching) replay it as one entry
        const last = r.live.acts[r.live.acts.length - 1];
        if (last && last.name === 'thinking') last.detail += ev.detail;
        else r.live.acts.push({ name: 'thinking', detail: ev.detail });
      } else {
        r.live.acts.push({ name: ev.name, detail: ev.detail });
        if (/^(write|edit|multiedit|notebookedit|create)/i.test(ev.name)) {
          addArtifact(ev.detail, chat);
          if (/[\\/]/.test(ev.detail)) r.touched.add(ev.detail);
        }
        // web pages the agent viewed (WebFetch/WebSearch) — collected as sources for the answer
        if (/web|fetch|search/i.test(ev.name) && /^https?:\/\//i.test(ev.detail)) r.pages.add(ev.detail);
      }
      if (this.act) this.act.add(ev);
    }
  };
}

// ---- edit & retry ----
function startEditMsg(div, m) {
  const chat = activeChat;
  if (!chat || rt(chat).busy) return;
  div.classList.add('editing');
  div.innerHTML = '';
  const area = document.createElement('textarea');
  area.className = 'msgEditArea';
  area.value = m.content;
  const row = document.createElement('div');
  row.className = 'msgEditRow';
  const saveB = document.createElement('button');
  saveB.textContent = t('save');
  const cancelB = document.createElement('button');
  cancelB.textContent = t('cancel');
  saveB.onclick = () => {
    const val = area.value.trim();
    if (!val) return;
    // drop this user message and everything after it, then resend
    chat.messages = chat.messages.slice(0, m.idx);
    persistChats();
    renderMessages();
    send(val);
  };
  cancelB.onclick = () => renderMessages();
  row.appendChild(cancelB);
  row.appendChild(saveB);
  div.appendChild(area);
  div.appendChild(row);
  area.focus();
}
function retryLast() {
  const chat = activeChat;
  if (!chat || rt(chat).busy) return;
  let lastUser = -1;
  chat.messages.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
  if (lastUser < 0) return;
  const m = chat.messages[lastUser];
  const text = Array.isArray(m.content)
    ? m.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
    : m.content;
  // drop the last assistant reply (and trailing tool messages), keep the user message
  chat.messages = chat.messages.slice(0, lastUser + 1);
  persistChats();
  renderMessages();
  send(text, { reuseLastUser: true });
}

async function send(textArg, opts = {}) {
  const fromPrompt = typeof textArg !== 'string';
  const text = fromPrompt ? $('prompt').value.trim() : textArg;
  const atts = fromPrompt ? attachments.slice() : [];
  if (!text && !atts.length) return;
  if (!activeChat) newChat();
  const chat = activeChat;
  if (fromPrompt) {
    attachments = [];
    renderAttachRow();
    $('prompt').value = '';
    autoGrow();
  }
  const shown = text + (atts.length ? '\n[' + atts.map(a => a.name).join(', ') + ']' : '');
  const r = rt(chat);
  if (r.busy) {
    r.queue.push({ text, atts });
    const div = addMsg('user', shown);
    div.classList.add('queued');
    div.title = t('queued');
    return;
  }
  if (!opts.reuseLastUser) addMsg('user', shown);
  runChat(chat, text, atts, opts);
}

async function runChat(chat, text, atts, opts = {}) {
  const r = rt(chat);
  r.busy = true;
  if (chat === activeChat) $('messages').querySelectorAll('.retryBtn, .msgEditBtn').forEach(b => b.remove());
  renderChatList();
  updateStopBtn();
  const model = $('modelSelect').value;
  if (!model) {
    addMsg('err', t('noAIHint'));
    r.busy = false;
    renderChatList();
    updateStopBtn();
    return;
  }
  try {
    if (model.startsWith('cli:')) await runCliChat(chat, text, atts, model, opts);
    else await runApiChat(chat, text, atts, model, opts);
  } finally {
    // snapshot every artifact touched during this response
    for (const p of r.touched) { try { clop.artverSave(p); } catch {} }
    r.touched.clear();
    r.busy = false;
    r.reqId = null;
    r.live = { text: '', acts: [], mode: null, t0: 0 };
    renderChatList();
    updateStopBtn();
    persistChats();
    if (r.queue.length) {
      const next = r.queue.shift();
      if (chat === activeChat) {
        const q = $('messages').querySelector('.msg.queued');
        if (q) { q.classList.remove('queued'); q.removeAttribute('title'); }
      }
      runChat(chat, next.text, next.atts);
    } else if (chat === activeChat) {
      renderMessages(); // show edit/retry controls now that the chat is idle
    }
  }
}

// --- CLI agent path: Claude Code / Codex / Gemini run as real agents ---
// clickable list of web pages the agent viewed while answering
function renderSources(box, pages) {
  const row = document.createElement('div');
  row.className = 'sources';
  const label = document.createElement('span');
  label.className = 'srcLabel';
  label.textContent = t('pagesViewed');
  row.appendChild(label);
  for (const u of pages) {
    const chip = document.createElement('span');
    chip.className = 'srcChip';
    try { chip.textContent = new URL(u).hostname.replace(/^www\./, ''); }
    catch { chip.textContent = u.slice(0, 40); }
    chip.title = u;
    chip.onclick = () => clop.openExternal(u);
    row.appendChild(chip);
  }
  box.appendChild(row);
}

// question card: the agent asked the user to choose ([[ASK]] protocol)
function renderAskCard(box, orig, active) {
  const card = document.createElement('div');
  card.className = 'askCard' + (orig.ask.answered ? ' answered' : '');
  const q = document.createElement('div');
  q.className = 'askQ';
  q.textContent = orig.ask.question;
  card.appendChild(q);
  const opts = document.createElement('div');
  opts.className = 'askOpts';
  for (const o of orig.ask.options) {
    const b = document.createElement('button');
    b.textContent = o;
    if (orig.ask.answered === o) b.classList.add('chosen');
    b.disabled = !!orig.ask.answered || !active;
    b.onclick = () => {
      orig.ask.answered = o;
      persistChats();
      card.querySelectorAll('button').forEach(x => x.disabled = true);
      b.classList.add('chosen');
      send(o);
    };
    opts.appendChild(b);
  }
  card.appendChild(opts);
  box.appendChild(card);
}

// extract a trailing "[[ASK]] question | opt1 | opt2" line from the reply
function parseAsk(content) {
  const m = content.match(/^\[\[ASK\]\]\s*(.+)$/m);
  if (!m) return { content, ask: null };
  const parts = m[1].split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return { content: content.replace(m[0], '').trim(), ask: null };
  return {
    content: content.replace(m[0], '').trim(),
    ask: { question: parts[0], options: parts.slice(1, 5), answered: false }
  };
}

async function runCliChat(chat, text, atts, model, opts = {}) {
  const [, agent, cliModel] = model.split(':');
  const r = rt(chat);
  const cont = chat.messages.some(m => m.role === 'assistant');
  if (!chat.messages.length) {
    chat.title = (text || atts[0]?.name || '').slice(0, 40);
    renderChatList();
  }
  if (!opts.reuseLastUser) {
    const shown = text + (atts.length ? '\n[' + atts.map(a => a.name).join(', ') + ']' : '');
    chat.messages.push({ role: 'user', content: shown });
    persistChats();
  }
  let prompt = text;
  if (atts.length) prompt += '\n\nAttached files (read them from disk):\n' + atts.map(a => a.path).join('\n');
  const reqId = newReqId();
  r.reqId = reqId;
  r.live = { text: '', acts: [], mode: 'cli', t0: Date.now() };
  const handler = makeHandler(chat, r);
  streams.set(reqId, handler);
  if (chat === activeChat) {
    handler.act = startActivity(r.live.t0);
    const aiDiv = addMsg('ai', '');
    aiDiv.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    handler.aiDiv = aiDiv;
  }
  try {
    const resp = await clop.chat({ reqId, cliAgent: agent, prompt, cwd: rootDir, cont, cliModel, perm: $('permSelect').value });
    const stopped = !!(resp.meta && resp.meta.stopped);
    const raw = resp.content || r.live.text;
    const { content, ask } = parseAsk(raw);
    const pages = [...r.pages];
    r.pages.clear();
    if (handler.act) handler.act.finish(resp.meta);
    if (handler.aiDiv) {
      if (content) handler.aiDiv.textContent = content;
      else if (stopped || ask) handler.aiDiv.remove();
      else handler.aiDiv.textContent = t('emptyReply');
    }
    if (content || ask || !stopped) {
      const msg = { role: 'assistant', content };
      if (pages.length) msg.pages = pages;
      if (ask) msg.ask = ask;
      chat.messages.push(msg);
      if (chat === activeChat) {
        if (pages.length) renderSources($('messages'), pages);
        if (ask) { renderAskCard($('messages'), msg, true); scrollDown(); }
      }
    }
    if (stopped && chat === activeChat) addMsg('tool', t('stopped'));
    if (rootDir) renderTree();
  } catch (err) {
    if (handler.act) handler.act.finish(null);
    if (handler.aiDiv && !r.live.text) handler.aiDiv.remove();
    if (chat === activeChat) addMsg('err', err.message);
  } finally {
    streams.delete(reqId);
  }
}

// --- API path with tool loop ---
async function runApiChat(chat, text, atts, model, opts = {}) {
  const r = rt(chat);
  const h = chat.messages;
  if (!h.length) {
    h.push({ role: 'system', content: t('sysPrompt') + (rootDir ? t('sysFolder') + rootDir : t('sysNoFolder')) });
    chat.title = (text || atts[0]?.name || '').slice(0, 40);
    renderChatList();
  }
  if (!opts.reuseLastUser) {
    // attachments: images go as vision content, text files inlined
    let userContent = text;
    const images = atts.filter(a => a.isImage && a.dataUrl);
    const files = atts.filter(a => !a.isImage);
    for (const f of files) {
      try {
        const body = await clop.readFile(f.path);
        userContent += `\n\nFile "${f.name}":\n\`\`\`\n${body.slice(0, 30000)}\n\`\`\``;
      } catch { userContent += `\n\n[file: ${f.path}]`; }
    }
    if (images.length) {
      h.push({ role: 'user', content: [
        { type: 'text', text: userContent },
        ...images.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl } }))
      ]});
    } else {
      h.push({ role: 'user', content: userContent });
    }
    persistChats();
  }

  let handler = null;
  try {
    for (let step = 0; step < 15; step++) {
      const reqId = newReqId();
      r.reqId = reqId;
      r.live = { text: '', acts: [], mode: 'api', t0: Date.now() };
      handler = makeHandler(chat, r);
      streams.set(reqId, handler);
      if (chat === activeChat) {
        const aiDiv = addMsg('ai', '');
        aiDiv.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        handler.aiDiv = aiDiv;
      }
      let resp;
      try {
        resp = await clop.chat({
          reqId,
          messages: h,
          tools: TOOLS,
          model: model || undefined,
          reasoning: $('reasonSelect').value
        });
      } finally {
        streams.delete(reqId);
      }
      if (handler.aiDiv && !r.live.text) handler.aiDiv.remove();
      h.push({ role: 'assistant', content: resp.content || null, ...(resp.tool_calls ? { tool_calls: resp.tool_calls } : {}) });
      r.live.text = '';
      if (!resp.tool_calls) break;
      for (const tc of resp.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        if (chat === activeChat) addMsg('tool', `${tc.function.name}(${args.path ?? ''})`);
        let result;
        try { result = await runTool(tc.function.name, args, chat); }
        catch (err) { result = t('toolErr') + err.message; }
        h.push({ role: 'tool', tool_call_id: tc.id, content: String(result).slice(0, 60000) });
      }
    }
  } catch (err) {
    if (handler && handler.aiDiv && !r.live.text) handler.aiDiv.remove();
    const stopped = /STOPPED/.test(err.message || '');
    if (chat === activeChat) {
      if (stopped) addMsg('tool', t('stopped'));
      else addMsg('err', err.message);
    }
  }
}
$('sendBtn').onclick = () => send();
$('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
function autoGrow() {
  const p = $('prompt');
  p.style.height = 'auto';
  p.style.height = Math.min(p.scrollHeight, 200) + 'px';
}
$('prompt').addEventListener('input', autoGrow);
$('newChatBtn').onclick = newChat;

// ================= built-in terminal =================
let termStarted = false;
function termAppend(s) {
  const out = $('termOut');
  out.textContent += s;
  if (out.textContent.length > 200000) out.textContent = out.textContent.slice(-150000);
  out.scrollTop = out.scrollHeight;
}
clop.onTermData((s) => termAppend(s));
function toggleTerm(force) {
  const panel = $('termPanel');
  const show = typeof force === 'boolean' ? force : panel.hidden;
  panel.hidden = !show;
  $('termToggle').classList.toggle('on', show);
  if (show) {
    if (!termStarted) { termStarted = true; clop.termStart(rootDir || undefined); }
    $('termIn').focus();
  }
}
$('termToggle').onclick = () => toggleTerm();
$('termClose').onclick = () => toggleTerm(false);
$('termClear').onclick = () => { $('termOut').textContent = ''; };
$('termIn').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const cmd = $('termIn').value;
  $('termIn').value = '';
  termAppend('> ' + cmd + '\n');
  clop.termInput(cmd);
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '`') {
    e.preventDefault();
    if ($('idePanel').classList.contains('hidden')) {
      $('idePanel').classList.remove('hidden');
      $('filesToggle').classList.add('on');
    }
    toggleTerm();
  }
});

// ================= git view =================
let gitActiveFile = null;
function gitToast(text, isErr) {
  const el = $('gitToast');
  el.hidden = false;
  el.textContent = text;
  el.style.color = isErr ? 'var(--red)' : '';
  el.style.borderColor = isErr ? 'rgba(229,105,95,.35)' : '';
  el.style.background = isErr ? 'rgba(229,105,95,.1)' : '';
  clearTimeout(gitToast._t);
  gitToast._t = setTimeout(() => { el.hidden = true; }, 5000);
}
function renderGitDiff(text) {
  const box = $('gitDiff');
  box.innerHTML = '';
  for (const line of String(text || '').split('\n')) {
    const div = document.createElement('div');
    div.className = 'dl' + (line.startsWith('+') ? ' add' : line.startsWith('-') ? ' del' : line.startsWith('@@') ? ' hunk' : '');
    div.textContent = line || ' ';
    box.appendChild(div);
  }
}
async function showGitDiff(file) {
  gitActiveFile = file;
  document.querySelectorAll('.gitFile').forEach(el => el.classList.toggle('active', el.dataset.file === file));
  if (!rootDir) return;
  const r = await clop.gitDiff(rootDir, file);
  renderGitDiff(r.error ? r.error : r.diff);
}
async function refreshGit() {
  const files = $('gitFiles');
  files.innerHTML = '';
  $('gitDiff').innerHTML = '';
  $('gitBranch').textContent = '';
  if (!rootDir) {
    files.innerHTML = `<div class="placeholder">${t('treeEmpty')}</div>`;
    return;
  }
  const info = await clop.gitInfo(rootDir);
  if (info.error) {
    const ph = document.createElement('div');
    ph.className = 'placeholder';
    const sp = document.createElement('span');
    sp.textContent = t('noRepo');
    ph.appendChild(sp);
    ph.appendChild(document.createElement('br'));
    const btn = document.createElement('button');
    btn.className = 'miniBtn';
    btn.textContent = t('initRepo');
    btn.onclick = async () => {
      const r = await clop.gitInit(rootDir);
      if (r.error) gitToast(r.error, true);
      refreshGit();
    };
    ph.appendChild(btn);
    files.appendChild(ph);
    return;
  }
  $('gitBranch').textContent = info.branch || '';
  if (!info.changes.length) {
    files.innerHTML = `<div class="placeholder">${t('noChanges')}</div>`;
    return;
  }
  for (const c of info.changes) {
    const row = document.createElement('div');
    row.className = 'gitFile' + (c.file === gitActiveFile ? ' active' : '');
    row.dataset.file = c.file;
    const st = document.createElement('span');
    const s = c.status || '??';
    st.className = 'st ' + (s.includes('D') ? 'd' : s.includes('A') ? 'a' : s === '??' ? 'u' : 'm');
    st.textContent = s;
    row.appendChild(st);
    const fp = document.createElement('span');
    fp.className = 'fp'; fp.textContent = c.file;
    row.appendChild(fp);
    row.title = c.file;
    row.onclick = () => showGitDiff(c.file);
    files.appendChild(row);
  }
  if (gitActiveFile && info.changes.some(c => c.file === gitActiveFile)) showGitDiff(gitActiveFile);
}
$('gitRefresh').onclick = refreshGit;
$('gitCommitBtn').onclick = async () => {
  const msg = $('gitMsg').value.trim();
  if (!msg || !rootDir) return;
  const r = await clop.gitCommit(rootDir, msg);
  if (r.error) gitToast(r.error, true);
  else {
    $('gitMsg').value = '';
    gitToast(r.result || 'ok');
  }
  gitActiveFile = null;
  refreshGit();
};
$('gitMsg').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('gitCommitBtn').click(); });

// ================= start =================
(async () => {
  clop.version().then(v => { $('appVersion').textContent = 'clop v' + v; }).catch(() => {});
  // default workspace: all agent-created projects live here until another folder is opened
  clop.projectsRoot().then(p => {
    if (!rootDir) { rootDir = p; renderTree(); }
  }).catch(() => {});
  cliAgents = await clop.cliDetect().catch(() => ({}));
  settings = { lang: 'en', ...(await clop.getSettings()) };
  if (!settings.models && settings.model) settings.models = settings.model;
  applyLang();
  renderModelSelect();
  chats = await clop.getChats();
  if (!chats.length) newChat();
  else { activeChat = chats[0]; renderChatList(); renderMessages(); }
  // local Ollama models are detected in the background (1.5s timeout in main)
  clop.ollamaModels().then(list => {
    localModels = Array.isArray(list) ? list : [];
    if (localModels.length) renderModelSelect();
  }).catch(() => {});
})();
