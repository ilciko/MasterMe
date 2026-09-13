/* platform.js – adattatore per l'ambiente. Implementazione browser (File System Access API + IndexedDB).
   Una futura implementazione Electron espone la stessa interfaccia. */
'use strict';

const Platform = (() => {
  const DB_NAME = 'master-console';
  const DB_VER = 1;
  let dbPromise = null;

  function db() {
    if (!dbPromise) dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('thumbs')) d.createObjectStore('thumbs');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbPromise;
  }
  function tx(store, mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }));
  }
  const kv = {
    get: (k) => tx('kv', 'readonly', s => s.get(k)),
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
    del: (k) => tx('kv', 'readwrite', s => s.delete(k)),
  };
  const thumbs = {
    get: (k) => tx('thumbs', 'readonly', s => s.get(k)),
    set: (k, v) => tx('thumbs', 'readwrite', s => s.put(v, k)),
    clear: () => tx('thumbs', 'readwrite', s => s.clear()),
  };

  const supported = typeof window.showDirectoryPicker === 'function';
  let root = null;            // FileSystemDirectoryHandle
  let fallbackFiles = null;   // Map path -> File (modalità input webkitdirectory)
  let fallbackName = '';

  const name = () => root ? root.name : fallbackName;

  async function pickFolder() {
    if (supported) {
      root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'campagna' });
      fallbackFiles = null;
      await kv.set('campaignDir', root);
      return root.name;
    }
    return new Promise((res, rej) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.webkitdirectory = true;
      inp.onchange = () => {
        const files = Array.from(inp.files);
        if (!files.length) return rej(new Error('Nessuna cartella selezionata'));
        fallbackFiles = new Map();
        fallbackName = files[0].webkitRelativePath.split('/')[0];
        for (const f of files) {
          const rel = f.webkitRelativePath.split('/').slice(1).join('/');
          fallbackFiles.set(rel, f);
        }
        root = null;
        res(fallbackName);
      };
      inp.click();
    });
  }

  async function savedFolderName() {
    if (!supported) return null;
    const h = await kv.get('campaignDir');
    return h ? h.name : null;
  }

  // Ripristina la cartella salvata. Con gesture=true può chiedere il permesso (serve un click).
  async function restoreFolder(gesture) {
    if (!supported) return null;
    const h = await kv.get('campaignDir');
    if (!h) return null;
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && gesture) p = await h.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return null;
    root = h;
    fallbackFiles = null;
    return h.name;
  }
  async function forgetFolder() { await kv.del('campaignDir'); }
  // Usa un handle già ottenuto (test, o piattaforme che lo forniscono in altro modo)
  function useHandle(h) { root = h; fallbackFiles = null; }

  const segs = (p) => p.split('/').filter(Boolean);

  async function getDir(path, create = false) {
    let d = root;
    for (const s of segs(path)) d = await d.getDirectoryHandle(s, { create });
    return d;
  }
  async function getFileHandle(path, create = false) {
    const parts = segs(path);
    const fname = parts.pop();
    const d = await getDir(parts.join('/'), create);
    return d.getFileHandle(fname, { create });
  }

  async function ensureDir(path) {
    if (!root) return false;
    try { await getDir(path, true); return true; } catch { return false; }
  }

  async function readFile(path) {
    if (fallbackFiles) return fallbackFiles.get(path) || null;
    if (!root) return null;
    try { return await (await getFileHandle(path)).getFile(); } catch { return null; }
  }
  async function readText(path) {
    const f = await readFile(path);
    return f ? f.text() : null;
  }
  async function writeText(path, text) {
    return writeBlob(path, new Blob([text], { type: 'application/json' }));
  }
  async function writeBlob(path, blob) {
    if (root) {
      const h = await getFileHandle(path, true);
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    }
    // fallback: download del file
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = path.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return false;
  }
  async function exists(path) {
    if (fallbackFiles) return fallbackFiles.has(path);
    try { await getFileHandle(path); return true; } catch { return false; }
  }

  // Elenco ricorsivo dei file sotto una sottocartella: [{path, name, size, mtime}]
  async function listFiles(dirPath) {
    const out = [];
    if (fallbackFiles) {
      const prefix = dirPath.replace(/\/?$/, '/');
      for (const [p, f] of fallbackFiles) {
        if (p.startsWith(prefix)) out.push({ path: p, name: f.name, size: f.size, mtime: f.lastModified });
      }
      return out;
    }
    if (!root) return out;
    let dir;
    try { dir = await getDir(dirPath); } catch { return out; }
    async function walk(d, prefix) {
      for await (const [n, h] of d.entries()) {
        if (n.startsWith('.')) continue;
        if (h.kind === 'directory') await walk(h, prefix + n + '/');
        else {
          const f = await h.getFile();
          out.push({ path: prefix + n, name: n, size: f.size, mtime: f.lastModified });
        }
      }
    }
    await walk(dir, dirPath.replace(/\/?$/, '/'));
    return out;
  }

  // Elenco non ricorsivo dei file di una cartella
  async function listDir(dirPath) {
    const all = await listFiles(dirPath);
    const prefix = dirPath.replace(/\/?$/, '/');
    return all.filter(f => !f.path.slice(prefix.length).includes('/'));
  }

  const canWrite = () => !!root;

  return { supported, name, canWrite, pickFolder, savedFolderName, restoreFolder, forgetFolder, useHandle,
           ensureDir, readFile, readText, writeText, writeBlob, exists, listFiles, listDir, kv, thumbs };
})();
