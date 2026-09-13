/* player.js – schermo giocatori a due livelli. Il codice di playerMain viene iniettato
   nella finestra giocatori e nell'iframe di anteprima tramite buildPlayerHtml(). */
'use strict';

const PLAYER_CSS = `
:root{--frame-border:#c9a227;--frame-width:6px;--frame-w:76vw;--frame-h:76vh;--text-size:4vmin}
html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:Georgia,'Times New Roman',serif;color:#f5eedc}
#stage{position:fixed;inset:0;overflow:hidden}
.bg-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .7s}
.bg-img.on{opacity:1}
#dim{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .7s}
#frame{position:absolute;left:50%;top:50%;width:var(--frame-w);height:var(--frame-h);
  transform:translate(-50%,-50%) scale(.97);opacity:0;transition:opacity .4s,transform .4s;pointer-events:none}
#frame.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
#frame-inner{width:100%;height:100%;box-sizing:border-box;border:var(--frame-width) solid var(--frame-border);
  background:rgba(0,0,0,.78);box-shadow:0 0 80px rgba(0,0,0,.85),inset 0 0 40px rgba(0,0,0,.5);
  display:flex;gap:1.5vmin;padding:1.5vmin;align-items:center;justify-content:center}
#frame.full{width:100vw;height:100vh}
#frame.full #frame-inner{border:none;background:#000;padding:0;box-shadow:none}
#frame-inner img,#frame-inner video{flex:1 1 0;min-width:0;width:100%;height:100%;object-fit:contain}
#frame-inner[data-n="3"]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr)}
#frame-inner[data-n="4"]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}
#frame-inner[data-n="3"] img,#frame-inner[data-n="4"] img{min-height:0}
#frame-inner img.enter{animation:mosaic-in .4s ease-out}
@keyframes mosaic-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
#frame-inner .text{font-size:var(--text-size);line-height:1.45;padding:3vmin 4vmin;text-align:center;
  white-space:pre-wrap;overflow:auto;max-height:100%;box-sizing:border-box}
#frame.style-title #frame-inner{border:none;background:transparent;box-shadow:none}
#frame.style-title .text{font-size:calc(var(--text-size) * 2);text-shadow:0 0 24px #000,0 2px 6px #000;letter-spacing:.04em}
#caption{position:absolute;left:6%;right:6%;bottom:3%;text-align:center;font-size:calc(var(--text-size) * .9);line-height:1.35;
  padding:2vmin 3vmin;background:rgba(0,0,0,.72);border-left:.6vmin solid var(--frame-border);border-right:.6vmin solid var(--frame-border);
  white-space:pre-wrap;opacity:0;transition:opacity .4s;pointer-events:none}
#caption.on{opacity:1}
#black{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .5s;pointer-events:none}
#black.on{opacity:1}
#activate{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2vmin;
  background:rgba(0,0,0,.88);font-size:3vmin;cursor:pointer;text-align:center;z-index:10;user-select:none}
#activate small{font-size:.6em;opacity:.7}
#activate.off{display:none}
`;

function playerMain() {
  const $ = (id) => document.getElementById(id);
  const urls = new Map();
  const opts = { muted: false };
  let cur = { background: null, frame: null, caption: null, black: false, dim: 0 };
  let bgToggle = false;

  function urlFor(ref) {
    if (!ref) return null;
    if (ref.url) return ref.url;
    if (!urls.has(ref.key)) urls.set(ref.key, URL.createObjectURL(ref.file));
    return urls.get(ref.key);
  }

  function applyTheme(t) {
    if (!t) return;
    const s = document.documentElement.style;
    if (t.border) s.setProperty('--frame-border', t.border);
    if (t.width != null) s.setProperty('--frame-width', t.width + 'px');
    if (t.size != null) { s.setProperty('--frame-w', t.size + 'vw'); s.setProperty('--frame-h', t.size + 'vh'); }
    if (t.textSize != null) s.setProperty('--text-size', t.textSize + 'vmin');
  }

  function setBackground(ref) {
    const key = ref ? ref.key : null;
    const curKey = cur.background ? cur.background.key : null;
    if (key === curKey) return;
    const a = $('bgA'), b = $('bgB');
    const show = bgToggle ? a : b, hide = bgToggle ? b : a;
    bgToggle = !bgToggle;
    if (!ref) { a.classList.remove('on'); b.classList.remove('on'); return; }
    show.onload = () => { show.classList.add('on'); hide.classList.remove('on'); };
    show.src = urlFor(ref);
    if (show.complete && show.naturalWidth) show.onload();
  }

  function frameKey(f) {
    return f ? JSON.stringify([f.kind, (f.items || []).map(i => i.key), f.text, f.style, f.loop, f.full]) : null;
  }

  function stopVideo() {
    const v = document.querySelector('#frame-inner video');
    if (v) { try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); }
  }

  function setFrame(f) {
    const fr = $('frame'), inner = $('frame-inner');
    if (frameKey(f) === frameKey(cur.frame)) {
      const v = inner.querySelector('video');
      if (v) v.muted = !!opts.muted;
      return;
    }
    // mosaico già visibile: aggiunge/toglie solo le immagini cambiate, senza ricaricare le altre
    if (f && f.kind === 'images' && cur.frame && cur.frame.kind === 'images' && fr.classList.contains('on')) {
      const keys = f.items.map(i => i.key);
      const existing = new Map(Array.from(inner.querySelectorAll('img')).map(img => [img.dataset.key, img]));
      for (const [k, img] of existing) if (!keys.includes(k)) img.remove();
      for (const it of f.items) {
        let img = existing.get(it.key);
        if (!img) { img = document.createElement('img'); img.dataset.key = it.key; img.className = 'enter'; img.src = urlFor(it); }
        inner.appendChild(img);
      }
      inner.dataset.n = f.items.length;
      return;
    }
    stopVideo();
    if (!f) {
      fr.classList.remove('on');
      setTimeout(() => { if (!fr.classList.contains('on')) inner.innerHTML = ''; }, 450);
      return;
    }
    inner.innerHTML = '';
    fr.className = 'on kind-' + f.kind + (f.full ? ' full' : '') + (f.style ? ' style-' + f.style : '');
    if (f.kind === 'images') inner.dataset.n = f.items.length; else delete inner.dataset.n;
    if (f.kind === 'images') {
      for (const it of f.items) {
        const img = document.createElement('img');
        img.dataset.key = it.key;
        img.src = urlFor(it);
        inner.appendChild(img);
      }
    } else if (f.kind === 'video') {
      const v = document.createElement('video');
      v.src = urlFor(f.items[0]);
      v.autoplay = true; v.loop = !!f.loop; v.muted = !!opts.muted; v.playsInline = true;
      inner.appendChild(v);
      v.play().catch(() => {});
    } else if (f.kind === 'text') {
      const d = document.createElement('div');
      d.className = 'text';
      d.textContent = f.text || '';
      inner.appendChild(d);
    }
  }

  function setCaption(t) {
    const c = $('caption');
    if (t) { c.textContent = t; c.classList.add('on'); }
    else c.classList.remove('on');
  }

  function apply(state, o) {
    if (o) Object.assign(opts, o);
    if (state.theme) applyTheme(state.theme);
    setBackground(state.background || null);
    $('dim').style.opacity = state.dim || 0;
    setFrame(state.frame || null);
    setCaption(state.caption || null);
    $('black').classList.toggle('on', !!state.black);
    cur = { background: state.background || null, frame: state.frame || null, caption: state.caption || null, black: !!state.black, dim: state.dim || 0 };
  }

  const act = $('activate');
  act.addEventListener('click', () => {
    act.classList.add('off');
    const v = document.querySelector('#frame-inner video');
    if (v) v.play().catch(() => {});
    if (opts.fullscreenOnActivate) document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.().catch(() => {});
  });

  window.player = { apply, setOptions: (o) => Object.assign(opts, o), hideActivate: () => act.classList.add('off') };
  try {
    const bc = new BroadcastChannel('master-player');
    bc.onmessage = (ev) => { if (ev.data && ev.data.type === 'apply') apply(ev.data.state, ev.data.opts); };
  } catch {}
}

function buildPlayerHtml({ activate = true } = {}) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Schermo giocatori</title>
<style>${PLAYER_CSS}</style></head><body>
<div id="stage">
  <img class="bg-img" id="bgA" alt=""><img class="bg-img" id="bgB" alt="">
  <div id="dim"></div>
  <div id="frame"><div id="frame-inner"></div></div>
  <div id="caption"></div>
  <div id="black"></div>
  <div id="activate" class="${activate ? '' : 'off'}">Clicca qui per attivare audio e video<br><small>poi premi F11 (o F) per lo schermo intero</small></div>
</div>
<script>(${playerMain.toString()})();<\/script>
</body></html>`;
}
