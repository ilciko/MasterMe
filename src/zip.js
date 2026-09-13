/* zip.js – lettore ZIP minimale (solo lettura), zero dipendenze.
   Supporta metodo 0 (store) e 8 (deflate) tramite DecompressionStream('deflate-raw'). */
'use strict';

const MasterZip = (() => {
  const SIG_EOCD = 0x06054b50;
  const SIG_CEN = 0x02014b50;
  const SIG_LOC = 0x04034b50;

  function findEOCD(dv) {
    const min = Math.max(0, dv.byteLength - 65557);
    for (let i = dv.byteLength - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) return i;
    }
    throw new Error('Archivio ZIP non valido (EOCD mancante)');
  }

  async function open(buffer) {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    const dec = new TextDecoder('utf-8');
    const eocd = findEOCD(dv);
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== SIG_CEN) throw new Error('Central directory corrotta');
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const size = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const offset = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      entries.set(name, { name, method, compSize, size, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }

    async function read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const o = e.offset;
      if (dv.getUint32(o, true) !== SIG_LOC) throw new Error('Local header corrotto: ' + name);
      const nameLen = dv.getUint16(o + 26, true);
      const extraLen = dv.getUint16(o + 28, true);
      const start = o + 30 + nameLen + extraLen;
      const raw = u8.subarray(start, start + e.compSize);
      if (e.method === 0) return raw.slice();
      if (e.method === 8) {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([raw]).stream().pipeThrough(ds);
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error('Metodo di compressione non supportato: ' + e.method);
    }

    async function readText(name) {
      const b = await read(name);
      return b ? dec.decode(b) : null;
    }

    return { entries, read, readText, has: (n) => entries.has(n) };
  }

  return { open };
})();
