# Piano: "Master" – console del narratore per campagne GdR (rev. 2)

## Contesto

Il master conduce le sessioni con due schermi: il portatile (console privata) e uno schermo esterno visto dai giocatori. Dalla console legge il testo della sessione (un `.docx`), prende appunti e con un click manda immagini, video, testo e audio ai giocatori.

Una **campagna** ha più **sessioni** (un docx ciascuna) e una **libreria media** condivisa che cresce nel tempo: audio, immagini e video preparati per sessioni precedenti restano riutilizzabili.

Vincoli decisi con l'utente:
- Nessuna dipendenza da installare per chi usa l'app (Windows, Edge/Chrome).
- Contenuti in una cartella campagna sul disco, più caricamento al volo di singoli file.
- Scene = titoli (Titolo 1/2) del docx; associazione scena→media manuale dalla console.
- Audio: una traccia alla volta.

## Modello: campagna, sessioni, scene, cue

```
campagna/
  campaign.json          # nome, preset volumi, impostazioni schermo, durata anteprima
  sessioni/
    01-Il-risveglio.docx
    02-La-torre.docx
  media/                 # libreria condivisa, sottocartelle libere (es. luoghi/, png/, audio/)
  library.json           # indice media: tipo, label, tag liberi
  master.json            # cue per sessione/scena, appunti, storico
```

- **Sessione**: un docx in `sessioni/`; la console la seleziona da una tendina. Ogni sessione ha le sue scene (dai titoli) e le sue cue.
- **Scena**: blocco di testo + elenco ordinato di **cue**.
- **Cue**: un bottone 1-click. Tipi:

| tipo | effetto sullo schermo giocatori |
|---|---|
| `background` | immagine del luogo corrente, a tutto schermo (`cover`), resta finché non cambia |
| `frame` | 1 o 2 immagini (mosaico affiancato) in un riquadro centrale bordato, sopra lo sfondo |
| `video` | video nel riquadro centrale (o a tutto schermo, opzione per cue), con audio |
| `text` | testo per i giocatori: **scheda** nel riquadro centrale oppure **didascalia** in basso sopra lo sfondo |
| `audio` | traccia audio, con preset di volume predefinito per la cue |

Comandi globali sempre visibili: *Chiudi riquadro*, *Schermo nero*, *Stop audio*, *Mostra titolo scena*, i tre preset di volume.

- **Preset volume** (in `campaign.json`, modificabili): Sottofondo 30 %, Momento critico 60 %, Enfasi 100 %. Cambiare preset fa una dissolvenza di ~1 s sulla traccia in corso. Sotto i preset uno slider fine.
- **Media non previsti**: il pannello **Libreria** (vedi sotto) permette di *mostrare subito* qualsiasi file senza associarlo, oppure di *aggiungerlo come cue* alla scena corrente. Uno **Storico** della sessione elenca tutto ciò che è già stato mostrato, per richiamarlo al volo ("vi ricordate questo?").

## Libreria media indicizzata con tag

I file restano in `media/` (sottocartelle libere), ma l'app mantiene un **indice** in `library.json` nella cartella campagna:

```js
{
  items: {
    "media/luoghi/taverna.jpg": { kind:'image', label:'Taverna del Cinghiale', tags:['taverna','città','notte'], size, mtime },
    "media/audio/pioggia.mp3":  { kind:'audio', label:'Pioggia leggera', tags:['ambiente','pioggia'], size, mtime }
  },
  tags: { "taverna": { color:'#c96' }, ... }   // opzionale: colore per tag
}
```

- **Tipo** (`image` / `video` / `audio`) assegnato automaticamente dall'estensione; **tag** multipli a testo libero scelti dal master; **label** opzionale (default: nome file senza estensione).
- **Scansione e riconciliazione** a ogni apertura della cartella (e con bottone *Aggiorna libreria*): i file nuovi entrano nell'indice senza tag e vengono evidenziati come "da taggare"; i file spariti restano nell'indice marcati *mancante* (le cue che li usano mostrano un avviso) finché il master non li rimuove; un file spostato in un'altra sottocartella con stesso nome e dimensione viene riconosciuto e i tag conservati.
- **Ricerca combinata** (AND): selettore tipo → chip dei tag, che mostrano **solo i tag presenti nei file di quel tipo** con il conteggio (es. `pioggia (3)`) → campo nome/label (match parziale, senza accenti). I risultati sono una griglia con anteprima (thumbnail immagine/video, forma d'onda o icona per l'audio), ordinabili per nome, data, ultimo utilizzo.
- **Tagging rapido**: campo tag con autocompletamento sui tag esistenti, `Invio` aggiunge; selezione multipla di file → *Aggiungi tag a tutti* / *Rimuovi tag*. Pannello *Gestione tag*: rinomina (aggiorna tutti i file), unisci due tag, elimina, colore.
- Le **cue** referenziano i file per percorso, e prendono `label` e `kind` dall'indice: rinominare una label in libreria aggiorna tutti i bottoni.
- Le miniature vengono generate al volo con `<canvas>` e messe in cache in IndexedDB (chiave: percorso + mtime), così la griglia resta veloce con centinaia di file.
- **Caricamento al volo**: drag&drop o selettore file sulla console → mostrato subito e, se si vuole, salvato come cue temporanea.

Struttura dati (in `master.json`):

```js
{
  sessions: {
    "01-Il-risveglio.docx": {
      scenes: {
        "<sceneId>": {
          cues: [
            { id, kind:'background', src:'media/luoghi/taverna.jpg', label:'Taverna' },
            { id, kind:'frame', src:['media/png/oste.jpg','media/png/mappa.jpg'], label:'Oste + mappa' },
            { id, kind:'text', text:'Sopra la porta: "Chi entra, paghi."', style:'caption' },
            { id, kind:'audio', src:'media/audio/taverna.mp3', preset:'sottofondo', loop:true }
          ],
          notes: ''
        }
      },
      notes: '', history: [ {kind, src, at} ]
    }
  }
}
```

`sceneId` = slug del titolo + indice, così le cue sopravvivono a piccole modifiche del testo. Se un titolo sparisce dal docx, le sue cue restano in una sezione "orfane" da riassegnare.

## Schermo giocatori: due livelli

```
┌───────────────────────────────────────────┐
│  sfondo: luogo corrente (cover, opz. oscurato)  │
│      ┌───────────────────────────┐        │
│      │  riquadro bordato          │        │
│      │  1 img | 2 img | video | testo │     │
│      └───────────────────────────┘        │
│  didascalia (testo in basso, opzionale)   │
└───────────────────────────────────────────┘
```

- Stato del player = `{ background, frame, caption, black, title }`. La console manda l'**intero stato** a ogni cambiamento; il player fa il diff e applica dissolvenze CSS (~400 ms). Questo rende banale ripristinare lo stato se la finestra viene riaperta e alimenta la miniatura di anteprima nella console.
- Il riquadro ha bordo e ombra configurabili in `campaign.json` (colore, spessore, dimensione % dello schermo); il mosaico affianca due immagini con `object-fit: contain`.
- Il testo per i giocatori usa un font grande, leggibile da lontano, con sfondo semitrasparente.

## Anteprima automatica della sessione

Bottone **Anteprima sessione** nella console:
- Scorre le scene in ordine; per ciascuna applica, nell'ordine, la prima cue di ogni tipo (background, frame/video, testo, audio), tiene la scena per N secondi (default 6, in `campaign.json`) e passa alla successiva.
- Controlli: pausa, precedente, successiva, stop; barra di avanzamento con nome scena.
- Opzioni: *audio silenziato* (default) e *solo nella miniatura della console* (per controllare senza aprire la finestra giocatori).
- Le scene senza cue vengono mostrate con il solo titolo, così si vedono subito i buchi.

## Console: layout

Tre colonne ridimensionabili, tema scuro:
1. **Sinistra**: selettore sessione, elenco scene (con pallino per scene senza cue), bottoni *Apri cartella campagna*, *Apri schermo giocatori* (stato ●), *Anteprima sessione*.
2. **Centro**: testo della scena corrente (grassetto, corsivo, elenchi); sotto, la **barra cue** della scena con i bottoni 1-click ordinabili per trascinamento; *＋ dalla libreria*, *＋ testo*, *＋ file al volo*.
3. **Destra**, a schede: **Schermo** (miniatura live + comandi globali + preset volume + slider), **Libreria** (tipo → chip tag → nome, griglia con miniature, "mostra ora" / "aggiungi come cue", tagging e gestione tag), **Storico**, **Appunti** (scena + sessione, autosalvati).

Scorciatoie: `B` nero, `Esc` chiudi riquadro, `Spazio` stop audio, `1/2/3` preset volume, `↑/↓` scena.

## Lettore .docx (zero dipendenze)

- `zip.js`: legge la central directory, per ogni entry usa `DecompressionStream('deflate-raw')` (Chrome/Edge ≥ 103) o slice per le entry non compresse.
- `docx.js`: `DOMParser` su `word/document.xml`; `word/styles.xml` per mappare `styleId → nome` (Word italiano usa id `Titolo1`/`Titolo2`, nomi `heading 1`/`heading 2`), con `w:outlineLvl` come fallback. Ogni heading apre una scena; run con `w:b`/`w:i`; `w:numPr` → elenco. Testo prima del primo titolo → scena "Introduzione".
- Immagini incorporate nel docx (`r:embed` → rels → `word/media/*`): mostrate inline nella console con bottone "manda ai giocatori" (seconda passata).

## Architettura: web-first con adattatore di piattaforma

Tutta la UI e la logica sono HTML/CSS/JS puri. Le sole parti che dipendono dall'ambiente stanno in un modulo `platform.js` con due implementazioni:

| funzione | Browser (file HTML) | Electron |
|---|---|---|
| apri cartella campagna | `showDirectoryPicker()`, handle in IndexedDB, click di conferma a ogni avvio | `dialog.showOpenDialog` + `fs`, percorso ricordato, nessun prompt |
| lettura media | `File` dall'handle, passato al player che crea il blob URL | `file://` diretto |
| scrittura `master.json` | `FileSystemWritableFileStream` | `fs.writeFile` |
| finestra giocatori | `window.open('', 'player')` + riferimento diretto; posizionamento con Window Management API se concesso, altrimenti trascinare + F11 | `BrowserWindow` sul display secondario (`screen.getAllDisplays`), `fullscreen: true`, riaperta automaticamente |
| stato al player | `playerWin.player.apply(state)` | `ipcRenderer` / `BroadcastChannel` |
| autoplay video con audio | serve un click iniziale nella finestra giocatori | disattivabile (`autoplayPolicy`) |

Così si parte dal file HTML singolo e, se serve, si aggiunge Electron dopo senza riscrivere nulla.

## Valutazione Electron

**Cosa risolve davvero**
- Finestra giocatori aperta **da sola sul secondo monitor**, a tutto schermo, senza trascinare né premere F11; se il proiettore viene collegato dopo, l'app la sposta.
- **Nessun prompt** di permesso sulla cartella a ogni avvio, nessun click di sblocco per l'audio dei video.
- File system completo: scansione della libreria istantanea anche con migliaia di file, scrittura diretta di `master.json`, apertura del docx associato con Word dalla console.
- Si consegna un `.exe` (o cartella portable) con tutto dentro: per l'utente finale il requisito "niente da installare" è rispettato.

**Cosa costa**
- Sul Mac di sviluppo servono Node.js e npm (solo lì). Il pacchetto finale pesa 90–150 MB.
- Build per Windows da Mac: `electron-builder` la fa, ma l'exe **non firmato** fa comparire l'avviso SmartScreen al primo avvio ("Esegui comunque"). Una versione *portable* (cartella zip con `master.exe`) evita l'installer ma non l'avviso.
- Ogni modifica richiede una nuova build da distribuire, contro il semplice "sostituisci il file .html".
- Tauri sarebbe più leggero (~10 MB) ma richiede Rust e la compilazione per Windows da Mac è scomoda: sconsigliato qui.

**Raccomandazione**: partire dal file HTML con `platform.js` già separato. Le nuove esigenze (sessioni, due livelli, mosaico, preset, testo, anteprima) sono tutte lato UI e non richiedono Electron. Aggiungere il wrapper Electron come fase finale se, alla prova sul campo, il click di conferma cartella e il posizionamento manuale della finestra risultano fastidiosi. L'aggiunta è ~150 righe (`main.js` + `preload.js` + implementazione Electron di `platform.js`).

## Struttura del progetto

```
master/
  src/
    index.html      # console + <template> per la finestra giocatori
    styles.css
    app.js          # stato, UI console, sessioni, cue, libreria, storico, anteprima
    player.js       # rendering a due livelli, apply(state) con dissolvenze
    platform.js     # adattatore browser (poi anche electron)
    docx.js, zip.js
  build.sh          # inlinea src/* in dist/master.html (solo per lo sviluppo)
  dist/master.html
  electron/         # (fase opzionale) main.js, preload.js, package.json
  campagna-esempio/
  README.md
```

## Fasi

1. **Schermo a due livelli**: `player.js` con `apply(state)`, finestra giocatori da `window.open`, sfondo + riquadro (1/2 immagini, video, testo) + didascalia + nero, miniatura in console. Test con file caricati al volo.
2. **Cartella campagna e sessioni**: `platform.js` browser, `campaign.json`, elenco sessioni, `master.json`.
2b. **Libreria indicizzata**: scansione e riconciliazione di `media/` in `library.json`, griglia con miniature in cache, ricerca tipo → tag (filtrati per tipo, con conteggio) → nome, tagging singolo e multiplo con autocompletamento, gestione tag (rinomina/unisci/elimina/colore).
3. **Docx → scene**: `zip.js` + `docx.js`, elenco scene, rendering testo.
4. **Cue e audio**: barra cue per scena (aggiunta da libreria/testo/file al volo, riordino), player audio con preset e dissolvenza, storico, appunti.
5. **Anteprima sessione** con controlli e opzioni.
6. **Rifinitura**: Window Management API, scorciatoie, `build.sh`, README, cartella d'esempio.
7. **(Opzionale) Electron**: `electron/` + implementazione Electron di `platform.js`, build portable per Windows.

## Verifica

- `dist/master.html` aperto da `file://` in Chrome (Mac) e Edge (Windows): apertura cartella, riapertura al riavvio con un click, cambio sessione.
- Docx con 3 titoli, grassetti, elenchi → 3 scene corrette; docx da Word italiano e da LibreOffice.
- Scena con background + frame a 2 immagini + testo + audio: ogni cue applica il proprio livello senza toccare gli altri; *Chiudi riquadro* lascia lo sfondo; *Nero* copre tutto; riapertura finestra → stato identico.
- Libreria: "mostra ora" un file non associato; compare nello Storico; "aggiungi come cue" lo salva in `master.json`.
- Indice: aggiungere un file in `media/` e premere *Aggiorna* → compare come "da taggare"; taggare 3 file con tag diversi → selezionando tipo *audio* i chip mostrano solo i tag degli audio con conteggio corretto; ricerca tipo + tag + nome restringe correttamente; rinominare un tag aggiorna tutti i file; rimuovere un file dal disco → marcato *mancante* e la cue che lo usa mostra l'avviso; riaprire la cartella → tag conservati in `library.json`.
- Audio: seconda traccia ferma la prima; preset 1/2/3 cambiano volume con dissolvenza.
- Anteprima: scorre tutte le scene, si ferma/riprende, segnala le scene vuote.
- Vincolo dipendenze: `grep -E '<script src|<link' dist/master.html` non trova riferimenti esterni.
