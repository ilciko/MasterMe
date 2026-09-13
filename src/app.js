/* app.js – console del master */
'use strict';

/* ---------- utilità ---------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const basename = (p) => p.split('/').pop();
const stripExt = (n) => n.replace(/\.[^.]+$/, '');
const KINDS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv'],
  audio: ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'opus', 'oga'],
};
function kindOf(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  for (const k in KINDS) if (KINDS[k].includes(ext)) return k;
  return null;
}
const MOSAIC_MAX = 4; // immagini al massimo nel riquadro
const CATS = {
  personaggi: { icon: '👤', name: 'Personaggi', folders: /^(personaggi|personaggio|pg|png|characters?|npc)$/i },
  luoghi: { icon: '🏞', name: 'Luoghi', folders: /^(luoghi|luogo|locations?|sfondi|scenari|mappe|maps)$/i },
  immagini: { icon: '🖼', name: 'Altre immagini' },
  video: { icon: '🎬', name: 'Video' },
  audio: { icon: '🎵', name: 'Audio' },
};
const CAT_ORDER = ['personaggi', 'luoghi', 'immagini', 'video', 'audio'];
// Categoria di un file: per tipo, e per le immagini in base alla prima sottocartella di media/
function catOf(path, it = libItem(path)) {
  const kind = it ? it.kind : kindOf(path);
  if (kind !== 'image') return kind;
  const folders = path.replace(/^media\//, '').split('/').slice(0, -1);
  for (const f of folders) {
    if (CATS.personaggi.folders.test(f)) return 'personaggi';
    if (CATS.luoghi.folders.test(f)) return 'luoghi';
  }
  return 'immagini';
}
const ICON = { image: '🖼', video: '🎬', audio: '🎵', text: '📝', background: '🏞', frame: '🖼', title: '🏷' };

let toastTimer;
function toast(msg, ms = 2500) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function confirmDlg(text) {
  return new Promise(res => {
    const d = $('dlg-confirm');
    $('confirm-text').textContent = text;
    d.onclose = () => res(d.returnValue === 'ok');
    d.showModal();
  });
}
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- stato ---------- */
const DEFAULT_CAMPAIGN = () => ({
  name: '', presets: { sottofondo: 30, critico: 60, enfasi: 100 },
  frame: { border: '#c9a227', width: 6, size: 76, textSize: 4 },
  dim: 45, previewSeconds: 6, autoLoadScene: true,
});
const S = {
  open: false,
  campaign: DEFAULT_CAMPAIGN(),
  library: { items: {}, tags: {} },
  master: { lastSession: null, sessions: {} },
  sessions: [],           // [{name, path}]
  sessionName: null,
  doc: null,              // {title, scenes, images}
  docImageUrls: new Map(),
  sceneId: null,
  orphanId: null,         // se selezionata una scena orfana
  player: { background: null, frame: null, caption: null, black: false, dimOn: false },
  audio: { path: null, label: null, loop: false, playing: false },
  volume: 0.3,
  preset: 'sottofondo',
  adhoc: new Map(),       // key path -> File/Blob (adhoc:… e docx:<sessione>#<percorso nel docx>)
  docStamps: {},          // sessione -> marca della lettura del docx (rinnova la cache del player)
  docMeta: {},            // sessione -> Map percorso immagine -> {label, landscape, index}
  docHashes: {},          // sessione -> Map percorso immagine -> impronta del contenuto
  fileCache: new Map(),
  playerWin: null,
  previewReady: false,
  lib: { kind: 'all', tags: new Set(), q: '', sort: 'name', selection: new Set() },
  preview: null,
};

/* ---------- persistenza ---------- */
const lsKey = (what) => `master:${Platform.name()}:${what}`;
async function saveJson(file, obj) {
  const text = JSON.stringify(obj, null, 2);
  try { localStorage.setItem(lsKey(file), text); } catch {}
  try { await Platform.writeText(file, text); }
  catch (e) { console.error(e); toast('Impossibile scrivere ' + file); }
}
async function loadJson(file, fallback) {
  let text = await Platform.readText(file);
  if (text === null) { try { text = localStorage.getItem(lsKey(file)); } catch {} }
  if (!text) return fallback;
  try { return Object.assign(fallback, JSON.parse(text)); } catch { toast(file + ' non leggibile, uso i valori di default'); return fallback; }
}
const saveMaster = debounce(() => saveJson('master.json', S.master), 600);
const saveLibrary = debounce(() => saveJson('library.json', S.library), 600);
const saveCampaign = () => saveJson('campaign.json', S.campaign);

/* ---------- apertura campagna ---------- */
async function openCampaign() {
  S.open = true;
  await Platform.ensureDir('sessioni');
  await Platform.ensureDir('media');
  S.campaign = await loadJson('campaign.json', DEFAULT_CAMPAIGN());
  if (!S.campaign.name) S.campaign.name = Platform.name();
  if (!(await Platform.exists('campaign.json'))) await saveCampaign();
  S.library = await loadJson('library.json', { items: {}, tags: {} });
  S.master = await loadJson('master.json', { lastSession: null, sessions: {} });
  S.fileCache.clear();
  S.preset = 'sottofondo';
  S.volume = presetValue('sottofondo');
  $('volume-slider').value = Math.round(S.volume * 100);
  $('campaign-name').textContent = S.campaign.name;
  document.title = `Master – ${S.campaign.name}`;
  $('welcome').hidden = true;
  $('layout').hidden = false;
  $('btn-restore-folder').hidden = true;
  await scanLibrary(true);
  await loadSessions();
  renderPresets();
  toast(`Campagna «${S.campaign.name}» aperta`);
}

async function loadSessions() {
  const files = (await Platform.listDir('sessioni')).filter(f => /\.docx$/i.test(f.name) && !f.name.startsWith('~$'));
  const rootDocs = (await Platform.listDir('')).filter(f => /\.docx$/i.test(f.name) && !f.name.startsWith('~$'));
  S.sessions = [...files, ...rootDocs].sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
  const sel = $('session-select');
  sel.innerHTML = S.sessions.length ? '' : '<option value="">(nessun .docx in sessioni/)</option>';
  for (const s of S.sessions) {
    const o = document.createElement('option');
    o.value = s.path; o.textContent = stripExt(s.name);
    sel.appendChild(o);
  }
  const wanted = S.sessions.find(s => s.path === S.master.lastSession) || S.sessions[0];
  if (wanted) { sel.value = wanted.path; await selectSession(wanted.path); }
  else { S.sessionName = null; S.doc = null; renderSceneList(); renderScene(); }
}

function sessionData(name = S.sessionName) {
  if (!name) return null;
  const s = S.master.sessions[name] || (S.master.sessions[name] = { scenes: {}, notes: '', history: [], lastScene: null });
  s.scenes ||= {}; s.history ||= []; s.notes ||= '';
  return s;
}
function sceneData(id = S.sceneId, session = S.sessionName) {
  const s = sessionData(session);
  if (!s || !id) return null;
  return s.scenes[id] || (s.scenes[id] = { cues: [], notes: '' });
}

async function selectSession(path) {
  S.sessionName = path;
  $('session-select').value = path;
  S.master.lastSession = path;
  saveMaster();
  S.orphanId = null;
  for (const u of S.docImageUrls.values()) URL.revokeObjectURL(u);
  S.docImageUrls.clear();
  const file = await Platform.readFile(path);
  if (!file) { toast('Documento non trovato: ' + path); S.doc = null; renderSceneList(); renderScene(); return; }
  try {
    S.doc = await MasterDocx.parse(await file.arrayBuffer());
  } catch (e) {
    console.error(e); toast('Errore nella lettura del docx: ' + e.message, 5000);
    S.doc = { title: null, scenes: [], images: new Map(), imageMeta: new Map() };
  }
  // Le immagini del docx hanno chiavi per sessione: image5.jpg di due documenti diversi non si confondono
  S.docStamps[path] = (file.lastModified || 0) + '.' + Date.now();
  S.docMeta[path] = S.doc.imageMeta || new Map();
  for (const k of [...S.adhoc.keys()]) if (k.startsWith('docx:' + path + '#')) S.adhoc.delete(k);
  for (const [target, blob] of S.doc.images) {
    S.adhoc.set(docKey(target, path), blob);
    S.docImageUrls.set(target, URL.createObjectURL(blob));
  }
  const hashes = new Map();
  for (const [target, blob] of S.doc.images) hashes.set(target, await blobHash(blob));
  S.docHashes[path] = hashes;
  repairDocCues(path);
  const sd = sessionData();
  const first = S.doc.scenes[0];
  const want = S.doc.scenes.find(s => s.id === sd.lastScene) || first;
  renderSceneList();
  selectScene(want ? want.id : null);
  renderHistory();
  $('notes-session').value = sd.notes || '';
  if (!S.doc.scenes.length) toast('Nessun titolo trovato nel documento: usa gli stili Titolo 1/2 in Word', 5000);
}

/* ---------- scene ---------- */
function orphanIds() {
  const sd = sessionData();
  if (!sd || !S.doc) return [];
  const present = new Set(S.doc.scenes.map(s => s.id));
  return Object.keys(sd.scenes).filter(id => !present.has(id) && (sd.scenes[id].cues || []).length);
}

function renderSceneList() {
  const ul = $('scene-list');
  ul.innerHTML = '';
  const scenes = S.doc ? S.doc.scenes : [];
  $('scene-count').textContent = scenes.length ? `(${scenes.length})` : '';
  const sd = sessionData();
  scenes.forEach((sc, i) => {
    const li = document.createElement('li');
    const n = ((sd && sd.scenes[sc.id] && sd.scenes[sc.id].cues.length) || 0) + docCues(sc).length;
    li.className = (sc.level >= 2 ? 'lvl2' : '') + (sc.id === S.sceneId && !S.orphanId ? ' active' : '') + (n ? '' : ' empty');
    li.innerHTML = `<span class="n">${i + 1}</span><span class="t" title="${esc(sc.title)}">${esc(sc.title)}</span><span class="cnt">${n ? n + ' cue' : '·'}</span>`;
    li.onclick = () => selectScene(sc.id, { load: true });
    ul.appendChild(li);
  });
  for (const id of orphanIds()) {
    const li = document.createElement('li');
    li.className = 'orphan' + (S.orphanId === id ? ' active' : '');
    li.innerHTML = `<span class="n">⚠</span><span class="t">${esc(id)}</span><span class="cnt">${sd.scenes[id].cues.length} cue</span>`;
    li.onclick = () => selectOrphan(id);
    ul.appendChild(li);
  }
}

function selectScene(id, { load = false } = {}) {
  S.orphanId = null;
  S.sceneId = id;
  const sd = sessionData();
  if (sd) { sd.lastScene = id; saveMaster(); }
  renderSceneList();
  renderScene();
  if (load && S.campaign.autoLoadScene && !S.preview) loadScene();
}
// Applica le cue previste per la scena: prima cue di ogni tipo (sfondo, riquadro/video, testo, audio)
function loadScene(sc = currentScene()) {
  if (!sc) return;
  const { bg, bgInherited, fr, tx, au } = sceneAutoCues(sc);
  const hasOwn = (bg && !bgInherited) || fr || tx || au;
  // Cambio scena: riquadro e didascalia della scena precedente non sopravvivono.
  // Lo sfondo resta, a meno che la scena (o una precedente, a ritroso) ne preveda un altro.
  S.player.frame = null;
  S.player.caption = null;
  if (bg && S.player.background !== bg.src) showBackground(bg.src, cueLabel(bg));
  if (!hasOwn) {
    if (!bg) toast('La scena non ha cue previste');
    pushPlayer();
    return;
  }
  if (fr) fr.kind === 'frame' ? showFrameImages([].concat(fr.src), cueLabel(fr)) : showVideo(fr.src, { loop: fr.loop, full: fr.full, label: cueLabel(fr) });
  if (tx && (tx.style === 'caption' || !fr)) showText(tx.text, tx.style || 'card', cueLabel(tx));
  if (au && !(S.audio.playing && S.audio.path === au.src)) playAudio(au.src, { loop: au.loop, preset: au.preset, label: cueLabel(au) });
  pushPlayer();
}
function selectOrphan(id) {
  S.orphanId = id;
  renderSceneList();
  renderScene();
}
function currentScene() { return S.doc ? S.doc.scenes.find(s => s.id === S.sceneId) : null; }
function currentCueOwnerId() { return S.orphanId || S.sceneId; }

/* immagini incorporate nel docx */
const DOC_IMG_OK = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const docKey = (target, session = S.sessionName) => `docx:${session}#${target}`;
function parseDocKey(key) { const i = key.lastIndexOf('#'); return { session: key.slice(5, i), target: key.slice(i + 1) }; }
function docImageMeta(key) { const { session, target } = parseDocKey(key); return (S.docMeta[session] && S.docMeta[session].get(target)) || null; }
// Ruolo di un'immagine del documento al click: riquadro, salvo diversa scelta del master
function docImageRole(sc, target) {
  const sd = sessionData();
  const saved = sd && sd.scenes[sc.id] && sd.scenes[sc.id].docImages;
  return (saved && saved[target]) || 'frame';
}
// Didascalie del documento (Titolo 4): in basso sopra lo sfondo ('caption') o come scheda nel riquadro ('card')
const captionKey = (text) => norm(text).replace(/\s+/g, ' ').slice(0, 80);
function captionMode(sc, text) {
  const sd = sessionData();
  const saved = sd && sd.scenes[sc.id] && sd.scenes[sc.id].docCaptions;
  return (saved && saved[captionKey(text)]) || 'caption';
}
function setCaptionMode(sc, text, mode) {
  const d = sceneData(sc.id);
  d.docCaptions ||= {};
  if (mode === 'card') d.docCaptions[captionKey(text)] = 'card'; else delete d.docCaptions[captionKey(text)];
  saveMaster();
}
// Mostra la didascalia nel modo scelto; se è già visibile in quel modo la nasconde, se è visibile nell'altro la sposta
function fireDocCaption(c, mode = c.style) {
  const p = S.player;
  const inCaption = p.caption === c.text;
  const inFrame = !!p.frame && p.frame.kind === 'text' && p.frame.text === c.text;
  if ((mode === 'caption' && inCaption) || (mode === 'card' && inFrame)) {
    if (mode === 'caption') p.caption = null; else p.frame = null;
    pushPlayer();
    return;
  }
  if (inCaption) p.caption = null;
  if (inFrame) p.frame = null;
  showText(c.text, mode, c.label);
}
// Impronta del contenuto: tiene collegate le cue salvate anche se Word rinumera le immagini del documento
async function blobHash(blob) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(buf).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
  } catch { return 'size-' + blob.size; }
}
function docHashOf(key) {
  const { session, target } = parseDocKey(key);
  return S.docHashes[session] ? S.docHashes[session].get(target) : undefined;
}
// Dopo la lettura del docx: le cue salvate che puntano a un'immagine spostata vengono ricollegate tramite l'impronta
function repairDocCues(session) {
  const sd = S.master.sessions[session], hashes = S.docHashes[session];
  if (!sd || !hashes) return;
  let changed = false;
  for (const scene of Object.values(sd.scenes || {})) for (const c of scene.cues || []) {
    if (typeof c.src !== 'string' || !c.src.startsWith('docx:') || !c.docHash) continue;
    if (hashes.get(parseDocKey(c.src).target) === c.docHash) continue;
    const found = [...hashes].find(([, h]) => h === c.docHash);
    if (found) { c.src = docKey(found[0], session); changed = true; }
  }
  if (changed) saveMaster();
}
function savedSrcs(sc) {
  const sd = sessionData();
  const cues = (sd && sc && sd.scenes[sc.id] && sd.scenes[sc.id].cues) || [];
  return new Set(cues.flatMap(c => c.src ? [].concat(c.src) : []));
}
function setDocImageRole(sc, target, role) {
  const d = sceneData(sc.id);
  d.docImages ||= {};
  d.docImages[target] = role;
  saveMaster();
}
function editDocImage(sc, c) {
  const d = $('dlg-confirm');
  $('confirm-text').innerHTML = `«${esc(c.label)}»<br><span class="muted small">Come va mostrata ai giocatori quando clicchi la cue? Oppure salvala come cue della scena.</span>`;
  const row = d.querySelector('.row');
  row.innerHTML = `<button value="cancel">Annulla</button><button value="background"${c.role === 'background' ? ' class="primary"' : ''}>🏞 Sfondo</button><button value="frame"${c.role === 'frame' ? ' class="primary"' : ''}>🖼 Riquadro</button><button value="addcue" title="Salva come cue della scena: si carica con la scena">＋ Aggiungi come cue</button>`;
  d.onclose = () => {
    row.innerHTML = '<button value="cancel">Annulla</button><button value="ok" class="danger">Conferma</button>';
    if (d.returnValue === 'background' || d.returnValue === 'frame') { setDocImageRole(sc, c.target, d.returnValue); renderCues(); renderSceneList(); }
    else if (d.returnValue === 'addcue') addImageCueChoice([c.src]);
  };
  d.showModal();
}
// Cue applicate al caricamento della scena: solo quelle salvate dalla console.
// Immagini e didascalie del documento non partono mai da sole: le attiva il master con un click.
function sceneAutoCues(sc) {
  const sd = sessionData();
  const cues = (sd && sd.scenes[sc.id] && sd.scenes[sc.id].cues) || [];
  const first = (k) => cues.find(c => c.kind === k);
  const own = first('background');
  const inherited = own ? null : sceneBackground(sc);
  return { bg: own || (inherited && inherited.cue), bgInherited: !own && !!inherited, fr: first('frame') || first('video'), tx: first('text'), au: first('audio') };
}
// Sfondo della scena: la prima cue sfondo della scena, altrimenti quella delle scene precedenti, a ritroso.
// exclude: sfondo appena spento, da saltare.
function sceneBackground(sc, exclude = null) {
  if (!S.doc || !sc) return null;
  const sd = sessionData();
  const idx = S.doc.scenes.findIndex(s => s.id === sc.id);
  for (let i = idx; i >= 0; i--) {
    const s = S.doc.scenes[i];
    const cues = (sd && sd.scenes[s.id] && sd.scenes[s.id].cues) || [];
    const bg = cues.find(c => c.kind === 'background');
    if (bg && bg.src !== exclude) return { cue: bg, scene: s, inherited: i !== idx };
  }
  return null;
}
// Click su uno sfondo: lo accende; se è già acceso lo spegne e torna lo sfondo della scena, o di una precedente
function toggleBackground(path, label) {
  if (S.player.background !== path) { showBackground(path, label); return; }
  const back = sceneBackground(currentScene(), path);
  S.player.background = back ? back.cue.src : null;
  pushPlayer();
  toast(back ? `Sfondo: ${cueLabel(back.cue)}${back.inherited ? ` (da «${back.scene.title}»)` : ''}` : 'Sfondo spento', 2000);
}

function runsHtml(runs) {
  return runs.map(r => {
    let t = esc(r.text).replace(/\n/g, '<br>').replace(/\t/g, '&emsp;');
    if (r.b) t = `<b>${t}</b>`;
    if (r.i) t = `<i>${t}</i>`;
    if (r.u) t = `<u>${t}</u>`;
    return t;
  }).join('');
}
function imagesHtml(images) {
  return (images || []).map(t => {
    if (!S.docImageUrls.has(t)) return '';
    if (!DOC_IMG_OK.test(t)) return `<span class="doc-img unsupported" title="${esc(t)}">Immagine in formato ${esc(t.split('.').pop().toUpperCase())}, non visualizzabile dal browser: in Word salvala come JPG o PNG</span>`;
    return `<span class="doc-img" data-img="${esc(t)}"><img src="${S.docImageUrls.get(t)}" alt="" title="Click: mostra ai giocatori come nella cue"><span class="doc-img-acts"><button data-role="background" title="Mostra come sfondo">🏞 Sfondo</button><button data-role="frame" title="Accendi o spegni nel riquadro">🖼 Riquadro</button><button data-act="cue" title="Salva come cue della scena">＋ Cue</button></span></span>`;
  }).join('');
}
function renderScene() {
  const sc = currentScene();
  const orphan = S.orphanId;
  $('orphan-bar').hidden = !orphan;
  if (orphan) {
    $('scene-title').textContent = 'Cue senza scena: ' + orphan;
    $('scene-text').innerHTML = '<p class="empty">Questo titolo non esiste più nel documento. Le cue restano qui finché non le sposti in una scena.</p>';
    const sel = $('orphan-target');
    sel.innerHTML = (S.doc ? S.doc.scenes : []).map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');
  } else if (!sc) {
    $('scene-title').textContent = S.doc ? 'Nessuna scena' : '—';
    $('scene-text').innerHTML = S.doc ? '' : '<p class="empty">Seleziona una sessione.</p>';
  } else {
    $('scene-title').textContent = sc.title;
    let html = '';
    let inList = false, inNote = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    const closeNote = () => { closeList(); if (inNote) { html += '</div>'; inNote = false; } };
    sc.blocks.forEach((b, i) => {
      if (b.type === 'note-h') { closeNote(); html += `<div class="master-note"><div class="note-title">🔒 ${runsHtml(b.runs) || 'Note del Master'}</div>`; inNote = true; return; }
      if (b.type === 'caption') {
        closeNote();
        html += `<div class="caption-block" data-cap="${i}" title="Clicca per mostrare o nascondere il testo ai giocatori"><span class="ico">💬</span><span class="cap-text">${runsHtml(b.runs)}</span>`
          + `<span class="cap-mode" title="Dove mostrarlo"><button data-mode="caption">💬 Didascalia</button><button data-mode="card">🖼 Riquadro</button></span></div>`;
        return;
      }
      if (b.note && !inNote) { closeList(); html += '<div class="master-note"><div class="note-title">🔒 Note del Master</div>'; inNote = true; }
      if (!b.note && inNote) closeNote();
      if (b.type === 'li') {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li style="margin-left:${(b.level || 0) * 1.2}em">${runsHtml(b.runs)}${imagesHtml(b.images)}</li>`;
        return;
      }
      closeList();
      if (b.type === 'h') html += `<h4>${runsHtml(b.runs)}</h4>${imagesHtml(b.images)}`;
      else if (b.type === 'table') html += '<table>' + b.rows.map(r => '<tr>' + r.map(c => '<td>' + c.map(runsHtml).join('<br>') + '</td>').join('') + '</tr>').join('') + '</table>';
      else html += `<p>${runsHtml(b.runs)}${imagesHtml(b.images)}</p>`;
    });
    closeNote();
    $('scene-text').innerHTML = html || '<p class="empty">(scena senza testo)</p>';
    $('scene-text').scrollTop = 0;
    $$('#scene-text .doc-img[data-img]').forEach(el => {
      const t = el.dataset.img, key = docKey(t);
      el.querySelector('img').onclick = () => { const c = docCues(sc).find(x => x.target === t); if (c) fireCue(c); };
      el.querySelectorAll('[data-role]').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        if (b.dataset.role === 'background') toggleBackground(key, labelOf(key)); else toggleFrameImages(key, labelOf(key));
      });
      el.querySelector('[data-act=cue]').onclick = (e) => { e.stopPropagation(); addImageCueChoice([key]); };
    });
    $$('#scene-text .caption-block').forEach(el => {
      const cueOf = () => docCues(sc).find(c => c.kind === 'text' && c.blockIndex === +el.dataset.cap);
      el.onclick = () => { const c = cueOf(); if (c) fireDocCaption(c); };
      el.querySelectorAll('[data-mode]').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const c = cueOf();
        if (!c) return;
        setCaptionMode(sc, c.text, b.dataset.mode);
        fireDocCaption(c, b.dataset.mode);
      });
    });
  }
  const data = sceneData(currentCueOwnerId());
  $('notes-scene').value = data ? data.notes || '' : '';
  $('notes-scene-name').textContent = sc ? '· ' + sc.title : '';
  renderCues();
}

/* ---------- riferimenti ai file ---------- */
function libItem(path) { return S.library.items[path]; }
async function getFile(path) {
  if (path.startsWith('adhoc:') || path.startsWith('docx:')) return S.adhoc.get(path) || null;
  if (S.fileCache.has(path)) return S.fileCache.get(path);
  const f = await Platform.readFile(path);
  if (f) S.fileCache.set(path, f);
  return f;
}
async function ref(path) {
  const file = await getFile(path);
  if (!file) { toast('File non trovato: ' + basename(path)); return null; }
  const it = libItem(path);
  const stamp = path.startsWith('docx:') ? S.docStamps[parseDocKey(path).session] : (it ? it.mtime : file.lastModified || 0);
  return { key: path + '|' + stamp, file };
}
function labelOf(path) {
  if (path.startsWith('docx:')) {
    const m = docImageMeta(path);
    return (m && m.label) || (m ? `Immagine ${m.index} del documento` : 'Immagine del documento');
  }
  const it = libItem(path);
  if (it && it.label) return it.label;
  return stripExt(basename(path.replace(/^(adhoc|docx):/, '')));
}
function touchUsed(paths) {
  for (const p of [].concat(paths)) { const it = libItem(p); if (it) it.used = Date.now(); }
  saveLibrary();
}

/* ---------- player ---------- */
let pushSeq = 0;
function themeOf() {
  const f = S.campaign.frame || {};
  return { border: f.border, width: f.width, size: f.size, textSize: f.textSize };
}
async function buildPlayerState() {
  const p = S.player;
  const st = { theme: themeOf(), black: p.black, dim: p.dimOn ? (S.campaign.dim || 0) / 100 : 0, caption: p.caption, background: null, frame: null };
  if (p.background) st.background = await ref(p.background);
  if (p.frame) {
    const f = p.frame;
    if (f.kind === 'text') st.frame = { kind: 'text', text: f.text, style: f.style === 'title' ? 'title' : null };
    else {
      const items = (await Promise.all(f.srcs.map(ref))).filter(Boolean);
      if (items.length) st.frame = { kind: f.kind, items, loop: !!f.loop, full: !!f.full };
    }
  }
  return st;
}
async function pushPlayer() {
  const seq = ++pushSeq;
  const st = await buildPlayerState();
  if (seq !== pushSeq) return;
  const localOnly = S.preview && S.preview.local;
  try { if (S.previewReady) $('preview').contentWindow.player.apply(st, { muted: true }); } catch (e) { console.warn(e); }
  if (!localOnly && S.playerWin && !S.playerWin.closed && S.playerWin.player) {
    try { S.playerWin.player.apply(st, { muted: false }); } catch (e) { console.warn(e); }
  }
  renderCues();
}

function addHistory(entry) {
  if (S.preview) return;
  const sd = sessionData();
  if (!sd) return;
  sd.history.unshift({ ...entry, at: Date.now() });
  if (sd.history.length > 150) sd.history.length = 150;
  saveMaster();
  renderHistory();
}

function showBackground(path, label) {
  S.player.background = path;
  S.player.black = false;
  pushPlayer();
  addHistory({ kind: 'background', src: path, label: label || labelOf(path) });
  touchUsed(path);
}
function showFrameImages(paths, label) {
  paths = paths.slice(0, MOSAIC_MAX);
  S.player.frame = { kind: 'images', srcs: paths };
  S.player.black = false;
  pushPlayer();
  addHistory({ kind: 'frame', src: paths, label: label || paths.map(labelOf).join(' + ') });
  touchUsed(paths);
}
// Accende o spegne una o più immagini nel mosaico, lasciando accese le altre.
function toggleFrameImages(paths, label) {
  paths = [].concat(paths);
  const f = S.player.frame;
  const cur = f && f.kind === 'images' ? [...f.srcs] : [];
  const allIn = paths.every(p => cur.includes(p));
  let next;
  if (allIn) next = cur.filter(p => !paths.includes(p));
  else {
    const add = paths.filter(p => !cur.includes(p));
    if (cur.length + add.length > MOSAIC_MAX) { toast(`Il mosaico ha al massimo ${MOSAIC_MAX} immagini: spegnine una prima`, 3500); return; }
    next = [...cur, ...add];
  }
  if (!next.length) { closeFrame(); return; }
  S.player.frame = { kind: 'images', srcs: next };
  S.player.black = false;
  pushPlayer();
  if (!allIn) {
    addHistory({ kind: 'frame', src: next, label: next.length === paths.length && label ? label : next.map(labelOf).join(' + ') });
    touchUsed(paths);
  }
}
function showVideo(path, { loop = false, full = false, label } = {}) {
  S.player.frame = { kind: 'video', srcs: [path], loop, full };
  S.player.black = false;
  pushPlayer();
  addHistory({ kind: 'video', src: path, label: label || labelOf(path), loop, full });
  touchUsed(path);
}
function showText(text, style = 'card', label) {
  if (style === 'caption') S.player.caption = text;
  else S.player.frame = { kind: 'text', text, style };
  S.player.black = false;
  pushPlayer();
  addHistory({ kind: 'text', text, style, label: label || text.slice(0, 40) });
}
function closeFrame() { S.player.frame = null; pushPlayer(); }
function hideCaption() { S.player.caption = null; pushPlayer(); }
function toggleBlack(force) { S.player.black = force ?? !S.player.black; pushPlayer(); $('btn-black').classList.toggle('active', S.player.black); }
function toggleDim() { S.player.dimOn = !S.player.dimOn; pushPlayer(); $('btn-dim').classList.toggle('active', S.player.dimOn); }
function showSceneTitle() { const sc = currentScene(); if (sc) showText(sc.title, 'title', 'Titolo: ' + sc.title); }

/* ---------- audio ---------- */
const AUDIO = new Audio();
AUDIO.addEventListener('ended', () => { if (!AUDIO.loop) { S.audio.playing = false; renderNowPlaying(); renderCues(); } });
let fadeTimer = null;
function presetValue(name) { return ((S.campaign.presets || {})[name] ?? 30) / 100; }
function fadeTo(target, ms, then) {
  clearInterval(fadeTimer);
  const start = AUDIO.volume, t0 = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    AUDIO.volume = start + (target - start) * k;
    if (k >= 1) { clearInterval(fadeTimer); then && then(); }
  }, 40);
}
async function playAudio(path, { loop = false, preset, label } = {}) {
  if (S.audio.path === path && S.audio.playing) { stopAudio(); return; }
  const file = await getFile(path);
  if (!file) { toast('Audio non trovato: ' + basename(path)); return; }
  if (preset && S.campaign.presets[preset] != null) setPreset(preset, true);
  const start = () => {
    if (AUDIO.src) URL.revokeObjectURL(AUDIO.src);
    AUDIO.src = URL.createObjectURL(file);
    AUDIO.loop = loop;
    AUDIO.volume = S.preview && S.preview.muted ? 0 : S.volume;
    AUDIO.play().catch(e => toast('Audio bloccato: ' + e.message));
    S.audio = { path, label: label || labelOf(path), loop, playing: true };
    renderNowPlaying(); renderCues();
  };
  if (S.audio.playing) fadeTo(0, 350, start); else start();
  addHistory({ kind: 'audio', src: path, label: label || labelOf(path), loop, preset });
  touchUsed(path);
}
function stopAudio() {
  if (!S.audio.playing) return;
  fadeTo(0, 300, () => { AUDIO.pause(); S.audio.playing = false; renderNowPlaying(); renderCues(); });
}
function setPreset(name, silent) {
  S.preset = name;
  S.volume = presetValue(name);
  $('volume-slider').value = Math.round(S.volume * 100);
  if (S.audio.playing && !(S.preview && S.preview.muted)) fadeTo(S.volume, 900);
  renderPresets();
  if (!silent) toast(`Volume: ${name} (${Math.round(S.volume * 100)}%)`, 1200);
}
function setVolume(v) {
  S.volume = v;
  S.preset = null;
  if (!(S.preview && S.preview.muted)) { clearInterval(fadeTimer); AUDIO.volume = v; }
  renderPresets();
}
function renderPresets() {
  $$('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === S.preset);
    b.textContent = `${{ sottofondo: 'Sottofondo', critico: 'Critico', enfasi: 'Enfasi' }[b.dataset.preset]} ${S.campaign.presets[b.dataset.preset]}%`;
  });
}
function renderNowPlaying() {
  $('now-playing').textContent = S.audio.playing ? `▶ ${S.audio.label}${S.audio.loop ? ' (loop)' : ''}` : 'Nessun audio';
}

/* ---------- cue ---------- */
function cueIsActive(c) {
  const p = S.player;
  switch (c.kind) {
    case 'background': return p.background === c.src;
    case 'frame': return !!p.frame && p.frame.kind === 'images' && [].concat(c.src).every(x => p.frame.srcs.includes(x));
    case 'video': return !!p.frame && p.frame.kind === 'video' && p.frame.srcs[0] === c.src;
    case 'text': return c.style === 'caption' ? p.caption === c.text : (!!p.frame && p.frame.kind === 'text' && p.frame.text === c.text);
    case 'audio': return S.audio.playing && S.audio.path === c.src;
    case 'docimage': return c.role === 'background' ? p.background === c.src : (!!p.frame && p.frame.kind === 'images' && p.frame.srcs.includes(c.src));
  }
  return false;
}
function cueMissing(c) {
  const srcs = c.kind === 'text' ? [] : [].concat(c.src);
  return srcs.some(s => {
    if (s.startsWith('docx:')) return !!S.docHashes[parseDocKey(s).session] && !S.adhoc.has(s);
    const it = libItem(s);
    return it ? !!it.missing : false;
  });
}
function cueLabel(c) {
  if (c.label) return c.label;
  if (c.kind === 'text') return c.text.slice(0, 40);
  return [].concat(c.src).map(labelOf).join(' + ');
}
function fireCue(c) {
  switch (c.kind) {
    case 'background': toggleBackground(c.src, cueLabel(c)); break;
    case 'frame': toggleFrameImages(c.src, cueLabel(c)); break;
    case 'video': if (cueIsActive(c)) closeFrame(); else showVideo(c.src, { loop: c.loop, full: c.full, label: cueLabel(c) }); break;
    case 'text':
      if (cueIsActive(c)) { c.style === 'caption' ? hideCaption() : closeFrame(); }
      else showText(c.text, c.style || 'card', cueLabel(c));
      break;
    case 'audio': playAudio(c.src, { loop: c.loop, preset: c.preset, label: cueLabel(c) }); break;
    case 'docimage': if (c.role === 'background') toggleBackground(c.src, c.label); else toggleFrameImages(c.src, c.label); break;
  }
}
function addCue(cue, ownerId = currentCueOwnerId()) {
  const data = sceneData(ownerId);
  if (!data) { toast('Seleziona prima una scena'); return null; }
  cue.id ||= uid();
  if (typeof cue.src === 'string' && cue.src.startsWith('docx:') && !cue.docHash) {
    const h = docHashOf(cue.src);
    if (h) cue.docHash = h;
  }
  data.cues.push(cue);
  if (!cue.temp) saveMaster();
  renderCues(); renderSceneList();
  return cue;
}
// Didascalie definite nel docx (Titolo 4): cue virtuali, non salvate in master.json
// Cue che vengono dal documento, nell'ordine del testo: didascalie (Titolo 4) e immagini incorporate. Non sono salvate in master.json.
function docCues(sc = currentScene()) {
  if (!sc) return [];
  const out = [], seen = new Set(), saved = savedSrcs(sc);
  sc.blocks.forEach((b, i) => {
    if (b.type === 'caption') {
      const firstLine = b.text.split('\n')[0];
      const more = firstLine.length > 40 || b.text.includes('\n');
      out.push({ id: 'doc-' + sc.id + '-' + i, kind: 'text', style: captionMode(sc, b.text), text: b.text, label: firstLine.slice(0, 40) + (more ? '…' : ''), doc: true, blockIndex: i });
    }
    for (const t of b.images || []) {
      if (seen.has(t) || !S.docImageUrls.has(t) || !DOC_IMG_OK.test(t) || saved.has(docKey(t))) continue;
      seen.add(t);
      const src = docKey(t);
      out.push({ id: 'docimg-' + sc.id + '-' + t, kind: 'docimage', role: docImageRole(sc, t), src, target: t, label: labelOf(src), doc: true });
    }
  });
  return out;
}
function renderCues() {
  const wrap = $('cue-list');
  wrap.innerHTML = '';
  const data = sceneData(currentCueOwnerId());
  if (!data) return;
  const sc = S.orphanId ? null : currentScene();
  for (const c of docCues(sc)) {
    const el = document.createElement('div');
    el.className = 'cue doc' + (cueIsActive(c) ? ' active' : '');
    if (c.kind === 'docimage') {
      el.title = `${c.label}\nImmagine dal documento. Click: ${c.role === 'background' ? 'sfondo' : 'riquadro'}. Tasto destro o ✎ per cambiare.`;
      el.innerHTML = `<span class="ico">${c.role === 'background' ? '🏞' : '🖼'}</span><span class="lbl">${esc(c.label)}</span><button class="edit" title="Sfondo o riquadro">✎</button>`;
      el.onclick = (e) => { if (e.target.classList.contains('edit')) editDocImage(sc, c); else fireCue(c); };
      el.oncontextmenu = (e) => { e.preventDefault(); editDocImage(sc, c); };
    } else {
      el.title = `${c.text}\nTesto dal documento, mostrato ${c.style === 'card' ? 'nel riquadro' : 'come didascalia'}. Tasto destro per cambiare.`;
      el.innerHTML = `<span class="ico">${c.style === 'card' ? '🖼' : '💬'}</span><span class="lbl">${esc(c.label)}</span>`;
      el.onclick = () => fireDocCaption(c);
      el.oncontextmenu = (e) => {
        e.preventDefault();
        const mode = c.style === 'card' ? 'caption' : 'card';
        setCaptionMode(sc, c.text, mode);
        renderCues();
        toast(mode === 'card' ? 'Verrà mostrato nel riquadro' : 'Verrà mostrato come didascalia', 1500);
      };
    }
    wrap.appendChild(el);
  }
  $$('#scene-text .doc-img[data-img]').forEach(el => {
    const key = docKey(el.dataset.img), p = S.player;
    el.classList.toggle('active', p.background === key || (!!p.frame && p.frame.kind === 'images' && p.frame.srcs.includes(key)));
    el.classList.toggle('saved', savedSrcs(sc).has(key));
  });
  $$('#scene-text .caption-block').forEach(el => {
    const c = docCues(sc).find(x => x.kind === 'text' && x.blockIndex === +el.dataset.cap);
    if (!c) return;
    const p = S.player;
    el.classList.toggle('active', p.caption === c.text || (!!p.frame && p.frame.kind === 'text' && p.frame.text === c.text));
    el.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === c.style));
  });
  data.cues.forEach((c, idx) => {
    const el = document.createElement('div');
    el.className = 'cue' + (cueIsActive(c) ? ' active' : '') + (c.temp ? ' temp' : '') + (cueMissing(c) ? ' missing' : '');
    el.draggable = true;
    el.title = c.kind === 'text' ? c.text : [].concat(c.src).join('\n');
    const ico = c.kind === 'text' ? (c.style === 'caption' ? '💬' : c.style === 'title' ? '🏷' : '📝') : ICON[c.kind];
    el.innerHTML = `<span class="ico">${ico}</span><span class="lbl">${esc(cueLabel(c))}</span><button class="edit" title="Modifica">✎</button>`;
    el.onclick = (e) => { if (e.target.classList.contains('edit')) editCue(c); else fireCue(c); };
    el.oncontextmenu = (e) => { e.preventDefault(); editCue(c); };
    el.ondragstart = (e) => { e.dataTransfer.setData('text/cue', String(idx)); e.dataTransfer.effectAllowed = 'move'; };
    el.ondragover = (e) => { if (e.dataTransfer.types.includes('text/cue')) { e.preventDefault(); el.classList.add('dragover'); } };
    el.ondragleave = () => el.classList.remove('dragover');
    el.ondrop = (e) => {
      e.preventDefault(); el.classList.remove('dragover');
      const from = parseInt(e.dataTransfer.getData('text/cue'), 10);
      if (Number.isNaN(from) || from === idx) return;
      const [m] = data.cues.splice(from, 1);
      data.cues.splice(idx, 0, m);
      saveMaster(); renderCues();
    };
    wrap.appendChild(el);
  });
  if (!data.cues.length && !docCues(sc).length) wrap.innerHTML = '<span class="muted small">Nessuna cue: aggiungila dalla libreria, come testo o con un file al volo.</span>';
}
function editCue(c) {
  const d = $('dlg-cue');
  $('cue-label').value = c.label || '';
  $('cue-row-preset').hidden = c.kind !== 'audio';
  $('cue-row-loop').hidden = !(c.kind === 'audio' || c.kind === 'video');
  $('cue-row-full').hidden = c.kind !== 'video';
  $('cue-row-text').hidden = c.kind !== 'text';
  $('cue-row-style').hidden = c.kind !== 'text';
  $('cue-preset').value = c.preset || 'sottofondo';
  $('cue-loop').checked = !!c.loop;
  $('cue-full').checked = !!c.full;
  $('cue-text').value = c.text || '';
  $('cue-style').value = c.style || 'card';
  $('btn-cue-import').hidden = !(c.temp && Platform.canWrite());
  d.onclose = async () => {
    const data = sceneData(currentCueOwnerId());
    if (d.returnValue === 'import') { importAdhocToLibrary(c); return; }
    if (d.returnValue === 'delete') {
      if (await confirmDlg(`Eliminare la cue «${cueLabel(c)}»?`)) { data.cues = data.cues.filter(x => x !== c); saveMaster(); renderCues(); renderSceneList(); }
    } else if (d.returnValue === 'ok') {
      c.label = $('cue-label').value.trim() || undefined;
      if (c.kind === 'audio') { c.preset = $('cue-preset').value; c.loop = $('cue-loop').checked; }
      if (c.kind === 'video') { c.loop = $('cue-loop').checked; c.full = $('cue-full').checked; }
      if (c.kind === 'text') { c.text = $('cue-text').value; c.style = $('cue-style').value; }
      saveMaster(); renderCues();
    }
  };
  d.showModal();
}
function openTextDialog() {
  const d = $('dlg-text');
  $('text-label').value = ''; $('text-body').value = ''; $('text-style').value = 'card';
  d.onclose = () => {
    const text = $('text-body').value.trim();
    if (!text || d.returnValue === 'cancel') return;
    const style = $('text-style').value, label = $('text-label').value.trim() || undefined;
    if (d.returnValue === 'show') showText(text, style, label);
    else addCue({ kind: 'text', text, style, label });
  };
  d.showModal();
}

/* ---------- storico ---------- */
function renderHistory() {
  const sd = sessionData();
  const list = $('history-list');
  list.innerHTML = '';
  if (!sd || !sd.history.length) { list.innerHTML = '<span class="muted small">Ancora nulla.</span>'; return; }
  for (const h of sd.history) {
    const el = document.createElement('div');
    el.className = 'hist';
    const ico = h.kind === 'text' ? '📝' : ICON[h.kind];
    el.innerHTML = `<span class="when">${fmtTime(h.at)}</span><span class="ico">${ico}</span><span class="lbl">${esc(h.label)}</span>`;
    el.title = 'Mostra di nuovo';
    el.onclick = () => replayHistory(h);
    list.appendChild(el);
  }
}
function replayHistory(h) {
  switch (h.kind) {
    case 'background': showBackground(h.src, h.label); break;
    case 'frame': showFrameImages([].concat(h.src), h.label); break;
    case 'video': showVideo(h.src, { loop: h.loop, full: h.full, label: h.label }); break;
    case 'text': showText(h.text, h.style, h.label); break;
    case 'audio': playAudio(h.src, { loop: h.loop, preset: h.preset, label: h.label }); break;
  }
}

/* ---------- file al volo ---------- */
async function handleAdhocFiles(files, { show = true } = {}) {
  const list = Array.from(files).filter(f => kindOf(f.name));
  if (!list.length) { toast('Nessun file immagine/video/audio'); return; }
  const imgs = [];
  for (const f of list) {
    const key = 'adhoc:' + f.name;
    S.adhoc.set(key, f);
    const kind = kindOf(f.name);
    const label = stripExt(f.name);
    if (kind === 'image') { imgs.push(key); addCue({ kind: 'frame', src: key, label, temp: true }); }
    else if (kind === 'video') { addCue({ kind: 'video', src: key, label, temp: true }); if (show) showVideo(key, { label }); }
    else { addCue({ kind: 'audio', src: key, label, temp: true, preset: S.preset || 'sottofondo' }); if (show) playAudio(key, { label }); }
  }
  if (show && imgs.length) showFrameImages(imgs.slice(0, MOSAIC_MAX));
  if (Platform.canWrite()) toast('File caricati al volo (cue tratteggiate, non salvate). Per tenerli: importali in libreria con ✎.', 4000);
}
async function importAdhocToLibrary(cue) {
  const paths = [].concat(cue.src);
  const newPaths = [];
  for (const p of paths) {
    if (!p.startsWith('adhoc:')) { newPaths.push(p); continue; }
    const f = S.adhoc.get(p);
    const dest = 'media/importati/' + f.name;
    await Platform.ensureDir('media/importati');
    await Platform.writeBlob(dest, f);
    newPaths.push(dest);
  }
  cue.src = Array.isArray(cue.src) ? newPaths : newPaths[0];
  delete cue.temp;
  saveMaster();
  await scanLibrary();
  renderCues();
  toast('Importato in media/importati/');
}

/* ---------- libreria ---------- */
async function scanLibrary(silent) {
  const found = await Platform.listFiles('media');
  const items = S.library.items;
  const seen = new Set();
  let added = 0;
  for (const f of found) {
    const kind = kindOf(f.name);
    if (!kind) continue;
    seen.add(f.path);
    let it = items[f.path];
    if (!it) {
      // file spostato? stesso nome e dimensione tra i mancanti
      const movedKey = Object.keys(items).find(k => items[k].missing && basename(k) === f.name && items[k].size === f.size);
      if (movedKey) { it = items[movedKey]; delete items[movedKey]; items[f.path] = it; }
      else { it = items[f.path] = { kind, label: '', tags: [], added: Date.now(), isNew: true }; added++; }
    }
    if (it.mtime && it.mtime !== f.mtime) S.fileCache.delete(f.path);
    it.kind = kind; it.size = f.size; it.mtime = f.mtime; it.missing = false;
    it.tags ||= [];
  }
  for (const k in items) if (!seen.has(k)) items[k].missing = true;
  for (const t of new Set(Object.values(items).flatMap(i => i.tags))) S.library.tags[t] ||= {};
  saveLibrary();
  renderLibrary();
  if (!silent) toast(added ? `${added} nuovi file in libreria` : 'Libreria aggiornata');
}
function libFiltered() {
  const { kind, tags, q, sort } = S.lib;
  const nq = norm(q);
  let list = Object.entries(S.library.items).map(([path, it]) => ({ path, ...it }));
  if (kind !== 'all') list = list.filter(i => catOf(i.path, i) === kind);
  for (const t of tags) list = list.filter(i => i.tags.includes(t));
  if (nq) list = list.filter(i => norm(i.label + ' ' + basename(i.path)).includes(nq));
  const cmp = {
    name: (a, b) => labelOf(a.path).localeCompare(labelOf(b.path), 'it', { numeric: true }),
    mtime: (a, b) => (b.mtime || 0) - (a.mtime || 0),
    used: (a, b) => (b.used || 0) - (a.used || 0),
    new: (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || (b.added || 0) - (a.added || 0),
  }[sort];
  return list.sort(cmp);
}
function renderLibrary() {
  const items = S.library.items;
  const all = Object.entries(items).map(([path, it]) => ({ path, ...it }));
  const untagged = all.filter(i => !i.missing && !i.tags.length).length;
  const missing = all.filter(i => i.missing).length;
  $('lib-badge').hidden = !untagged;
  $('lib-badge').textContent = untagged;
  // chip dei tag: solo quelli presenti nel tipo selezionato
  const counts = {};
  for (const i of all) {
    if (i.missing) continue;
    if (S.lib.kind !== 'all' && catOf(i.path, i) !== S.lib.kind) continue;
    for (const t of i.tags) counts[t] = (counts[t] || 0) + 1;
  }
  const chips = $('lib-tags');
  chips.innerHTML = '';
  for (const t of Object.keys(counts).sort((a, b) => a.localeCompare(b, 'it'))) {
    const c = document.createElement('span');
    c.className = 'chip' + (S.lib.tags.has(t) ? ' on' : '');
    const color = (S.library.tags[t] || {}).color;
    if (color && !S.lib.tags.has(t)) c.style.borderColor = color;
    c.innerHTML = `${esc(t)} <span class="cnt">${counts[t]}</span>`;
    c.onclick = () => { S.lib.tags.has(t) ? S.lib.tags.delete(t) : S.lib.tags.add(t); renderLibrary(); };
    chips.appendChild(c);
  }
  for (const t of S.lib.tags) if (!counts[t]) S.lib.tags.delete(t);
  const list = libFiltered();
  $('lib-status').textContent = `${list.length} di ${all.length - missing} file` + (untagged ? ` · ${untagged} da taggare` : '') + (missing ? ` · ${missing} mancanti` : '');
  renderDatalist();
  $$('.kind-btn[data-kind=immagini]').forEach(b => b.hidden = !all.some(i => !i.missing && catOf(i.path, i) === 'immagini'));
  const grid = $('lib-grid');
  grid.innerHTML = '';
  for (const cat of CAT_ORDER) {
    const items = list.filter(i => catOf(i.path, i) === cat);
    if (!items.length) continue;
    const collapsed = localStorage.getItem('master:libcat:' + cat) === '1' && S.lib.kind === 'all' && !S.lib.q;
    const head = document.createElement('div');
    head.className = 'lib-section' + (collapsed ? ' collapsed' : '');
    head.innerHTML = `<span class="arrow">${collapsed ? '▸' : '▾'}</span><span class="ico">${CATS[cat].icon}</span><span>${CATS[cat].name}</span><span class="cnt">${items.length}</span>`;
    head.onclick = () => { localStorage.setItem('master:libcat:' + cat, collapsed ? '0' : '1'); renderLibrary(); };
    grid.appendChild(head);
    if (collapsed) continue;
    for (const it of items) grid.appendChild(libCard(it));
  }
  renderSelbar();
}
function renderDatalist() {
  $('tag-datalist').innerHTML = Object.keys(S.library.tags).sort().map(t => `<option value="${esc(t)}">`).join('');
}
function libCard(it) {
  const el = document.createElement('div');
  const sel = S.lib.selection.has(it.path);
  const isNew = it.isNew && !it.tags.length;
  el.className = 'lib-row' + (sel ? ' selected' : '') + (isNew ? ' new' : '') + (it.missing ? ' missing' : '');
  const label = labelOf(it.path);
  const cat = catOf(it.path, it);
  const bgBtn = `<button data-act="bg" title="Mostra come sfondo">🏞 Sfondo</button>`, frBtn = `<button data-act="frame" title="Mostra nel riquadro">🖼 Riquadro</button>`;
  const acts = it.kind === 'image'
    ? (cat === 'personaggi' ? frBtn + bgBtn : bgBtn + frBtn) + `<button data-act="cue" title="Aggiungi come cue alla scena">＋ cue scena</button>`
    : it.kind === 'video'
      ? `<button data-act="play" title="Riproduci nel riquadro">▶ Riproduci</button><button data-act="cue" title="Aggiungi come cue">＋ cue scena</button>`
      : `<button data-act="play" title="Suona">▶ Suona</button><button data-act="cue" title="Aggiungi come cue">＋ cue scena</button>`;
  const tagChips = it.tags.map(t => {
    const color = (S.library.tags[t] || {}).color;
    return `<span class="chip"${color ? ` style="border-color:${esc(color)}"` : ''}>${esc(t)}</span>`;
  }).join('');
  el.innerHTML = `<input type="checkbox" class="sel" ${sel ? 'checked' : ''} title="Seleziona">
    <div class="thumb" title="${esc(it.path)}">${ICON[it.kind]}</div>
    <div class="info">
      <div class="name" title="${esc(label)}">${esc(label)}<button class="ed" title="Etichetta e tag">✎</button></div>
      <div class="path">${esc(it.path.replace(/^media\//, ''))}${it.missing ? ' · <b>mancante</b>' : ''}</div>
      <div class="tags">${isNew ? '<span class="flag">nuovo</span>' : ''}${tagChips || (isNew ? '' : '<i>senza tag</i>')}</div>
    </div>
    <div class="acts">${acts}</div>`;
  el.querySelector('.sel').onchange = (e) => { e.target.checked ? S.lib.selection.add(it.path) : S.lib.selection.delete(it.path); el.classList.toggle('selected', e.target.checked); renderSelbar(); };
  el.querySelector('.ed').onclick = () => editItem(it.path);
  el.querySelector('.thumb').onclick = () => { if (it.kind === 'image') showFrameImages([it.path]); else if (it.kind === 'video') showVideo(it.path); else playAudio(it.path); };
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => libAction(b.dataset.act, it));
  const th = el.querySelector('.thumb');
  if (it.kind !== 'audio' && !it.missing) { th.dataset.path = it.path; thumbObserver.observe(th); }
  return el;
}
function libAction(act, it) {
  if (act === 'bg') toggleBackground(it.path);
  else if (act === 'frame') showFrameImages([it.path]);
  else if (act === 'play') it.kind === 'video' ? showVideo(it.path) : playAudio(it.path);
  else if (act === 'cue') {
    if (it.kind === 'image') addImageCueChoice([it.path]);
    else if (it.kind === 'video') addCue({ kind: 'video', src: it.path }) && toast('Cue video aggiunta');
    else addCue({ kind: 'audio', src: it.path, preset: 'sottofondo', loop: true }) && toast('Cue audio aggiunta (loop, sottofondo)');
  }
}
function addImageCueChoice(paths) {
  if (paths.length > 1) { addCue({ kind: 'frame', src: paths }) && toast('Cue riquadro (mosaico) aggiunta'); return; }
  const d = $('dlg-confirm');
  $('confirm-text').innerHTML = `Aggiungere «${esc(labelOf(paths[0]))}» alla scena come:`;
  const row = d.querySelector('.row');
  row.innerHTML = '<button value="cancel">Annulla</button><button value="bg">🏞 Sfondo</button><button value="frame" class="primary">🖼 Riquadro</button>';
  d.onclose = () => {
    row.innerHTML = '<button value="cancel">Annulla</button><button value="ok" class="danger">Conferma</button>';
    if (d.returnValue === 'bg') addCue({ kind: 'background', src: paths[0] }) && toast('Cue sfondo aggiunta');
    else if (d.returnValue === 'frame') addCue({ kind: 'frame', src: paths[0] }) && toast('Cue riquadro aggiunta');
  };
  d.showModal();
}
function renderSelbar() {
  const n = S.lib.selection.size;
  $('lib-selbar').hidden = !n;
  $('sel-count').textContent = `${n} selezionati`;
  const imgs = [...S.lib.selection].filter(p => libItem(p) && libItem(p).kind === 'image');
  $('btn-sel-frame').disabled = !(imgs.length >= 1 && imgs.length <= MOSAIC_MAX);
  $('btn-sel-cue-frame').disabled = !(imgs.length >= 1 && imgs.length <= MOSAIC_MAX);
}
function selectedImages() { return [...S.lib.selection].filter(p => libItem(p) && libItem(p).kind === 'image').slice(0, MOSAIC_MAX); }

/* miniature */
const thumbQueue = [];
let thumbBusy = 0;
const thumbObserver = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { thumbObserver.unobserve(e.target); thumbQueue.push(e.target); pumpThumbs(); }
}, { root: null, rootMargin: '200px' });
async function pumpThumbs() {
  while (thumbBusy < 2 && thumbQueue.length) {
    const el = thumbQueue.shift();
    thumbBusy++;
    fillThumb(el).catch(() => {}).finally(() => { thumbBusy--; pumpThumbs(); });
  }
}
async function fillThumb(el) {
  const path = el.dataset.path;
  const it = libItem(path);
  if (!it || !el.isConnected) return;
  const key = path + '|' + it.mtime;
  let blob = await Platform.thumbs.get(key);
  if (!blob) {
    const file = await getFile(path);
    if (!file) return;
    blob = it.kind === 'image' ? await thumbFromImage(file) : await thumbFromVideo(file);
    if (blob) await Platform.thumbs.set(key, blob);
  }
  if (blob && el.isConnected) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.onload = () => URL.revokeObjectURL(img.src);
    el.textContent = ''; el.appendChild(img);
  }
}
function drawThumb(source, w, h) {
  const W = 240, H = Math.max(1, Math.round(W * h / w));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').drawImage(source, 0, 0, W, H);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.8));
}
async function thumbFromImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const b = await drawThumb(bmp, bmp.width, bmp.height);
    bmp.close(); return b;
  } catch {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => { drawThumb(img, img.naturalWidth, img.naturalHeight).then(res); URL.revokeObjectURL(img.src); };
      img.onerror = () => res(null);
      img.src = URL.createObjectURL(file);
    });
  }
}
function thumbFromVideo(file) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto';
    const done = (b) => { URL.revokeObjectURL(v.src); res(b); };
    v.onloadeddata = () => { v.currentTime = Math.min(1.5, (v.duration || 2) / 2); };
    v.onseeked = () => drawThumb(v, v.videoWidth || 16, v.videoHeight || 9).then(done);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = URL.createObjectURL(file);
  });
}

/* scheda file e tag */
function editItem(path) {
  const it = libItem(path);
  const d = $('dlg-item');
  $('item-path').textContent = path;
  $('item-label').value = it.label || '';
  $('item-label').placeholder = stripExt(basename(path));
  const tags = [...it.tags];
  const chips = $('item-tags');
  const draw = () => {
    chips.innerHTML = '';
    tags.forEach((t, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.innerHTML = `${esc(t)} <span class="x" title="Rimuovi">✕</span>`;
      c.querySelector('.x').onclick = () => { tags.splice(i, 1); draw(); };
      chips.appendChild(c);
    });
  };
  draw();
  const inp = $('item-tag-input');
  inp.value = '';
  inp.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      for (const t of inp.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) if (!tags.includes(t)) tags.push(t);
      inp.value = ''; draw();
    }
  };
  d.onclose = () => {
    if (d.returnValue !== 'ok') return;
    for (const t of inp.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) if (!tags.includes(t)) tags.push(t);
    it.label = $('item-label').value.trim();
    it.tags = tags;
    if (tags.length) delete it.isNew;
    for (const t of tags) S.library.tags[t] ||= {};
    saveLibrary(); renderLibrary(); renderCues();
  };
  d.showModal();
}
function bulkTags(add) {
  const d = $('dlg-tagadd');
  $('tagadd-title').textContent = (add ? 'Aggiungi tag a ' : 'Rimuovi tag da ') + S.lib.selection.size + ' file';
  $('tagadd-input').value = '';
  d.onclose = () => {
    if (d.returnValue !== 'ok') return;
    const tags = $('tagadd-input').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!tags.length) return;
    for (const p of S.lib.selection) {
      const it = libItem(p); if (!it) continue;
      if (add) { for (const t of tags) if (!it.tags.includes(t)) it.tags.push(t); if (it.tags.length) delete it.isNew; }
      else it.tags = it.tags.filter(t => !tags.includes(t));
    }
    for (const t of tags) if (add) S.library.tags[t] ||= {};
    saveLibrary(); renderLibrary();
  };
  d.showModal();
}
function openTagManager() {
  const d = $('dlg-tags');
  const table = $('tags-table');
  const draw = () => {
    const counts = {};
    for (const it of Object.values(S.library.items)) for (const t of it.tags) counts[t] = (counts[t] || 0) + 1;
    const names = Object.keys(S.library.tags).sort((a, b) => a.localeCompare(b, 'it'));
    table.innerHTML = names.length ? '' : '<tr><td class="muted">Nessun tag ancora.</td></tr>';
    for (const t of names) {
      const tr = document.createElement('tr');
      const others = names.filter(x => x !== t).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
      tr.innerHTML = `<td><input type="color" value="${esc((S.library.tags[t].color) || '#343845')}"></td>
        <td><input type="text" value="${esc(t)}"></td><td class="muted">${counts[t] || 0}</td>
        <td><button data-a="ren">Rinomina</button></td>
        <td><select><option value="">Unisci in…</option>${others}</select></td>
        <td><button data-a="del" class="danger">🗑</button></td>`;
      const [color, name] = tr.querySelectorAll('input');
      color.onchange = () => { S.library.tags[t].color = color.value; saveLibrary(); renderLibrary(); };
      tr.querySelector('[data-a=ren]').onclick = () => renameTag(t, name.value.trim().toLowerCase(), draw);
      tr.querySelector('select').onchange = (e) => { if (e.target.value) renameTag(t, e.target.value, draw); };
      tr.querySelector('[data-a=del]').onclick = async () => {
        if (await confirmDlg(`Eliminare il tag «${t}» da ${counts[t] || 0} file?`)) renameTag(t, null, draw);
      };
      table.appendChild(tr);
    }
  };
  draw();
  d.showModal();
}
function renameTag(from, to, redraw) {
  if (to === from || (to !== null && !to)) return;
  for (const it of Object.values(S.library.items)) {
    if (!it.tags.includes(from)) continue;
    it.tags = it.tags.filter(t => t !== from);
    if (to && !it.tags.includes(to)) it.tags.push(to);
  }
  if (to) S.library.tags[to] = Object.assign({}, S.library.tags[from], S.library.tags[to]);
  delete S.library.tags[from];
  if (S.lib.tags.has(from)) { S.lib.tags.delete(from); if (to) S.lib.tags.add(to); }
  saveLibrary(); renderLibrary(); redraw && redraw();
}

/* ---------- appunti ---------- */
const saveNotes = debounce(() => {
  const data = sceneData(currentCueOwnerId());
  if (data) data.notes = $('notes-scene').value;
  const sd = sessionData();
  if (sd) sd.notes = $('notes-session').value;
  saveMaster();
}, 500);

/* ---------- anteprima automatica ---------- */
function startPreview() {
  if (!S.doc || !S.doc.scenes.length) { toast('Nessuna scena da mostrare'); return; }
  if (S.preview) { stopPreview(); return; }
  S.preview = {
    idx: -1, paused: false, timer: null, t0: 0, elapsed: 0,
    muted: $('pv-muted').checked, local: $('pv-local').checked,
    snapshot: { player: JSON.parse(JSON.stringify(S.player)), audio: { ...S.audio }, sceneId: S.sceneId },
  };
  stopAudio();
  $('preview-bar').hidden = false;
  $('btn-preview').classList.add('active');
  previewStep(1);
}
function previewApply(sc) {
  const { bg, bgInherited, fr, tx, au } = sceneAutoCues(sc);
  S.player.caption = null;
  S.player.frame = null;
  if (bg) S.player.background = bg.src;
  if (fr) S.player.frame = fr.kind === 'frame' ? { kind: 'images', srcs: [].concat(fr.src) } : { kind: 'video', srcs: [fr.src], loop: fr.loop, full: fr.full };
  if (tx) { if (tx.style === 'caption') S.player.caption = tx.text; else if (!fr) S.player.frame = { kind: 'text', text: tx.text, style: tx.style }; }
  if ((!bg || bgInherited) && !fr && !tx && !au) S.player.frame = { kind: 'text', text: sc.title + '\n(nessuna cue da caricare)', style: 'title' };
  else if (!fr && !tx) S.player.caption = sc.title;
  S.player.black = false;
  pushPlayer();
  if (au && !S.preview.muted) playAudio(au.src, { loop: au.loop, preset: au.preset, label: cueLabel(au) });
  else if (!S.preview.muted && S.audio.playing && !au) { /* la traccia precedente continua */ }
}
function previewStep(dir) {
  const pv = S.preview;
  if (!pv) return;
  clearInterval(pv.timer);
  pv.idx = Math.max(0, Math.min(S.doc.scenes.length - 1, pv.idx + dir));
  const sc = S.doc.scenes[pv.idx];
  S.sceneId = sc.id; S.orphanId = null; renderSceneList(); renderScene();
  $('pv-label').textContent = `${pv.idx + 1}/${S.doc.scenes.length} · ${sc.title}`;
  previewApply(sc);
  pv.elapsed = 0; pv.t0 = performance.now();
  const total = (S.campaign.previewSeconds || 6) * 1000;
  pv.timer = setInterval(() => {
    if (pv.paused) { pv.t0 = performance.now() - pv.elapsed; return; }
    pv.elapsed = performance.now() - pv.t0;
    $('pv-progress-fill').style.width = Math.min(100, pv.elapsed / total * 100) + '%';
    if (pv.elapsed >= total) {
      if (pv.idx >= S.doc.scenes.length - 1) { stopPreview(); toast('Anteprima completata'); }
      else previewStep(1);
    }
  }, 100);
}
function stopPreview() {
  const pv = S.preview;
  if (!pv) return;
  clearInterval(pv.timer);
  S.preview = null;
  $('preview-bar').hidden = true;
  $('btn-preview').classList.remove('active');
  $('pv-progress-fill').style.width = '0';
  stopAudio();
  S.player = pv.snapshot.player;
  S.sceneId = pv.snapshot.sceneId;
  renderSceneList(); renderScene();
  pushPlayer();
}

/* ---------- finestra giocatori e anteprima ---------- */
function initPreviewFrame() {
  const f = $('preview');
  f.onload = () => { S.previewReady = true; pushPlayer(); };
  f.srcdoc = buildPlayerHtml({ activate: false });
  const fit = () => { const w = $('preview-wrap').clientWidth; f.style.transform = `scale(${w / 1280})`; };
  new ResizeObserver(fit).observe($('preview-wrap'));
  fit();
}
async function openPlayerWindow() {
  const existing = S.playerWin && !S.playerWin.closed;
  const w = window.open('', 'master-player', 'popup=yes,width=1280,height=720');
  if (!w) { toast('Il browser ha bloccato la finestra: consenti i popup per questa pagina e riprova', 5000); return; }
  S.playerWin = w;
  if (!existing || !w.player) {
    w.document.open(); w.document.write(buildPlayerHtml({ activate: true })); w.document.close();
    w.player.setOptions({ fullscreenOnActivate: true });
  }
  w.focus();
  pushPlayer();
  updatePlayerDot();
  if (!existing) placeOnSecondScreen(w);
}
// Con la Window Management API (Chrome/Edge) sposta la finestra sul secondo schermo, se c'è
async function placeOnSecondScreen(w) {
  if (!('getScreenDetails' in window)) return;
  try {
    const sd = await window.getScreenDetails();
    const other = sd.screens.find(s => !s.isPrimary);
    if (!other || w.closed) return;
    w.moveTo(other.availLeft, other.availTop);
    w.resizeTo(other.availWidth, other.availHeight);
    toast('Finestra spostata sul secondo schermo: clicca dentro per attivarla (va a schermo intero)', 5000);
  } catch (e) { console.info('Window Management non disponibile:', e.message); }
}
function updatePlayerDot() {
  const on = S.playerWin && !S.playerWin.closed;
  $('player-dot').classList.toggle('on', !!on);
  $('player-hint').textContent = on ? 'Finestra giocatori aperta: trascinala sul secondo schermo, clicca dentro per attivarla e F11 per lo schermo intero.' : 'Finestra giocatori chiusa. Aprila con il bottone in alto.';
}
setInterval(updatePlayerDot, 1500);

/* ---------- impostazioni ---------- */
function openSettings() {
  const c = S.campaign, d = $('dlg-settings');
  $('set-name').value = c.name; $('set-p1').value = c.presets.sottofondo; $('set-p2').value = c.presets.critico; $('set-p3').value = c.presets.enfasi;
  $('set-border').value = c.frame.border; $('set-width').value = c.frame.width; $('set-size').value = c.frame.size;
  $('set-textsize').value = c.frame.textSize; $('set-dim').value = c.dim; $('set-preview').value = c.previewSeconds;
  $('set-autoload').checked = c.autoLoadScene !== false;
  d.onclose = async () => {
    if (d.returnValue === 'forget') {
      if (await confirmDlg('Dimenticare la cartella salvata? I file restano sul disco.')) { await Platform.forgetFolder(); location.reload(); }
      return;
    }
    if (d.returnValue !== 'ok') return;
    c.name = $('set-name').value.trim() || c.name;
    c.presets = { sottofondo: +$('set-p1').value, critico: +$('set-p2').value, enfasi: +$('set-p3').value };
    c.frame = { border: $('set-border').value, width: +$('set-width').value, size: +$('set-size').value, textSize: +$('set-textsize').value };
    c.dim = +$('set-dim').value; c.previewSeconds = +$('set-preview').value; c.autoLoadScene = $('set-autoload').checked;
    $('campaign-name').textContent = c.name; document.title = `Master – ${c.name}`;
    await saveCampaign(); renderPresets(); pushPlayer();
    if (S.preset) setPreset(S.preset, true);
  };
  d.showModal();
}

/* ---------- interazione ---------- */
function bind() {
  const openFolder = async () => {
    try { await Platform.pickFolder(); await openCampaign(); }
    catch (e) { if (e.name !== 'AbortError') { console.error(e); toast('Apertura fallita: ' + e.message, 4000); } }
  };
  const restore = async () => {
    try { if (await Platform.restoreFolder(true)) await openCampaign(); else toast('Permesso negato'); }
    catch (e) { console.error(e); toast('Ripristino fallito: ' + e.message, 4000); }
  };
  $('btn-open-folder').onclick = openFolder;
  $('btn-welcome-open').onclick = openFolder;
  $('btn-restore-folder').onclick = restore;
  $('btn-welcome-restore').onclick = restore;
  $('session-select').onchange = (e) => e.target.value && selectSession(e.target.value);
  $('btn-reload-docx').onclick = async () => { await loadSessions(); toast('Documento riletto'); };
  $('btn-open-player').onclick = openPlayerWindow;
  $('btn-settings').onclick = openSettings;
  $('btn-preview').onclick = startPreview;

  $('btn-load-scene').onclick = () => loadScene();
  $('btn-cue-library').onclick = () => { switchTab('screen'); $('lib-search').scrollIntoView({ block: 'start', behavior: 'smooth' }); $('lib-search').focus(); };
  $('btn-cue-text').onclick = openTextDialog;
  $('btn-cue-file').onclick = () => $('adhoc-file').click();
  $('adhoc-file').onchange = (e) => { handleAdhocFiles(e.target.files); e.target.value = ''; };
  $('btn-orphan-move').onclick = () => {
    const target = $('orphan-target').value, from = S.orphanId;
    if (!target || !from) return;
    const sd = sessionData();
    sceneData(target).cues.push(...sd.scenes[from].cues);
    delete sd.scenes[from];
    saveMaster(); selectScene(target); toast('Cue spostate');
  };

  $('btn-close-frame').onclick = closeFrame;
  $('btn-hide-caption').onclick = hideCaption;
  $('btn-title').onclick = showSceneTitle;
  $('btn-dim').onclick = toggleDim;
  $('btn-black').onclick = () => toggleBlack();
  $('btn-stop-audio').onclick = stopAudio;
  $$('.preset-btn').forEach(b => b.onclick = () => setPreset(b.dataset.preset));
  $('volume-slider').oninput = (e) => setVolume(e.target.value / 100);

  $$('.kind-btn').forEach(b => b.onclick = () => { $$('.kind-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); S.lib.kind = b.dataset.kind; renderLibrary(); });
  $('lib-search').oninput = debounce((e) => { S.lib.q = e.target.value; renderLibrary(); }, 150);
  $('lib-sort').onchange = (e) => { S.lib.sort = e.target.value; renderLibrary(); };
  $('btn-lib-refresh').onclick = () => scanLibrary();
  $('btn-lib-tags').onclick = openTagManager;
  $('btn-tags-close').onclick = () => $('dlg-tags').close();
  $('btn-sel-frame').onclick = () => showFrameImages(selectedImages());
  $('btn-sel-cue-frame').onclick = () => addImageCueChoice(selectedImages());
  $('btn-sel-tag-add').onclick = () => bulkTags(true);
  $('btn-sel-tag-remove').onclick = () => bulkTags(false);
  $('btn-sel-clear').onclick = () => { S.lib.selection.clear(); renderLibrary(); };

  $('notes-scene').oninput = saveNotes;
  $('notes-session').oninput = saveNotes;

  $('pv-prev').onclick = () => previewStep(-1);
  $('pv-next').onclick = () => previewStep(1);
  $('pv-stop').onclick = stopPreview;
  $('pv-pause').onclick = () => { if (!S.preview) return; S.preview.paused = !S.preview.paused; $('pv-pause').textContent = S.preview.paused ? '▶' : '⏸'; };
  $('pv-muted').onchange = (e) => { if (S.preview) { S.preview.muted = e.target.checked; if (e.target.checked) stopAudio(); } };
  $('pv-local').onchange = (e) => { if (S.preview) { S.preview.local = e.target.checked; pushPlayer(); } };

  $$('.tab-btn').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  // ridimensionamento colonne
  $$('.gutter').forEach(g => {
    g.onmousedown = (e) => {
      e.preventDefault();
      const target = g.dataset.target, isLeft = target === 'col-left';
      const startX = e.clientX, startW = $(target).getBoundingClientRect().width;
      const move = (ev) => {
        const w = Math.max(160, Math.min(900, startW + (isLeft ? ev.clientX - startX : startX - ev.clientX)));
        document.documentElement.style.setProperty(isLeft ? '--left' : '--right', w + 'px');
        localStorage.setItem('master:' + (isLeft ? 'left' : 'right'), w);
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    };
  });
  for (const side of ['left', 'right']) { const v = localStorage.getItem('master:' + side); if (v) document.documentElement.style.setProperty('--' + side, v + 'px'); }

  // drag & drop di file
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('drop-overlay').hidden = false; } });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; } });
  document.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true;
    if (S.open) handleAdhocFiles(e.dataTransfer.files);
  });

  // scorciatoie
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.matches('input,textarea,select') || document.querySelector('dialog[open]') || !S.open) return;
    if (e.key === 'b' || e.key === 'B') toggleBlack();
    else if (e.key === 'Escape') closeFrame();
    else if (e.key === ' ') { e.preventDefault(); stopAudio(); }
    else if (e.key === '1') setPreset('sottofondo');
    else if (e.key === '2') setPreset('critico');
    else if (e.key === '3') setPreset('enfasi');
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!S.doc) return;
      e.preventDefault();
      const i = S.doc.scenes.findIndex(s => s.id === S.sceneId);
      const n = S.doc.scenes[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (n) selectScene(n.id, { load: true });
    }
    else if (e.key === 'Enter') loadScene();
  });
  window.addEventListener('beforeunload', () => { if (S.playerWin && !S.playerWin.closed) S.playerWin.close(); });
}
function switchTab(name) {
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(t => t.hidden = t.id !== 'tab-' + name);
}

/* ---------- avvio ---------- */
async function init() {
  bind();
  initPreviewFrame();
  renderPresets();
  if (!Platform.supported) {
    $('welcome-note').textContent = 'Questo browser non supporta l\'accesso diretto alle cartelle: usa Chrome o Edge. In alternativa la cartella va riselezionata a ogni avvio e i salvataggi vengono scaricati come file.';
  }
  const saved = await Platform.savedFolderName();
  if (saved) {
    // prova senza gesture: se il permesso è già concesso si apre subito
    if (await Platform.restoreFolder(false)) { await openCampaign(); return; }
    $('restore-name').textContent = saved; $('welcome-restore-name').textContent = saved;
    $('btn-restore-folder').hidden = false; $('btn-welcome-restore').hidden = false;
  }
}
init();
