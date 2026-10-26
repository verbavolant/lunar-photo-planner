# Manuale utente — Lunar Photo Planner

> **Scopo:** capire, per una foto della Luna sopra un soggetto reale (edificio, torre, campanile, montagna), **dove mettersi**, **a che ora** scattare e **con quale geometria** apparirà la Luna rispetto al soggetto.
>
> **Sito pubblico:** <https://verbavolant.github.io/lunar-photo-planner/> — nessuna registrazione, nessuna chiave da inserire: i dati 3D arrivano già dalla configurazione del sito.
>
> Per installare ed eseguire l'app in locale, o per modificare il codice: vedi [`README.md`](README.md).
>
> Riferimento di questo manuale: branch `main`, commit `ac1375c` (ottobre 2026) — interfaccia delle Fasi 1–4 + provider 3D configurabile (Fase 5b).

---

## Indice

1. [Che cos'è (e cosa non è)](#1-che-cosè-e-cosa-non-è)
2. [Requisiti](#2-requisiti)
3. [L'interfaccia in una schermata](#3-linterfaccia-in-una-schermata)
4. [Navigare la scena 3D](#4-navigare-la-scena-3d)
5. [Primo uso: 7 passi](#5-primo-uso-7-passi)
6. [Riferimento completo dei comandi](#6-riferimento-completo-dei-comandi)
7. [Leggere i numeri (con esempi)](#7-leggere-i-numeri-con-esempi)
8. [Trovare l'istante giusto: Cerca allineamenti Luna](#8-trovare-listante-giusto-cerca-allineamenti-luna)
9. [Parametri nell'URL (`?provider=`, `?tileMaxM=`)](#9-parametri-nellurl-provider-tilemaxm)
10. [Eseguire l'app in locale](#10-eseguire-lapp-in-locale)
11. [Messaggi a schermo e problemi frequenti](#11-messaggi-a-schermo-e-problemi-frequenti)
12. [Limitazioni dichiarate e precisione](#12-limitazioni-dichiarate-e-precisione)
13. [Crediti, dati e privacy](#13-crediti-dati-e-privacy)
14. [Glossario](#14-glossario)

---

## 1. Che cos'è (e cosa non è)

**Che cos'è.** Un pianificatore di fotografie lunari in scena 3D fotorealistica:

- piazze, edifici e montagne visibili in 3D (Google Photorealistic 3D Tiles, serviti da Cesium ion o dalla Map Tiles API a seconda di come è configurato il sito: [§9](#9-parametri-nellurl-provider-tilemaxm));
- posizione della Luna **topocentrica** — cioè calcolata per il punto in cui ti metterai tu, con la parallasse corretta;
- misure reali tra te e il soggetto: distanze, azimut, dislivello, angolo verticale;
- ricerca automatica dei prossimi istanti in cui la Luna passa sulla linea **Osservatore → Target**;
- fase lunare (frazione illuminata) all'orario che stai usando.

**Cosa non (ancora) è:**

- **non** simula la fotocamera: non ci sono sensore, focale, inquadratura o "Luna nel frame". Il calcolo dell'inquadratura va fatto a mano: [formula e esempio §7](#73-dal-numero-alla-focale).
- **non** calcola l'occlusione: la linea verde tra te e il soggetto è geometrica, non dice se un edificio la interrompe. Va verificato a occhio ruotando la scena (il ray casting è previsto in una fase successiva).
- **non** cerca lui il posto: la ricerca inversa (dati il soggetto, trova luogo + data + ora) è la Fase 7 e non è implementata.

---

## 2. Requisiti

| Voce | Cosa serve |
|---|---|
| Dispositivo | PC/portatile (o tablet) con browser recente abilitato alla grafica **WebGL** — Chrome, Edge, Firefox, Safari aggiornati. La scena 3D è pesante: serve una connessione veloce (i tile 3D si scaricano durante la navigazione). |
| Account | **Nessuno**, per usare il sito pubblico. |
| Chiavi API | **Nessuna**, per usare il sito pubblico. Servono solo se esegui l'app in locale: vedi [§10](#10-eseguire-lapp-in-locale). |
| Dati tuoi | L'app non ha un backend e non invia i tuoi punti da nessuna parte: i punti che posizioni restano in memoria e si perdono ricaricando la pagina. Unica eccezione: la **Home dell'Osservatore** (pulsante `Imposta come Home`) è salvata nel **localStorage** del tuo browser e resta finché non la sovrascrivi con un'altra o cancelli i dati del sito. |
| Fuso orario | È quello del **tuo browser/device**. Se pianifichi uno scatto in un altro Paese, regola l'orologio del dispositivo o considera lo scostamento. |

---

## 3. L'interfaccia in una schermata

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BARRETTA COMANDI  Osservatore · Target · Azzera · Vai a Home ·           │
│    Imposta come Home · Vista Luna · Sopra Observer · 100 m ·             │
│    Cerca allineamenti Luna      Sviluppo: T-059                          │
├───────────────────────────┬──────────────────────────────────────────────┤
│ BOX LATERALE (≈380 px)    │                                              │
│  • POV camera             │            SCENA 3D                          │
│  • Osservatore (quota,    │   (trascina, zoom, clic per posizionare)     │
│    altezza, spostamenti)  │   marker ciano = Osservatore                 │
│  • Dati (misure + Luna)   │   marker arancione = Target                  │
│  • Cerca allineamenti     │   linea verde = linea di vista               │
│    (finestra di ricerca)  │   disco = Luna (posa e dimensione reali)     │
├───────────────────────────┴──────────────────────────────────────────────┤
│ CARD TEMPO  Data/ora (fuso: …) · −1/+1 min · slider ±720 min · Adesso    │
│ Orario in uso: 21/10/2026 19:42 · Tempo effettivo (UTC): 17:42:00 UTC    │
│ Fase lunare (a destra dello slider): disco + 62% C (crescente)           │
└──────────────────────────────────────────────────────────────────────────┘
```

Tre zone, nessuna zona morta: i pannelli non coprono la scena, quindi trascinamento, zoom e clic funzionano su tutta l'area del canvas.

Gli **avvisi** (caricamento tile, limiti di richieste, parametri non validi) appaiono centrati in alto sulla scena e spariscono quando il problema si risolve. In basso a destra restano i **crediti** richiesti dai provider (Cesium ion, Google): sono un obbligo contrattuale dei dati, non si possono nascondere.

---

## 4. Navigare la scena 3D

La scena è una comune vista 3D tipo CesiumJS (il pulsante "?" di Cesium è disattivato nell'app: i comandi sono questi).

| Azione | Mouse | Touch |
|---|---|---|
| Spostare la vista (pan) | clic sinistro + trascina | trascinamento con un dito |
| Zoom | clic destro + trascina, oppure rotellina | pizzica con due dita |
| Ruotare / inclinare | clic centrale + trascina, oppure CTRL + clic sinistro/destro + trascina | due dita nella stessa direzione = inclina; due dita in direzioni opposte = ruota |
| **Posizionare un punto** | **un clic singolo, senza trascinare** | un tocco secco |

> **Il clic posiziona solo se non trascini.** Se muovi il mouse di qualche pixel tra pressione e rilascio, la scena interpreta il gesto come pan e **non** posiziona il punto: riprova con un clic secco.

Sotto la superficie, se i tile 3D non sono caricati, resta il globo "nudo": puoi continuare a navigare, ruotare e posizionare i punti, ma le quote saranno quelle dell'ellissoide (né edifici né terreno). Vedi [§11](#11-messaggi-a-schermo-e-problemi-frequenti).

---

## 5. Primo uso: 7 passi

Esempio: vuoi fotografare la Luna appena sopra la torre del tuo paese.

**Passo 1 — Apri il sito e aspetta la mesh.**
<https://verbavolant.github.io/lunar-photo-planner/>. La prima volta scarica parecchi dati: se vedi un globo grigio mentre carica, è normale. Si può lavorare anche prima che finisca.

**Passo 2 — Vai sul posto.**
Premi **`Vai a Home`** per un volo di prova su Piazza della Loggia a Brescia (45.5397°N 10.2197°E, camera a ≈500 m dal suolo; se hai già salvato una Home con `Imposta come Home`, il volo parte dal punto salvato e riporta l'Osservatore lì). **Non c'è una barra di ricerca indirizzi**: per raggiungere il tuo soggetto naviga a mano con zoom e pan, partendo da una vista ampia della zona e avvicinandoti progressivamente. Le coordinate del punto sotto la camera le leggi in tempo reale nella card **POV camera**: quando i valori corrispondono a quelli che hai ricavato da una mappa, sei arrivato.

**Passo 3 — Posiziona l'Osservatore** (il punto da cui scatti).
Clicca il pulsante **`Osservatore: — clicca sulla scena`** (diventa evidenziato = punto attivo), poi **un clic secco** sul marciapiede/prato dove ti metterai. Compare un **marker ciano** e il pulsante mostra le coordinate lette, ad es. `Osservatore: 45.539210°N 10.219100°E · 152 m`.

**Passo 4 — Posiziona il Target** (il soggetto).
Clicca **`Target: — clicca sulla scena`**, poi clic secco **sulla cima** del soggetto (non alla base: il valore utile è l'angolo verticale verso la cima). Compare il **marker arancione** e una **linea verde** tra i due punti. Nel box a sinistra appaiono le misure.

**Passo 5 — Mettiti nel punto di ripresa giusto.**
Nella card **Osservatore** usa `▲ avanti`, `▼ indietro`, `◀ sinistra`, `▶ destra` (passo 1 / 10 / 100 m) per micro-posizionarti: le direzioni sono **relative alla vista corrente**, e la camera segue il punto. Poi imposta l'**Altezza dal suolo** (`−` / campo numerico / `+`, passo 1 / 10 / 100 m) = altezza della tua testa o del treppiede dal punto in cui hai cliccato (1,7 m a mano libera, 1,5 m col treppiede, ecc.). Se questo è il tuo punto di ripresa abituale, premi **`Imposta come Home`** nella barra in alto: la posizione è salvata nel browser e al prossimo avvio l'app riparte da lì.

**Passo 6 — Dai l'ora.**
Nella **card Tempo** in basso: imposta `Data/ora` (è l'ora locale del tuo fuso), rifinisci con `−1 min` / `+1 min`, oppure sposta lo **slider** (−720…+720 min, passi di 5 min) per "vedere scorrere" il cielo. `Adesso` riporta tutto all'ora corrente. Controlla nella card **Dati** le righe `Luna · Azimut`, `Luna · Altitudine` (se è negativa la Luna è sotto l'orizzonte), `Luna · Diametro`, e il blocco **Fase lunare** a destra dello slider; accanto allo slider leggi sempre **`Orario in uso: …`**, l'orario effettivo che usano tutti i calcoli.

**Passo 7 — Guarda l'inquadratura e cerca l'istante.**
Premi **`Vista Luna`**: la camera si mette 1 m sopra l'Osservatore, rivolta verso la Luna con la sua altitudine reale. Premi **`Sopra Observer · 100 m`** per la vista in pianta (nord in alto), così verifichi la geometria. Premi infine **`Cerca allineamenti Luna`** per farti dire **quando** la Luna passa esattamente sulla linea Osservatore→Target: [§8](#8-trovare-listante-giusto-cerca-allineamenti-luna).

---

## 6. Riferimento completo dei comandi

### 6.1 Barra comandi (in alto)

| Pulsante | Cosa fa | Note |
|---|---|---|
| `Osservatore: — clicca sulla scena` | seleziona l'Osservatore come **punto attivo**; il clic successivo sulla scena lo posiziona | quando è attivo è evidenziato in azzurro; dopo il posizionamento mostra latitudine, longitudine e quota lette, es. `Osservatore: 45.539210°N 10.219100°E · 152 m` |
| `Target: — clicca sulla scena` | idem per il **Target** (il soggetto) | marker arancione |
| `Azzera` | rimuove **il punto attivo** (quello selezionato nel pulsante precedente) | azzerando l'Osservatore si azzera anche il riferimento dell'altezza dal suolo |
| `Vai a Home` | con **Home salvata**: volo nadirale sul punto salvato **e riporta l'Osservatore su quel punto** (con il suolo di riferimento del salvataggio); **senza Home**: volo nadirale su Piazza della Loggia, Brescia, a ≈500 m dal suolo, senza toccare l'Osservatore | utile per "rientrare" dopo una navigazione persa o dopo aver spostato l'Osservatore |
| `Imposta come Home` | salva la posizione corrente dell'Osservatore (coordinate, quota e suolo di riferimento) come **Home** nel `localStorage` del browser: al prossimo avvio l'app riparte da lì e `Vai a Home` ci riporta | disabilitato finché l'Osservatore non è posizionato; una sola Home per browser: risalvando la sovrascrivi |
| `Vista Luna` | camera **1 m sopra l'Osservatore**, orientata con azimut = azimut della Luna e inclinazione = altitudine della Luna (volo animato di 2 s) | richiede l'Osservatore. È la posa del fotografo: da qui vedi la Luna dove la vedrai davvero |
| `Sopra Observer · 100 m` | vista dall'alto 100 m sopra l'Osservatore, puntato su di lui, nord in alto | disabilitato finché l'Osservatore non è posizionato |
| `Cerca allineamenti Luna` | apre la finestra di ricerca degli allineamenti | disabilitato se mancano Osservatore o Target |
| `Manuale` | apre questo manuale in una **finestra separata**, formattato in HTML | il contenuto è `MANUALE.md` alla root del repository; i collegamenti ai file del repo (es. `README.md`) portano a GitHub |

A destra della barra, oltre ai pulsanti: **`Sviluppo: T-059`** — l'ID dell'ultimo task completato nel piano di sviluppo del progetto; si aggiorna a ogni task chiuso. L'orario in uso non sta qui: è nella card Tempo, accanto allo slider ([§6.7](#67-card-tempo-fascia-in-basso-tutta-larghezza)).

> **Il punto attivo comanda il clic sulla scena.** Se dopo aver posizionato il Target lasci `Target` selezionato e clicchi sulla scena, sposti il **Target**, non l'Osservatore. Controlla quale dei due pulsanti è evidenziato.

### 6.2 Card "POV camera" (box laterale, in alto)

La vista corrente della camera in numeri, aggiornata circa 10 volte al secondo mentre navighi.

| Riga | Significato |
|---|---|
| `Latitudine` / `Longitudine` | posizione della **camera** (non dell'Osservatore), con emisfero N/S E/O |
| `Quota (ellissoide)` | altezza della camera sopra l'ellissoide WGS84, in metri |
| `Azimut` | direzione di vista, 0° = nord, in senso orario, 0–360° |
| `Inclinazione` | angolo verticale della camera: positivo = verso l'alto, 0° = orizzonte, negativo = verso il suolo |

Dopo `Vista Luna` la camera sta sull'Osservatore (1 m sopra): la card mostra quindi il **punto di vista del fotografo**, con l'azimut e l'inclinazione reali della Luna.

### 6.3 Blocco "Fase lunare" (barra in basso, a destra dello slider)

Titolo, **disco lunare** disegnato con la **frazione illuminata reale** all'orario in uso, più l'etichetta testuale: `62% C (crescente)` oppure `38% D (decrescente)` — `C`/`D` = crescente/decrescente. Il blocco è alla **destra della riga dello slider** nella fascia in basso (card Tempo, stessa riga dei comandi data/ora) e segue automaticamente l'orario in uso: slider, ±1 min e istanti adottati dalla ricerca allineamenti.

> Il disco è una rappresentazione **equivalente** (orientamento del limbo convenzionale, emisfero boreale): i **numeri** (frazione illuminata, azimut, altitudine, diametro) vengono dai calcoli reali.

### 6.4 Card "Osservatore" (compare dopo il posizionamento)

| Campo / controllo | Cosa fa |
|---|---|
| `Quota (ellissoide)` | quota del punto in metri sopra l'ellissoide WGS84 |
| `Altezza dal suolo` | differenza tra la quota corrente e la quota del punto dove hai cliccato |
| `−` / campo numerico / `+` con `passo` 1 m · 10 m · 100 m | alza o abbassa l'Osservatore dal suolo; nel campo puoi scrivere direttamente il valore in metri (clamp 0–20.000 m) |
| `▲ avanti` / `▼ indietro` / `◀ sinistra` / `▶ destra` con `passo` 1 m · 10 m · 100 m | sposta l'Osservatore **rispetto alla direzione di vista corrente** della camera, e la vista segue il punto |

Due dettagli operativi:

1. **"avanti/destra" non sono il nord:** sono avanti/destra *rispetto a dove stai guardando*. Se ruoti la camera, cambia anche il significato dei quattro pulsanti. Per riferimenti stabili usa la vista `Sopra Observer · 100 m` (nord in alto).
2. **Il suolo di riferimento è quello del clic** e non viene rimisurato quando ti sposti in orizzontale o in verticale: se ti sposti su un terreno molto diverso (da piazza a colle), riposiziona l'Osservatore con un nuovo clic, così `Altezza dal suolo` riparte da 0 sul nuovo punto.

### 6.5 Card "Dati" (misure, Luna, allineamento ora)

Compare appena posizioni almeno un punto. Senza Osservatore mostra solo il suggerimento `Posiziona l'Osservatore per i valori della Luna.`

**Blocco Observer → Target** (serve **tutti e due** i punti):

| Riga | Valore |
|---|---|
| `Distanza superficie` | distanza geodetica lungo l'ellissoide (WGS84), in m o km |
| `Distanza linea d'aria` | distanza in linea retta 3D tra i due punti, in m o km |
| `Azimut iniziale` | direzione da cui parti guardando il Target (0° = nord, senso orario) |
| `Azimut finale` | direzione dell'ultimo tratto (diversa dall'iniziale sulle distanze lunghe, per la curvatura) |
| `Differenza quota` | Target − Osservatore, in metri, sempre col segno (`+`/`-`) |
| `Angolo verticale` | quanto il Target è **sopra** (positivo) o **sotto** (negativo) il tuo orizzonte |

**Blocco Luna** (serve l'Osservatore, calcolato **topocentrico** per quel punto):

| Riga | Valore |
|---|---|
| `Luna · Azimut` | direzione della Luna, 0° = nord, senso orario, 0–360° |
| `Luna · Altitudine` | altezza sopra l'orizzonte; **negativa = Luna sotto l'orizzonte** (non fotografabile) |
| `Luna · Distanza` | distanza reale Osservatore → Luna (varia nel mese: perigeo/apogeo) |
| `Luna · Diametro` | diametro angolare apparente in gradi (è la "dimensione" della Luna nel cielo in quell'istante) |

**Blocco Allineamento ora** (serve **tutti e due** i punti):

| Riga | Valore |
|---|---|
| `Allineamento ora · Separazione` | distanza angolare reale tra il **centro della Luna** e la **linea di vista Osservatore→Target** all'orario in uso: è la stessa misura `sep` dei risultati della ricerca (§6.6); più è piccola, più la Luna è centrata sulla linea |
| `Allineamento ora · Offset` | scarto della Luna dalla linea, **stessa notazione** delle righe risultato (es. `0,11° a destra · 0,29° sopra`; `in azimut`/`in quota` = scarto nullo su quell'asse, < 0,005°) |

Serve a verificare l'allineamento **all'orario corrente** senza aprire la ricerca: le righe si aggiornano con lo slider, i pulsanti `±1 min` e quando adotti un candidato. Se Observer e Target coincidono le righe non compaiono (linea di vista indefinita).

I numeri sono formattati all'italiana (virgola decimale, punto per le migliaia). Se una riga mostra `—` il valore non è calcolabile in quel momento: vedi [§11](#11-messaggi-a-schermo-e-problemi-frequenti).

### 6.6 Finestra di ricerca "Cerca allineamenti Luna"

Si apre con `Cerca allineamenti Luna` (Osservatore e Target entrambi posizionati). Intestazione: **`Luna sulla linea Observer→Target`**, con `Ricalcola` e `×` (chiudi).

| Parametro | Intervallo | Default | Effetto |
|---|---|---|---|
| `Finestra (giorni)` | 1–365 | 60 | giorni esplorati a partire dall'orario in uso |
| `Passo (min)` | 1–60 | 15 | campionamento della ricerca (più piccolo = più lento ma più fine) |
| `Tolleranza (°)` | 0,05–10 (passi 0,05) | 5 | separazione angolare massima per considerare la Luna "sulla linea" |
| `Ricerca da` | data/ora locale, anche nel passato | orario effettivo al primo avvio | istante di partenza della ricerca; la fine è inizio + `Finestra (giorni)` |

Il campo `Ricerca da` (data/ora locale, **anche nel passato**) è l'istante di partenza della ricerca: al primo avvio contiene l'orario effettivo; la fine della finestra è inizio + `Finestra (giorni)`. La ricerca restituisce al massimo 8 candidati, **i migliori per separazione**. Se trova più passaggi di quanti ne mostra compare `Trovati N passaggi · mostro i primi M (i migliori per separazione)`; se alcuni passaggi hanno la Luna sotto l'orizzonte compare anche `N passaggi scartati (Luna sotto l'orizzonte)`. Dopo l'adozione il campo resta com'è, così l'elenco mostrato corrisponde sempre al campo: per cercare da un altro istante modificalo e premi `Ricalcola` (se il campo è vuoto o invalido la ricerca parte dall'orario effettivo e il campo torna a mostrarlo).

Ogni riga risultato è un pulsante cliccabile:

```
21/10/2026 19:40 · sep 0,32° · 0,11° a destra · 0,29° sopra
fase 96% C (crescente)
```

| Pezzo | Significato |
|---|---|
| `21/10/2026 19:40` | istante in **ora locale** del tuo fuso |
| `sep 0,32°` | separazione angolare reale Luna ↔ linea di vista (più piccolo = più centrato) |
| `0,11° a destra` / `a sinistra` | scarto di azimut, guardando lungo la linea Osservatore→Target |
| `0,29° sopra` / `sotto` | scarto di altitudine rispetto alla linea |
| `in azimut` / `in quota` | scarto praticamente nullo su quell'asse (< 0,005°): la Luna è centrata |
| `fase 96% C (crescente)` | fase lunare in quell'istante |

**Cliccare una riga adotta quell'istante** e la mette **in grassetto** finché non ne adotti un'altra o premi `Ricalcola`: `Data/ora` viene impostato, lo slider torna a 0 e tutto il resto (Luna in scena, blocco Fase lunare, righe **Luna ·**) si ricalcola su quell'ora. **La finestra resta aperta** con l'elenco: puoi adottare un altro istante senza ripetere la ricerca; `Ricalcola` riparte dal campo `Ricerca da`, non dall'orario adottato.

### 6.7 Card "Tempo" (fascia in basso, tutta larghezza)

| Controllo | Cosa fa |
|---|---|
| `Data/ora (fuso: Europe/Rome)` | input data+ora **locale** (precisione al minuto) |
| `−1 min` / `+1 min` | regola l'orario di 1 minuto **senza** muovere lo slider |
| slider `−720 … +720` (passi 5) | scostamento in minuti dall'orario impostato, etichettato `+N min` / `-N min` |
| `Adesso` | riporta l'orario all'istante corrente e lo slider a 0 |
| riga di stato | `Tempo effettivo (UTC): 2026-10-21 17:40:00 UTC · ora locale UTC+02:00 (con ora legale/solare del fuso Europe/Rome)` |

Accanto allo slider, a sinistra: **`Orario in uso: …`** — l'orario effettivo della scena, aggiornato in tempo reale da slider, `−1 min`/`+1 min` e adozioni dei risultati. Alla **destra dello slider**: il blocco **Fase lunare** ([§6.3](#63-blocco-fase-lunare-barra-in-basso-a-destra-dello-slider)) — titolo, disco e percentuale all'orario in uso.

L'orario usato per **tutto** (Luna, fase, misure lunari) è `Data/ora + scostamento dello slider`, cioè il **Tempo effettivo** mostrato nella riga di stato. Lo stesso valore viene scritto nell'orologio interno della scena 3D (la cui animazione resta ferma).

> Attenzione a cosa è simulato e cosa no: i **numeri** e la **posizione** della Luna seguono il Tempo effettivo, ma l'**illuminazione dinamica del suolo non è attivata** → i tile 3D restano chiari come in pieno giorno anche a mezzanotte. La scena serve a valutare la **geometria**, non l'esposizione dello scatto.

---

## 7. Leggere i numeri (con esempi)

> I valori negli esempi sono **ipotesi illustrative**: nel tuo caso leggi i numeri veri nella card **Dati**.

### 7.1 Azimut e altitudine: le convenzioni

- **Azimut**: 0° = nord, 90° = est, 180° = sud, 270° = ovest; cresce in senso orario, intervallo 0–360°.
- **Altitudine / Angolo verticale / Inclinazione**: gradi sopra l'orizzonte. Positivo = sopra, negativo = sotto. 0° = esattamente all'orizzonte.
- **Diametro della Luna**: diametro angolare apparente in gradi. È il "righello" del cielo: tutto ciò che confronti con la Luna si misura in suoi multipli.

### 7.2 "La Luna è in linea col soggetto?" — criterio numerico

Siano, letti dalla card Dati:

| Grandezza | Esempio |
|---|---|
| `Azimut iniziale` (Osservatore → Target) | `112,40°` |
| `Angolo verticale` (cima del Target) | `3,40°` |
| `Luna · Azimut` | `112,51°` |
| `Luna · Altitudine` | `3,66°` |
| `Luna · Diametro` | `0,52°` |

1. **Direzione:** 112,51 − 112,40 = **0,11°** → praticamente in linea (a 500 m dal soggetto, 0,1° ≈ 0,9 m di errore laterale).
2. **Verticale:** la Luna è **centrata** sulla cima quando `Luna · Altitudine` = `Angolo verticale`. Per averla **appoggiata sopra** la cima, il centro deve stare di mezza Luna più in alto:
   `Angolo verticale + (Luna · Diametro)/2` = 3,40 + 0,26 = **3,66°** → nell'esempio è l'istante giusto.
3. **Quante Lune sopra la cima:** 3,40 ÷ 0,52 ≈ **6,5 diametri** → con l'altitudine a 3,40° la Luna sarebbe interamente sopra il soggetto di circa sei diametri.
4. **È sopra l'orizzonte?** `Luna · Altitudine` deve essere **positiva** (con orizzonte ostruito — alberi, cornicioni, colline — servono alcuni gradi in più).

### 7.3 Dal numero alla focale

Questa parte **non è (ancora) nell'app**: non esistono card Fotocamera né simulazione dell'inquadratura. Il calcolo è a mano, con la formula dell'angolo di campo usata nel progetto (`src/equipment/equipment.ts`, verificata dai test):

```
FOV = 2 · arctan( d / (2 · f) )
```

con `d` = dimensione del sensore nella direzione che ti interessa (mm) e `f` = focale (mm).

Esempio — full frame 36 × 24 mm, focale 600 mm, `Luna · Diametro` = 0,52°:

| Calcolo | Risultato |
|---|---|
| FOV orizzontale = 2·arctan(36 / (2·600)) | **3,44°** |
| FOV verticale = 2·arctan(24 / (2·600)) | **2,29°** |
| Immagine della Luna sul sensore = (0,52 / 3,44) × 36 mm | **≈ 5,5 mm** |
| Su un sensore da 6000 px di larghezza = (0,52 / 3,44) × 6000 | **≈ 908 px** |

Conseguenza pratica: a 600 mm su full frame un FOV di 3,44° significa che **0,11° di errore di azimut ≈ 190 px**, più di un quinto del diametro lunare. **La posizione del treppiede conta**: 1° di errore di azimut, con il soggetto a 500 m, vuol dire spostarsi di circa 9 m.

---

## 8. Trovare l'istante giusto: Cerca allineamenti Luna

La ricerca campiona il tempo e cerca gli istanti in cui il **centro del disco lunare** passa vicino alla **linea di vista Osservatore → Target**.

### 8.1 Preparazione

1. Posiziona **Osservatore** e **Target** (il Target va sul punto del soggetto che vuoi "toccare" con la Luna: cima, guglia, arco…).
2. Imposta un **Tempo effettivo** di partenza sensato (card Tempo): il campo `Ricerca da` della finestra parte **da lì**, non da mezzanotte. Se cerchi uno scatto al crepuscolo dei prossimi due mesi, mettiti già su una fascia serale; per cercare nel passato modifica direttamente `Ricerca da`.
3. Premi **`Cerca allineamenti Luna`**.

### 8.2 Scegliere i parametri

| Situazione | `Finestra (giorni)` | `Passo (min)` | `Tolleranza (°)` |
|---|---|---|---|
| Ricognizione rapida: "esiste un giorno buono?" | 60–365 | 15 | 1–5 |
| Cercare l'istante al minuto | 1–7 attorno alla data trovata | 1–5 | 0,2–0,5 |
| Allineamento stretto (Luna centrata su un'apertura) | 1–14 | 1 | 0,05–0,15 |

- La **tolleranza** è la separazione angolare massima tra centro della Luna e linea: 1° vuol dire "entro circa due diametri lunari".
- Per la Luna **appoggiata sopra** la cima non cercare la tolleranza minima: lasciala comoda (≈ 0,5–1°) e scegli tra i risultati la riga con `sopra` ≈ metà del valore di `Luna · Diametro`.
- Vengono restituiti **al massimo 8 risultati, i migliori per separazione** (non i più vicini nel tempo): la riga `Trovati N passaggi · mostro i primi M` ti dice quanti passaggi contiene la finestra. Per vederne altri restringi la finestra o la tolleranza, oppure sposta in avanti `Ricerca da` e premi `Ricalcola`.

### 8.3 Leggere e adottare i risultati

| Cosa vedi | Cosa fare |
|---|---|
| `sep` piccolo (es. `0,03°`) | allineamento ottimo: adotta l'istante |
| `0,31° a destra` | la Luna passa a destra della linea: spostati di qualche metro in senso opposto (`◀ sinistra`) e `Ricalcola`, oppure accettala se l'inquadratura lo consente |
| `0,31° a sinistra` | idem, al contrario (`▶ destra`) |
| `sopra` / `sotto` | scegli il distacco verticale che ti serve: 0 per centrare, metà diametro per appoggiare sopra |
| `fase 96% C (crescente)` | utile per decidere: una falce sottilissima non mostra i dettagli del soggetto in controluce |
| `Nessun allineamento nella finestra cercata.` | allarga `Tolleranza (°)` o `Finestra (giorni)`; se persiste, la Luna non passa mai a quell'azimut: verifica `Azimut iniziale` |
| `Trovati N passaggi · mostro i primi M (i migliori per separazione)` | la finestra contiene più passaggi di quanti ne mostra: gli M in lista sono quelli con `sep` più piccolo |
| `N passaggi scartati (Luna sotto l'orizzonte)` | passaggi trovati ma esclusi perché la Luna era sotto l'orizzonte (non fotografabili); il conteggio include i passaggi che altrimenti apparirebbero in lista |
| `Linea di vista indefinita: Observer e Target coincidono.` | i due punti sono sovrapposti: riposiziona l'Osservatore o il Target |

**Clicca la riga** per adottare l'istante: `Data/ora` si aggiorna, lo slider va a 0, la finestra resta aperta con l'elenco (puoi adottarne un altro subito); la riga adottata appare **in grassetto** finché non ne adotti un'altra o premi `Ricalcola`; blocco **Fase lunare** e righe **Luna ·** si ricalcolano su quell'istante.

### 8.4 Verifica finale in 3D (passaggio consigliato)

1. **`Vista Luna`** → sei negli occhi del fotografo: verifica che la Luna stia dove vuoi rispetto al soggetto (la card **POV camera** mostra azimut e inclinazione effettivi della camera).
2. **`Sopra Observer · 100 m`** → verifica in pianta che l'Osservatore cada in un punto **raggiungibile** (marciapiede, prato, parcheggio) e non dentro un edificio o in mezzo a un fiume.
3. **Ruota la camera** attorno al soggetto per cercare le **occlusioni** (alberi, cornicioni, cavi, piloni): l'app non calcola se la linea è interrotta, devi vederlo a occhio.
4. **Segna i valori** prima di andare sul posto: coordinate dal pulsante `Osservatore`, azimut (`Azimut iniziale` o card POV camera), orario in **locale e UTC** (riga di stato della card Tempo), fase lunare.

---

## 9. Parametri nell'URL (`?provider=`, `?tileMaxM=`)

Si aggiungono all'indirizzo del sito e si applicano **al caricamento della pagina**: basta ricaricare la pagina perché abbiano effetto.

```
https://verbavolant.github.io/lunar-photo-planner/?provider=google-ion&tileMaxM=1500
```

| Parametro | Valori | Default | A cosa serve |
|---|---|---|---|
| `provider` | `google`, `google-ion` (alias accettato: `cesium`) | `google` | sceglie da dove arrivano i tile 3D fotorealistici |
| `tileMaxM` | numero di metri > 0 | `1000` | distanza oltre la quale il dettaglio dei tile viene ridotto: valori piccoli = caricamento più leggero, valori grandi = più nitidezza in lontananza (e più dati) |

**`provider`.** Le due sorgenti sono la **stessa mesh** fotorealistica di Google, con percorso diverso:

- `google` → richiesta diretta alla Map Tiles API con la chiave configurata nel sito. Ogni caricamento consuma la quota del progetto Google di chi ospita il sito: se la quota è esaurita, la mesh non parte e compare l'avviso 429.
- `google-ion` → passa da Cesium ion, che serve i tile con una propria chiave: la quota del progetto Google dell'ospite non viene toccata. **Richiede che nel sito sia configurato un token ion**: se manca, appare l'avviso `Provider "google-ion" attivo ma senza token ion…` e la scena resta sul globo.

Se il sito pubblico non carica la mesh, provare `?provider=google-ion` è il primo tentativo utile (funziona solo se chi ospita ha configurato il token). Un valore non riconosciuto produce un avviso a schermo e il ritorno al default.

**`tileMaxM`.** Non è un taglio netto: oltre la distanza scelta i tile restano al livello di dettaglio del "genitore" (degradazione progressiva), così non si formano buchi. Utile:

- `?tileMaxM=500` su connessioni lente o per navigare velocemente;
- `?tileMaxM=2000` (o più) quando devi valutare dettagli lontani, ad esempio la sagoma di una cima vista da parecchi chilometri.

Un valore non numerico o ≤ 0 viene ignorato con avviso e si torna a 1000 m.

---

## 10. Eseguire l'app in locale

Serve solo a chi vuole modificarlo o provarlo offline. Il sito pubblico non richiede nessuna di queste operazioni.

```bash
npm install        # dipendenze
npm run dev        # server di sviluppo (url indicato nel terminale)
npm test           # test (Vitest)
npm run typecheck  # controllo tipi
npm run build      # build di produzione in dist/
npm run preview    # anteprima della build
```

La scena 3D ha bisogno di una delle due configurazioni (i valori reali **non** vanno mai committati):

| File `.env.local` | Quando |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY=<chiave>` con `Map Tiles API` abilitata e restrizioni HTTP referrer | provider `google` (default) |
| `VITE_CESIUM_ION_TOKEN=<token>` + `VITE_SCENE_PROVIDER=google-ion` | provider `google-ion` (account gratuito su <https://ion.cesium.com>, asset Google Photorealistic 3D Tiles abilitato nel token) |

Senza chiave o token l'app resta utilizzabile: si naviga sul globo e si posizionano i marker, con l'avviso a schermo che spiega cosa manca. I passi completi (Google Cloud Console, token ion, deploy su GitHub Pages) sono nel [`README.md`](README.md).

---

## 11. Messaggi a schermo e problemi frequenti

### 11.1 Gli avvisi compaiono centrati in alto sulla scena

| Messaggio (testo reale) | Perché appare | Cosa fare |
|---|---|---|
| `Limite di richieste <sorgente> raggiunto (429). La scena resta sulla vista base senza mesh 3D; nuovo tentativo automatico tra 30 s (tentativo 2 di 4).` | il provider dei tile ha risposto **429 / rate limit**. L'app **non** riprova subito: riprova dopo 30 s, poi 2 min, poi 10 min | aspetta senza ricaricare; intanto puoi lavorare sul globo (misure e calcoli funzionano lo stesso) |
| `Limite di richieste <sorgente> raggiunto (429). … nessun altro tentativo in questa sessione: ricarica la pagina per riprovare.` | esauriti i 4 tentativi | **ricarica la pagina** (F5). Se sei sul sito pubblico e succede spesso, prova `?provider=google-ion` ([§9](#9-parametri-nellurl-provider-tilemaxm)) |
| `Google Photorealistic 3D Tiles non attivi: imposta VITE_GOOGLE_MAPS_API_KEY in .env.local e riavvia il server di sviluppo.` | esecuzione locale con provider `google` e chiave assente | configura la chiave come in [§10](#10-eseguire-lapp-in-locale) |
| `Provider "google-ion" attivo ma senza token ion: imposta VITE_CESIUM_ION_TOKEN in .env.local (token da https://ion.cesium.com/tokens) e riavvia il server di sviluppo.` | provider `google-ion` senza token | configura il token ion (o, sul sito pubblico, segnalalo a chi lo ospita) |
| `Errore nel caricamento di <sorgente>: <dettaglio>.` | errore di rete/blocco del provider (non 429) | verifica la connessione, disattiva estensioni che bloccano le richieste, ricarica |
| `Provider non valido: "xyz" (valori ammessi: google, google-ion (alias: cesium)).` | `?provider=` scritto male | correggi o rimuovi il parametro |
| `Parametro "tileMaxM" non valido: "abc" (atteso un numero di metri > 0).` | `?tileMaxM=` non numerico o ≤ 0 | correggi; intanto vale il default 1000 m |
| `Linea di vista indefinita: Observer e Target coincidono.` | hai cliccato lo stesso punto per entrambi | riposiziona uno dei due |
| `Nessun allineamento nella finestra cercata.` | la Luna non passa entro la tolleranza nella finestra | allarga `Tolleranza (°)` o `Finestra (giorni)`, oppure cambia `Ricerca da` ([§8.3](#83-leggere-e-adottare-i-risultati)) |
| Righe misure con `—` | valore non calcolabile (Observer e Target coincidenti, o quasi antipodali: la geodetica non converge) | allontana i due punti; a distanze intercontinentali alcune righe non sono disponibili |

### 11.2 Sintomi senza messaggio

| Sintomo | Causa probabile | Rimedio |
|---|---|---|
| Il clic non posiziona il punto | hai **trascinato** invece di cliccare, oppure hai cliccato il vuoto (nessuna superficie sotto il cursore) | clic secco sulla superficie visibile; verifica che il pulsante `Osservatore`/`Target` sia attivo |
| Il punto va "sotto" la mesh, quote senza senso | i tile non sono caricati: il clic ha colpito l'ellissoide | attendi la mesh o cambia zona/`?tileMaxM` |
| La Luna non si vede in scena | `Luna · Altitudine` negativa (sotto l'orizzonte), oppure stai guardando da un'altra parte / in nadir | cambia orario, poi premi `Vista Luna` |
| Edifici lontani sgranati o assenti | dettaglio limitato oltre ~1 km (default) | `?tileMaxM=2000` (più dati) |
| Scena pesante, scatti, caricamento lungo | GPU o connessione limitate, troppe schede che usano WebGL | chiudi altre schede, usa `?tileMaxM=500`, non restare zoomato molto in alto |
| Dopo un reload i punti sono spariti | nessuna persistenza per Target e orario: lo stato vive solo nella pagina (l'Osservatore torna solo se hai salvato una Home con `Imposta come Home`, §6.1) | segna le coordinate prima di ricaricare |
| Dopo un reload la mesh riparte dal principio | normale: la sessione dei tile è nuova | — |

**Debug.** Apri la console del browser (F12) e filtra `lunar-photo-planner`: trovi le creazioni del tileset, ad es. `[lunar-photo-planner] tileset "google": creazione #1 in questa sessione` e, nei remount, `riuso dell'istanza di sessione (creazioni finora: 1)`. È il modo corretto per verificare che l'app non stia martellando il provider di tile.

**Se il problema resta:** apri una issue su <https://github.com/verbavolant/lunar-photo-planner> indicando browser, URL esatto usato (compresi `?provider=`/`?tileMaxM=`), e se possibile una schermata dell'avviso e della console.

---

## 12. Limitazioni dichiarate e precisione

Sono i limiti **noti e voluti** dell'attuale release, non bug da segnalare:

| Ambito | Come stanno le cose |
|---|---|
| Quote | `Quota (ellissoide)` è l'altezza sopra l'**ellissoide WGS84**, **non** l'altezza sul livello del mare: lo scarto geoide–ellissoide non è corretto (in Italia può valere decine di metri). Per lavorare usa `Altezza dal suolo`. |
| Altitudine della Luna | Calcolata **senza rifrazione atmosferica**. Verso l'orizzonte la Luna reale appare **più alta** di quanto mostrato (frazioni di grado, dello stesso ordine del diametro lunare): sopra i ~10° l'effetto è trascurabile, vicino all'orizzonte usa il valore come guida e verifica sul posto. |
| Posizione della Luna | **Topocentrica** per l'Osservatore scelto (parallasse corretta): azimut, altitudine, distanza e diametro sono i valori reali per quel punto, verificati contro effemeridi autorevoli. |
| Ostacoli | L'**occlusione non è calcolata**: la linea verde è geometria pura. Alberi, edifici e rilievi vanno verificati ruotando la scena. |
| Suolo sotto l'Osservatore | `Altezza dal suolo` è riferita alla quota letta **al momento del clic** e non viene rimisurata quando ti sposti (i tile 3D non espongono un terreno campionabile): dopo grandi spostamenti, riposiziona l'Osservatore. |
| Fase lunare | La frazione illuminata è **geocentrica** (definizione standard delle fasi); lo scarto topocentrico è sotto l'1%. Il **disco** disegnato è una rappresentazione equivalente (nessuna librazione, nessun dettaglio dei mari): contano i numeri. |
| Fotocamera | Nessuna simulazione di sensore, focale, frustum o "Luna nel frame": [calcolo a mano, §7.3](#73-dal-numero-alla-focale). |
| Funzionalità non ancora presenti | Ricerca inversa (trova luogo + data + ora), ricerca per indirizzo, confronto di più candidati, salvataggio/condivisione della pianificazione (unica eccezione: la Home dell'Osservatore, §6.1), stime di esposizione. |
| Tempo | Precisione **al minuto** sull'input e sulle etichette; la ricerca allineamenti campiona con il `Passo (min)` scelto e raffina gli attraversamenti, ma il risultato mostrato resta in ore:minuti. |
| Fuso orario | Sempre quello del **browser**. Per pianificare all'estero, considera lo scostamento a mano. |
| Dati 3D | La mesh fotorealistica arriva da Google (via Cesium ion o via Map Tiles API, a seconda della configurazione: [§9](#9-parametri-nellurl-provider-tilemaxm)) ed è disponibile solo per le aree coperte dal servizio; disponibilità e risoluzione dipendono dal provider, non dall'app. |

---

## 13. Crediti, dati e privacy

- **Attribution obbligatoria:** i crediti mostrati in basso a destra (Cesium ion e Google) sono un requisito dei termini dei provider e restano sempre visibili.
- **Piano Cesium ion:** il sito usa un account ion; il piano *Community* gratuito è per uso **individuale non commerciale** e ha una quota mensile di streaming. Se vedi blocchi ricorrenti, può essere stata esaurita quella quota.
- **Nessun backend, nessun account:** l'app è un sito statico e **non** invia i tuoi punti da nessuna parte: chiudendo o ricaricando la pagina, la pianificazione va persa. Unica cosa scritta nel browser: la **Home dell'Osservatore**, solo se premi `Imposta come Home` (localStorage; resta finché non la sovrascrivi o cancelli i dati del sito). Nessun cookie, nessuna geolocalizzazione.
- **Cosa esce dal tuo dispositivo:** richieste verso Cesium ion/`api.cesium.com` e verso i server dei tile 3D per scaricare la scena, come per qualsiasi mappa 3D.
- **Per chi ospita l'app:** le chiavi vanno protette con restrizioni HTTP referrer lato Google Cloud e i segreti (chiave Google, token ion) vanno solo nei secret di build, mai nel codice e mai nei log. La chiave browser finisce nel bundle JavaScript: è normale, la difesa è la restrizione del referrer.

---

## 14. Glossario

| Termine | Significato |
|---|---|
| **Osservatore (Observer Point)** | il punto in cui ti metti tu, con la sua quota |
| **Target (Target Point)** | il punto del soggetto da allineare (messo sulla cima, sulla guglia, sull'arco…) |
| **Linea di vista** | il segmento retto 3D Osservatore → Target, rappresentato in verde |
| **Posizione topocentrica** | posizione apparente della Luna calcolata dal tuo punto specifico, parallasse inclusa |
| **Azimut** | direzione orizzontale: 0° nord, 90° est, 180° sud, 270° ovest, senso orario |
| **Altitudine / Angolo verticale / Inclinazione** | angolo sopra (positivo) o sotto (negativo) l'orizzonte |
| **Separazione angolare (`sep`)** | distanza angolare tra centro della Luna e linea di vista |
| **Diametro angolare** | dimensione apparente della Luna in gradi |
| **POV camera** | la vista corrente della camera virtuale (lat/lon, quota, azimut, inclinazione) |
| **Vista Luna** | camera posta 1 m sopra l'Osservatore, orientata verso la Luna con posa reale |
| **Fase lunare C / D** | crescente / decrescente, con la frazione illuminata all'orario in uso |
| **Ellissoide WGS84** | la superficie matematica di riferimento delle quote |
| **Tile 3D / mesh** | i "mattoncini" fotorealistici scaricati dal provider per costruire il territorio 3D |
| **Root request / 429** | la richiesta iniziale dell'indice dei tile; 429 = il provider ha rifiutato troppe richieste (limite di quota) |

---

*Manuale allineato all'interfaccia del branch `main` (commit `ac1375c`). Se un controllo descritto qui non corrisponde a quello che vedi sul sito, [apri una issue](https://github.com/verbavolant/lunar-photo-planner/issues): il manuale va aggiornato.*
