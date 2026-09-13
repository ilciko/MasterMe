/* docx.js – estrae scene (titoli) e testo formattato da un .docx, zero dipendenze. */
'use strict';

const MasterDocx = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const V = 'urn:schemas-microsoft-com:vml';
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf' };

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML non valido nel documento');
    return doc;
  }

  function attr(el, ns, name) {
    return el ? el.getAttributeNS(ns, name) ?? el.getAttribute('w:' + name) : null;
  }
  function child(el, ns, name) {
    for (const c of el.children) if (c.localName === name && c.namespaceURI === ns) return c;
    return null;
  }
  function isOn(el) {
    if (!el) return false;
    const v = attr(el, W, 'val');
    return v === null || v === '' || !(v === '0' || v === 'false' || v === 'off');
  }

  function slugify(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scena';
  }

  // Mappa styleId -> {name, outline, basedOn}
  function parseStyles(xml) {
    const map = new Map();
    if (!xml) return map;
    const doc = parseXml(xml);
    for (const st of doc.getElementsByTagNameNS(W, 'style')) {
      const id = attr(st, W, 'styleId');
      const nameEl = child(st, W, 'name');
      const pPr = child(st, W, 'pPr');
      const outline = pPr ? child(pPr, W, 'outlineLvl') : null;
      const basedOn = child(st, W, 'basedOn');
      map.set(id, {
        name: (nameEl ? attr(nameEl, W, 'val') : '') || '',
        outline: outline ? parseInt(attr(outline, W, 'val'), 10) : null,
        basedOn: basedOn ? attr(basedOn, W, 'val') : null,
      });
    }
    return map;
  }

  // Livello di heading (1..9) di uno stile, seguendo basedOn; 0 = Titolo documento; null = normale
  function headingLevelOfStyle(styles, styleId, depth = 0) {
    if (!styleId || depth > 8) return null;
    const st = styles.get(styleId);
    const name = (st?.name || '').toLowerCase();
    let m = name.match(/^heading\s*(\d)$/) || name.match(/^titolo\s*(\d)$/) || styleId.match(/^(?:heading|titolo)(\d)$/i);
    if (m) return parseInt(m[1], 10);
    if (name === 'title' || name === 'titolo' || /^title$/i.test(styleId)) return 0;
    if (st && st.outline !== null && !Number.isNaN(st.outline)) return st.outline + 1;
    return st ? headingLevelOfStyle(styles, st.basedOn, depth + 1) : null;
  }

  function parseRels(xml) {
    const map = new Map();
    if (!xml) return map;
    const doc = parseXml(xml);
    for (const rel of doc.getElementsByTagNameNS(PKG_REL, 'Relationship')) {
      map.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
    }
    return map;
  }

  function resolveTarget(target) {
    if (!target) return null;
    const full = target.startsWith('/') ? target.slice(1) : 'word/' + target;
    const out = [];
    for (const s of full.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
    return out.join('/');
  }

  function runFormat(r) {
    const rPr = child(r, W, 'rPr');
    return {
      b: !!(rPr && isOn(child(rPr, W, 'b'))),
      i: !!(rPr && isOn(child(rPr, W, 'i'))),
      u: !!(rPr && child(rPr, W, 'u') && attr(child(rPr, W, 'u'), W, 'val') !== 'none'),
    };
  }

  // Estrae run e immagini da un paragrafo (segue hyperlink, ins, smartTag; ignora del)
  function collectRuns(p, ctx, out) {
    for (const el of p.children) {
      if (el.namespaceURI !== W) continue;
      if (el.localName === 'r') {
        const fmt = runFormat(el);
        let text = '';
        for (const c of el.children) {
          if (c.namespaceURI === W) {
            if (c.localName === 't') text += c.textContent;
            else if (c.localName === 'tab') text += '\t';
            else if (c.localName === 'br' || c.localName === 'cr') text += '\n';
            else if (c.localName === 'sym') text += '■';
            else if (c.localName === 'drawing' || c.localName === 'pict' || c.localName === 'object') collectImages(c, ctx, out);
          } else if (c.localName === 'AlternateContent') collectImages(c, ctx, out);
        }
        if (text) out.runs.push({ text, ...fmt });
      } else if (el.localName === 'hyperlink' || el.localName === 'ins' || el.localName === 'smartTag' || el.localName === 'sdt' || el.localName === 'sdtContent') {
        collectRuns(el, ctx, out);
      }
    }
  }

  function collectImages(el, ctx, out) {
    for (const blip of el.getElementsByTagNameNS(A, 'blip')) pushImage(blip.getAttributeNS(R, 'embed'), ctx, out, drawingMeta(blip));
    for (const img of el.getElementsByTagNameNS(V, 'imagedata')) pushImage(img.getAttributeNS(R, 'id'), ctx, out, vmlMeta(img));
  }
  // Testo alternativo e proporzioni dell'immagine (wp:inline / wp:anchor)
  function drawingMeta(node) {
    let n = node;
    while (n && !(n.namespaceURI === WP && (n.localName === 'inline' || n.localName === 'anchor'))) n = n.parentNode;
    const meta = { descr: '', cx: 0, cy: 0 };
    if (!n) return meta;
    for (const c of n.children) {
      if (c.localName === 'docPr') meta.descr = c.getAttribute('descr') || c.getAttribute('title') || '';
      else if (c.localName === 'extent') { meta.cx = +c.getAttribute('cx') || 0; meta.cy = +c.getAttribute('cy') || 0; }
    }
    return meta;
  }
  function vmlMeta(img) {
    const shape = img.parentNode;
    const style = (shape && shape.getAttribute && shape.getAttribute('style')) || '';
    const num = (k) => { const m = style.match(new RegExp('(?:^|;)\\s*' + k + ':\\s*([\\d.]+)')); return m ? parseFloat(m[1]) : 0; };
    return { descr: (shape && shape.getAttribute && shape.getAttribute('alt')) || '', cx: num('width'), cy: num('height') };
  }
  function cleanLabel(s) {
    s = (s || '').replace(/\s*(Descrizione generata automaticamente|Description automatically generated)\.?$/i, '').replace(/\s+/g, ' ').trim();
    if (/^(picture|immagine|image|figura|grafico|chart|img)\s*\d*$/i.test(s)) return '';
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
  function pushImage(id, ctx, out, meta = {}) {
    if (!id) return;
    const target = resolveTarget(ctx.rels.get(id));
    if (!target) return;
    if (!out.images.includes(target)) out.images.push(target);
    if (!ctx.meta.has(target)) ctx.meta.set(target, {
      label: cleanLabel(meta.descr), landscape: meta.cx && meta.cy ? meta.cx >= meta.cy : null, index: ctx.meta.size + 1,
    });
  }

  function paragraphInfo(p, styles) {
    const pPr = child(p, W, 'pPr');
    let level = null;
    let list = null;
    if (pPr) {
      const ps = child(pPr, W, 'pStyle');
      level = headingLevelOfStyle(styles, ps ? attr(ps, W, 'val') : null);
      const ol = child(pPr, W, 'outlineLvl');
      if (level === null && ol) level = parseInt(attr(ol, W, 'val'), 10) + 1;
      const numPr = child(pPr, W, 'numPr');
      if (numPr) {
        const ilvl = child(numPr, W, 'ilvl');
        list = ilvl ? parseInt(attr(ilvl, W, 'val'), 10) : 0;
      }
    }
    return { level, list };
  }

  function textOf(runs) { return runs.map(r => r.text).join('').replace(/\s+/g, ' ').trim(); }
  // Come textOf ma conserva gli a capo manuali (Maiusc+Invio)
  function multilineOf(runs) {
    return runs.map(r => r.text).join('').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/^\n+|\n+$/g, '');
  }

  async function parse(arrayBuffer, opts = {}) {
    const sceneDepth = opts.sceneDepth ?? 2;    // titoli fino a questo livello diventano scene
    const noteLevel = opts.noteLevel ?? 3;      // Titolo 3: apre un blocco "Note del Master" (fino al prossimo titolo)
    const captionLevel = opts.captionLevel ?? 4; // Titolo 4: didascalia da mostrare ai giocatori a comando
    let inNote = false;
    let lastCaption = null;           // Titolo 4 consecutivi formano un'unica didascalia
    const zip = await MasterZip.open(arrayBuffer);
    const docXml = await zip.readText('word/document.xml');
    if (!docXml) throw new Error('Non è un documento Word (.docx) valido');
    const styles = parseStyles(await zip.readText('word/styles.xml'));
    const rels = parseRels(await zip.readText('word/_rels/document.xml.rels'));
    const ctx = { rels, meta: new Map() };
    const doc = parseXml(docXml);
    const body = doc.getElementsByTagNameNS(W, 'body')[0];

    const scenes = [];
    let docTitle = null;
    let current = null;
    const slugCount = new Map();
    const imageTargets = new Set();

    function newScene(title, level) {
      const slug = slugify(title);
      const n = (slugCount.get(slug) || 0) + 1;
      slugCount.set(slug, n);
      current = { id: n === 1 ? slug : `${slug}~${n}`, title, level, blocks: [] };
      scenes.push(current);
    }
    function ensureScene() {
      if (!current) newScene('Introduzione', 1);
    }

    function handleParagraph(p) {
      const out = { runs: [], images: [] };
      collectRuns(p, ctx, out);
      const { level, list } = paragraphInfo(p, styles);
      const text = textOf(out.runs);
      out.images.forEach(t => imageTargets.add(t));
      const prevCaption = lastCaption;
      lastCaption = null;
      // immagini incollate in un titolo o in una didascalia: finiscono in un blocco a sé subito dopo
      const imagesBlock = () => {
        if (!out.images.length) return;
        ensureScene();
        const b = { type: 'p', runs: [], images: out.images };
        if (inNote) b.note = true;
        current.blocks.push(b);
      };
      if (level === 0) { if (!docTitle) docTitle = text; imagesBlock(); return; }
      if (level !== null && level <= sceneDepth && text) { inNote = false; newScene(text, level); imagesBlock(); return; }
      if (!text && !out.images.length) return;
      ensureScene();
      if (level === noteLevel) { inNote = true; current.blocks.push({ type: 'note-h', runs: out.runs, note: true }); imagesBlock(); return; }
      if (level === captionLevel) {
        inNote = false;
        if (text) {
          const ctext = multilineOf(out.runs);
          if (prevCaption) {
            prevCaption.text += '\n' + ctext;
            prevCaption.runs.push({ text: '\n' }, ...out.runs);
            lastCaption = prevCaption;
          } else {
            lastCaption = { type: 'caption', text: ctext, runs: out.runs };
            current.blocks.push(lastCaption);
          }
        }
        if (out.images.length) { lastCaption = null; imagesBlock(); }
        return;
      }
      if (level !== null) { inNote = false; current.blocks.push({ type: 'h', level, runs: out.runs, images: out.images }); return; }
      const b = list !== null ? { type: 'li', level: list, runs: out.runs, images: out.images } : { type: 'p', runs: out.runs, images: out.images };
      if (inNote) b.note = true;
      current.blocks.push(b);
    }

    function handleTable(tbl) {
      lastCaption = null;
      const rows = [];
      const tImages = [];
      for (const tr of tbl.children) {
        if (tr.localName !== 'tr') continue;
        const cells = [];
        for (const tc of tr.children) {
          if (tc.localName !== 'tc') continue;
          const parts = [];
          for (const p of tc.getElementsByTagNameNS(W, 'p')) {
            const out = { runs: [], images: [] };
            collectRuns(p, ctx, out);
            parts.push(out.runs);
            for (const t of out.images) { imageTargets.add(t); if (!tImages.includes(t)) tImages.push(t); }
          }
          cells.push(parts);
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) { ensureScene(); current.blocks.push({ type: 'table', rows, note: inNote || undefined }); }
      if (tImages.length) { ensureScene(); current.blocks.push({ type: 'p', runs: [], images: tImages, note: inNote || undefined }); }
    }

    for (const el of body.children) {
      if (el.namespaceURI !== W) continue;
      if (el.localName === 'p') handleParagraph(el);
      else if (el.localName === 'tbl') handleTable(el);
      else if (el.localName === 'sdt') {
        const content = child(el, W, 'sdtContent');
        if (content) for (const c of content.children) {
          if (c.localName === 'p') handleParagraph(c); else if (c.localName === 'tbl') handleTable(c);
        }
      }
    }

    // Immagini incorporate -> Blob
    const images = new Map();
    for (const target of imageTargets) {
      const bytes = await zip.read(target);
      if (!bytes) continue;
      const ext = target.split('.').pop().toLowerCase();
      images.set(target, new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }));
    }

    return { title: docTitle, scenes, images, imageMeta: ctx.meta };
  }

  return { parse, slugify };
})();
