# MasterMe – manuale d'uso

> Manuale completo in italiano. Panoramica in inglese: [README](../README.md).

Un unico file HTML (`dist/master.html`) per condurre sessioni di gioco di ruolo con due schermi:
il portatile del master (console) e uno schermo esterno per i giocatori.
Nessuna installazione: si apre con doppio click in **Chrome o Edge**.

## Avvio rapido

1. Copia `dist/master.html` dove vuoi (anche dentro la cartella della campagna).
2. Aprilo con Chrome o Edge.
3. **Apri campagna** → scegli la cartella della campagna (o una cartella vuota: vengono create `sessioni/` e `media/`). Consenti la modifica dei file quando il browser lo chiede.
4. Metti i documenti Word delle sessioni in `sessioni/` e i file media in `media/` (sottocartelle libere), poi premi ↻ o riapri.
5. **Schermo giocatori** apre la finestra da mettere sul secondo monitor: trascinala lì, cliccaci dentro (attiva audio/video e va a schermo intero; altrimenti F11).

Ai riavvii successivi basta un click su **Riapri** (il browser richiede una conferma di permesso sulla cartella).

## Struttura della cartella campagna

```
campagna/
  campaign.json      nome, preset volumi, aspetto riquadro, durata anteprima  (creato dall'app)
  library.json       indice dei media: tipo, etichetta, tag                   (creato dall'app)
  master.json        cue per sessione/scena, appunti, storico                 (creato dall'app)
  sessioni/          un .docx per sessione (un prefisso numerico ne fissa l'ordine: 01-…, 02-…)
  media/             immagini, video, audio; sottocartelle a piacere, ma due hanno un significato:
    personaggi/      immagini mostrate nella sezione 👤 Personaggi (primo pulsante: Riquadro)
    luoghi/          immagini mostrate nella sezione 🏞 Luoghi (primo pulsante: Sfondo)
    audio/           qualsiasi nome va bene: i file audio e video vengono riconosciuti dall'estensione
    importati/       file caricati al volo e poi importati dalla console
```

I file media possono essere aggiunti, spostati o rinominati in qualsiasi momento con Esplora file: al prossimo ↻ della libreria
vengono ritrovati. Un file spostato in un'altra sottocartella con lo stesso nome conserva i suoi tag.
Formati riconosciuti: immagini jpg, png, gif, webp, bmp, svg, avif; video mp4, webm, mov, m4v, mkv; audio mp3, ogg, wav, m4a, aac, flac, opus.

## Il documento della sessione

Il testo va scritto in Word con gli stili **Titolo 1** e **Titolo 2**: ogni titolo diventa una scena
nell'elenco a sinistra. Grassetto, corsivo, elenchi, tabelle e immagini incorporate vengono mostrati
nella console.
Lo stile **Titolo** (quello del documento) viene usato come titolo della sessione.
Il testo prima del primo titolo finisce nella scena "Introduzione".

Due stili hanno un significato speciale dentro una scena:

- **Titolo 3** apre un blocco **Note del Master**: il paragrafo con lo stile e tutto ciò che segue fino al prossimo titolo
  viene mostrato in un riquadro evidenziato, visibile solo nella console.
- **Titolo 4** è una **didascalia per i giocatori**: ogni paragrafo con questo stile compare nel testo come blocco 💬 e come
  cue nella barra della scena. Il master la attiva sul momento con un click (un secondo click la nasconde). Non viene mai
  caricata automaticamente con la scena.
  Accanto a ogni didascalia un selettore **💬 Didascalia / 🖼 Riquadro** sceglie dove mostrarla: in basso sopra lo sfondo
  oppure come scheda nel riquadro centrale. Un click sul selettore la mostra subito in quel modo e la scelta viene ricordata;
  se era già visibile nell'altro modo si sposta, se era già visibile in quel modo si nasconde. Nella barra cue l'icona indica
  il modo scelto e il tasto destro lo cambia.
  Per andare a capo dentro una didascalia usa **Maiusc+Invio**, oppure scrivi più paragrafi Titolo 4 uno dopo l'altro:
  diventano un'unica didascalia su più righe. Per avere due didascalie distinte lascia una **riga vuota** tra le due.

### Immagini nel documento

Le immagini incollate nel docx diventano cue della scena in cui si trovano, senza doverle copiare in `media/`.
Compaiono nel testo e nella barra cue con l'icona 🖼, oppure 🏞 se le hai impostate come sfondo.

- **Click**: l'immagine si accende nel riquadro, un secondo click la spegne. Più immagini accese formano un mosaico.
- **Usarla come sfondo**: tasto destro o ✎ sulla cue e scegli Sfondo. La scelta viene salvata e da lì il click accende e spegne lo sfondo.
- **Attivazione manuale**: come le didascalie, le immagini del documento non vengono caricate con la scena né mostrate
  nell'anteprima della sessione. Le mostra il master con un click quando servono.
- **Salvarla come cue**: durante la preparazione usa **＋ Cue** sull'immagine nel testo, oppure ✎ sulla cue e *Aggiungi come cue*,
  e scegli Sfondo o Riquadro. Diventa una cue salvata della scena come quelle della libreria: si carica con la scena, compare
  nell'anteprima e si riordina, rinomina ed elimina come le altre. Nel testo l'immagine è segnata "cue salvata".
  La cue resta collegata all'immagine anche se in Word ne aggiungi o riordini altre. Se cancelli l'immagine dal documento,
  la cue appare in rosso.
- **Nel testo**: passando sopra l'immagine compaiono i pulsanti 🏞 Sfondo e 🖼 Riquadro. Ognuno accende l'immagine in quel modo
  e, premuto di nuovo, la spegne.
- **Nome della cue**: è il *testo alternativo* dell'immagine in Word (tasto destro sull'immagine → Visualizza testo alternativo).
  Senza testo alternativo la cue si chiama "Immagine N del documento".
- **Formati**: JPG, PNG, GIF e WebP funzionano. EMF e WMF, tipici di disegni e grafici di Office, non sono visualizzabili dal browser
  e vengono segnalati nel testo.
- **Più sessioni**: immagini con lo stesso nome interno in documenti diversi restano distinte.

Esempio di struttura, con lo stile Word indicato tra parentesi:

```
Sessione 3 – La torre                      (Titolo)
Riassunto della sessione precedente…       (Normale: finisce nella scena "Introduzione")

La taverna del Cinghiale                   (Titolo 1  → scena)
I personaggi entrano nella taverna…        (Normale, con grassetto, corsivo, elenchi, tabelle, immagini)
  Il misterioso avventore                  (Titolo 2  → sotto-scena, nell'elenco rientrata)
  Nell'angolo un uomo incappucciato…       (Normale)
  Note del Master                          (Titolo 3  → blocco riservato, fino al prossimo titolo)
  L'oste mente sulla data…                 (Normale: fa parte delle note)
  [immagine incollata]                     (in linea nel testo → cue 🖼 da accendere nel riquadro)
  Sopra la porta: ⏎ «Chi entra, paghi»     (Titolo 4  → didascalia; ⏎ = Maiusc+Invio, a capo nella stessa didascalia)
  Nessuno ricorda chi l'abbia incisa.      (Titolo 4  subito sotto → continua la stessa didascalia)
                                           (riga vuota → separa le didascalie)
  L'oste vi fissa a lungo…                 (Titolo 4  → altra didascalia)
  Dopo le didascalie il testo torna normale.

La foresta di Brann                        (Titolo 1  → scena)
…
```

I file della libreria non si citano nel documento: si associano dalla console come cue, salvate in `master.json`
e agganciate al titolo della scena. Se rinomini un titolo, le cue associate compaiono come "cue senza scena": selezionale e spostale nella scena giusta.
Se modifichi il docx mentre la console è aperta, premi ↻ accanto al selettore di sessione per rileggerlo.

## Cue e caricamento della scena

Ogni scena ha una barra di bottoni 1-click (le **cue**), riordinabili per trascinamento e modificabili con ✎ o tasto destro:

| cue | effetto |
|---|---|
| 🏞 Sfondo | immagine del luogo a tutto schermo; premuto di nuovo si spegne e torna lo sfondo della scena |
| 🖼 Riquadro | immagine in un riquadro bordato sopra lo sfondo; più cue immagine accese insieme formano un mosaico |
| 🎬 Video | video nel riquadro (o a tutto schermo), con audio |
| 📝 Testo | scheda nel riquadro, didascalia in basso o titolo grande |
| 🎵 Audio | una traccia alla volta; con preset di volume e loop |

Si aggiungono dalla **Libreria** (bottone ＋ su ogni file, oppure selezione multipla → ＋ cue per un mosaico fisso fino a 4 immagini),
con **＋ testo**, o con **＋ file al volo** / trascinando file sulla console (cue tratteggiate, temporanee: con ✎ → *Importa in libreria* diventano permanenti).

### Mosaico

Le cue immagine nella barra della scena si accendono e si spengono una per una. Con il riquadro dell'oste acceso, un click su
un'altra cue immagine la aggiunge accanto e forma un mosaico; un click su una cue accesa toglie solo quell'immagine e le altre restano.
Lo stesso vale per le immagini incorporate nel testo del documento. Il mosaico contiene al massimo **4 immagini**:
2 affiancate, 3 in fila, 4 in una griglia due per due. Oltre il limite compare un avviso e bisogna spegnerne una.
I pulsanti della libreria invece sostituiscono il contenuto del riquadro, e un video o una scheda di testo prendono il posto del mosaico.

### Sfondo

Ogni click su uno sfondo già acceso lo spegne: vale per le cue sfondo, per il pulsante Sfondo della libreria e per le immagini del documento.
Spento uno sfondo, torna lo **sfondo della scena**: la prima cue sfondo della scena corrente. Se la scena non ne ha, o se hai spento
proprio quello, la console cerca a ritroso nelle scene precedenti finché ne trova uno. Se non ne trova, lo sfondo resta vuoto.

Lo stesso vale quando carichi una scena senza cue sfondo: resta o ritorna lo sfondo dell'ultima scena precedente che ne ha uno.
Così, saltando da una scena all'altra, i giocatori vedono sempre il luogo giusto.

Selezionando una scena nell'elenco a sinistra (o con `↑` `↓`) vengono applicate subito le cue previste: la prima cue di sfondo,
la prima di riquadro o video, la prima di testo e la prima audio con il suo preset. Vengono caricate solo le cue salvate dalla console:
immagini e didascalie del documento restano spente finché il master non le attiva.

Al cambio di scena il riquadro e la didascalia della scena precedente si chiudono sempre, anche se la nuova scena non ha cue.
Resta solo lo sfondo, finché la nuova scena non ne prevede un altro. L'audio continua finché la nuova scena non ne prevede un altro.
Con il caricamento automatico disattivato, selezionare una scena non cambia lo schermo dei giocatori: il cambio avviene con **▶ Carica scena**. Lo stesso fa il bottone **▶ Carica scena**
accanto al titolo (tasto `Invio`). Se preferisci sfogliare le scene senza mostrare nulla ai giocatori, disattiva
"Carica le cue previste quando selezioni una scena" nelle impostazioni ⚙ e usa solo il bottone.
Le didascalie del documento (Titolo 4) non vengono mai caricate automaticamente.

## Libreria

I file di `media/` vengono indicizzati per tipo e **tag liberi**, e mostrati in sezioni: 👤 Personaggi, 🏞 Luoghi, 🖼 altre immagini, 🎬 Video, 🎵 Audio.
Le immagini finiscono in Personaggi o Luoghi in base alla sottocartella (`media/personaggi/…`, `media/luoghi/…`; valgono anche
nomi come `pg`, `characters`, `sfondi`, `mappe`, `locations`). Le sezioni si chiudono e riaprono cliccando l'intestazione. Ricerca: tipo → tag (compaiono solo i tag presenti in quel tipo, con conteggio) → nome.
✎ su un file per etichetta e tag; selezione multipla per aggiungere/togliere tag a più file; 🏷 per rinominare, unire, eliminare o colorare i tag.
I file nuovi sono segnalati come "da taggare"; quelli spariti restano marcati come mancanti finché non li rimuovi.

## Scorciatoie

`B` schermo nero · `Esc` chiudi riquadro · `Spazio` stop audio · `1` `2` `3` preset volume · `↑` `↓` cambia scena · `Invio` carica scena

Nella finestra giocatori: `F` schermo intero.

## Anteprima sessione

Scorre tutte le scene applicando la prima cue di ogni tipo per N secondi (impostazioni), con pausa/avanti/indietro.
Usa solo le cue salvate dalla console, non immagini e didascalie del documento. Le scene senza cue da caricare mostrano solo il titolo. Al termine viene ripristinato lo stato precedente.

## Sviluppo

Sorgenti in `src/` (HTML, CSS e JS separati). `./build.sh` genera `dist/master.html` inlineando tutto.
Non servono Node né npm; `node --check src/*.js` è utile per controllare la sintassi.
Per una prova rapida senza toccare file veri: `python3 -m http.server 8765` nella cartella del progetto e aprire
`http://127.0.0.1:8765/dist/master.html`; la cartella `campagna-esempio/` contiene due sessioni e qualche media di prova.

Limiti del browser, per cui esiste l'opzione futura Electron (vedi `docs/html-based.md`):
a ogni avvio serve un click per riconfermare l'accesso alla cartella; la finestra giocatori va cliccata una volta per abilitare
l'audio dei video; su Chrome/Edge con permesso "gestione finestre" viene spostata da sola sul secondo schermo, altrimenti a mano.
