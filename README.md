# Lunar Photo Planner

Web app per pianificare fotografie della Luna in allineamento con edifici, monumenti e paesaggio reale, usando CesiumJS, Google Photorealistic 3D Tiles e calcoli astronomici topocentrici.

> Stato: **Fase 6 completata** (Alignment Planner, checklist e2e 2026-10-21): oltre a tutto quanto già presente in Fase 4 (Luna in scena con posa e dimensione topocentriche reali, bottone "Vista Luna", vista dall'alto "Sopra Observer · 100 m", orologio della scena sincronizzato col tempo della UI, POV della camera in tempo reale, regolazione dell'altezza e spostamenti dell'Osservatore, disco lunare con blocco "Fase lunare" nella barra in basso), la ricerca degli allineamenti è completa: readout **«Allineamento ora»** nel box Dati (separazione e offset della Luna dalla linea all'orario in uso), candidati **ordinati per separazione** con contatore «Trovati N passaggi · mostro i primi M», filtro **«Luna sopra l'orizzonte»** con riga «N passaggi scartati», tolleranza predefinita 5° (fino a 10°), intervallo di ricerca esplicito con campo **«Ricerca da»** editabile (anche nel passato), finestra che resta aperta dopo l'adozione di un candidato; fase lunare in % con C/D in ogni risultato. Fase 6b/6c (rifiniture UI 2026-10-21): orario in uso accanto allo slider e fase lunare a destra dello slider nella barra in basso, Home dell'Osservatore salvata nel browser (`Imposta come Home`), bottone «Cerca allineamenti Luna», riga adottata in grassetto, stato di sviluppo (ultimo task completato, es. `Sviluppo: T-061`) in alto a destra nella barra comandi. Fasi 1–4 e 5b (provider 3D configurabile) approvate; **Fase 7 (Reverse Planner) completata** (checklist e2e 2026-10-21): bottone «Cerca luogo per il Target» e finestra con parametri Finestra (giorni), Tolleranza (°), Distanza max (m) e «Ricerca da»; il motore cerca, sul radiale dal Target opposto all'azimut della Luna, il punto a terra dove la linea di vista verso il Target eguaglia l'altitudine della Luna, campionando il terreno dai 3D Tiles senza ricaricarli; click sul risultato sposta l'Observer alla quota di suolo campionata e imposta l'orario. Limiti dichiarati: solo la composizione «dietro/il Target» sul radiale, nessun controllo di occlusione (Fase 8). Live: https://verbavolant.github.io/lunar-photo-planner/

## Usare l'app

**Guida passo passo per l'utente: [MANUALE.md](MANUALE.md)** — interfaccia, navigazione della scena 3D, posizionamento di Osservatore e Target, uso del tempo, lettura di azimut/altitudine/diametro lunare, ricerca degli allineamenti, parametri URL (`?provider=`, `?tileMaxM=`), messaggi di errore e limitazioni dichiarate.

Dall'app: il pulsante **Manuale** nella barra in alto apre la stessa guida in una finestra separata, formattata in HTML.

## Obiettivo
Permettere al fotografo di scegliere un soggetto e capire dove posizionarsi, quando scattare, quale focale usare e come apparirà la Luna rispetto al soggetto.

## Stack previsto
- React + TypeScript + Vite
- CesiumJS
- Google Photorealistic 3D Tiles
- GitHub Pages

## Sviluppo

```bash
npm install        # setup
npm run dev        # server di sviluppo
npm test           # test (Vitest)
npm run typecheck  # controllo tipi (tsc -b)
npm run build      # build di produzione in dist/
npm run preview    # anteprima della build
```


Per chi sviluppa con assistenza AI: leggere `AGENTS.md` e i file in `docs/ai/`.

## Configurazione della sorgente 3D
La scena usa di default **Google Photorealistic 3D Tiles** via Map Tiles API diretta (con la tua chiave; vedi la nota sulla quota sotto). La stessa mesh è disponibile anche **via Cesium ion** (provider `google-ion`, asset pubblico 2275207, chiave Google gestita da ion), utile dove l'accesso diretto alla Map Tiles API è limitato o bloccato (es. area EEA) e per non consumare la tua quota.

**Scelta del provider e protezione dalla quota (T-040):**
- Default da configurazione: `VITE_SCENE_PROVIDER=google` (o `google-ion`, alias accettato `cesium`) in `.env.local`.
- Override a runtime senza rebuild: `?provider=google` / `?provider=google-ion` nell'URL (comodo per provare entrambe le sorgenti sul sito già pubblicato; `?provider=cesium` resta accettato come alias).
- Un solo tileset per sessione: la creazione del tileset è memoizzata (in sviluppo, i remount di StrictMode/HMR riusano la stessa creazione: una sola root request per caricamento pagina).
- Errore 429 (limite di richieste): nessun retry immediato — l'app resta sulla vista base (globo senza mesh) e riprova automaticamente dopo 30 s, 2 min e 10 min (4 tentativi totali), con avviso a schermo; al quarto fallimento nessun altro tentativo nella sessione (ricarica la pagina). In console un contatore debug (`tileset "...": creazione #N in questa sessione`) registra le creazioni.
- Limitazione del dettaglio (T-039): i tile a più di ~1 km dalla camera restano a risoluzione ridotta (i livelli più fini non vengono scaricati): rendering e caricamento più rapidi, qualità vicino invariata. Distanza regolabile a runtime con `?tileMaxM=<metri>` (default 1000; un valore non valido ripristina il default con avviso a schermo) e modificabile in codice con `DEFAULT_MAX_DETAIL_DISTANCE_M` in `src/cesium/tilesetPerformance.ts`.
- Valore non valido: l'app ricade sul default e mostra un avviso a schermo.

### Google Photorealistic 3D Tiles (provider `google`)
I tiles fotorealistici richiedono una chiave Google Maps Platform con la **Map Tiles API** abilitata:

1. Crea un progetto su Google Cloud e abilita la Map Tiles API.
2. Crea una chiave API di tipo browser e limitala con restrizioni HTTP referrer (dominio di deploy e `localhost`).
3. Copia `.env.example` in `.env.local` e inserisci il valore reale (mai committarlo):

   ```
   VITE_GOOGLE_MAPS_API_KEY=la-tua-chiave
   ```

4. Riavvia il server di sviluppo.

Senza chiave l'app resta navigabile (globo vuoto) e mostra un avviso a schermo. L'attribution richiesta dalle Google Map Tiles API Policies è mostrata automaticamente da CesiumJS (`showCreditsOnScreen`). Per il deploy (GitHub Actions) la chiave va passata come secret di build, senza stamparla nei log.

**Quota (T-040):** Google applica una quota per progetto di **150 root request/min** sui 3D Tiles (`3D Tiles root requests per minute`): superata, l'endpoint risponde `429 RATE_LIMIT_EXCEEDED` e i tiles non caricano finché la finestra non si libera. Con questo provider ogni visitatore consuma la tua quota: per l'uso normale del sito preferisci `google-ion`.

### Cesium ion (provider `google-ion`, alias accettato `cesium`)
1. Crea un account gratuito su https://ion.cesium.com e un token in **Tokens** con l'asset **Google Photorealistic 3D Tiles** (asset 2275207) tra quelli consentiti.
2. Copia `.env.example` in `.env.local` e inserisci:

   ```
   VITE_CESIUM_ION_TOKEN=il-tuo-token
   VITE_SCENE_PROVIDER=google-ion
   ```

3. Riavvia il server di sviluppo.

Nota: con `google-ion` la scena carica la **stessa mesh fotorealistica di Google**, ma le richieste passano **solo da Cesium ion** (asset 2275207): l'endpoint ion restituisce l'URL Google con una **chiave gestita da ion** (verificato 2026-10-08), quindi la tua chiave e la tua quota Google non vengono usate; comodo anche dove l'accesso diretto è bloccato (es. area EEA). A caricamento avvenuto il globo viene nascosto, come da tutorial ufficiale CesiumJS (il tileset copre il globo). Se il token manca o l'asset non è abilitato resta un globo vuoto con avviso a schermo. Lo streaming via ion consuma i crediti del piano ion (Community gratuito: 15 GB/mese, uso individuale non commerciale). I credit dei dati restano a schermo: requisito dei provider.

## Deploy su GitHub Pages
1. Su GitHub crea un repository **vuoto** (senza README/license pregenerati) con branch `main`.
2. Aggiungi il remote e pubblica:

   ```
   git remote add origin https://github.com/<utente>/lunar-photo-planner.git
   git push -u origin main
   ```

3. Nel repository: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
4. **Settings → Secrets and variables → Actions → New repository secret**: nome `VITE_GOOGLE_MAPS_API_KEY`, valore = la stessa chiave di `.env.local`. Opzionale, per il provider `google-ion`: secret `VITE_CESIUM_ION_TOKEN` con il token ion, e in **Variables** `VITE_SCENE_PROVIDER=google-ion` per cambiare il provider di default del sito senza toccare il codice (poi rilanciare il workflow da Actions → Run workflow). A runtime il provider si può sempre cambiare con `?provider=google|google-ion` nell'URL (alias accettato: `cesium`).
5. In Google Cloud Console aggiorna la restrizione HTTP referrer della chiave aggiungendo `https://<utente>.github.io/*`.
6. Il workflow `.github/workflows/deploy-pages.yml` esegue install/typecheck/test/build e pubblica `dist/` a ogni push su `main` (e manualmente da Actions → workflow_dispatch).

Il sito sarà su `https://<utente>.github.io/<repo>/`: la base relativa (T-004) funziona senza configurazioni aggiuntive. La chiave finisce nel bundle JavaScript (è una chiave browser): la protezione è la restrizione HTTP referrer lato Google Cloud, non il secret.

## Roadmap
Vedi `docs/ai/PLAN.md`.
