# Lunar Photo Planner

Web app per pianificare fotografie della Luna in allineamento con edifici, monumenti e paesaggio reale, usando CesiumJS, Google Photorealistic 3D Tiles e calcoli astronomici topocentrici.

> Stato: **Fase 4 completata** (T-016…T-020, checklist e2e chiusa 2026-10-06): Luna renderizzata in scena con posa e dimensione dai dati topocentrici reali, bottone "Vista Luna" (camera sull'Osservatore rivolta verso la Luna), vista dall'alto "Sopra Observer · 100 m", orologio della scena sincronizzato col tempo della UI (regolazione fine ±1 min, ora legale/solare garantita e mostrata), ricerca dei prossimi allineamenti Luna ↔ linea Observer→Target con parametri configurabili (finestra fino a 365 giorni, default 2 mesi). Fasi 1–4 approvate; **Fase 5 (Photographer View) in attesa di approvazione**. Live: https://verbavolant.github.io/lunar-photo-planner/

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
La scena usa di default **Google Photorealistic 3D Tiles**. In alternativa è disponibile **Cesium ion** (Cesium World Terrain + imagery Bing Aerial + Cesium OSM Buildings), utile se l'accesso Google al 3D è limitato o esaurito.

**Scelta del provider:**
- Default da configurazione: `VITE_SCENE_PROVIDER=google` (o `cesium`) in `.env.local`.
- Override a runtime senza rebuild: `?provider=google` / `?provider=cesium` nell'URL (comodo per provare entrambe le sorgenti sul sito già pubblicato).
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

### Cesium ion (provider `cesium`)
1. Crea un account gratuito su https://ion.cesium.com e un token in **Tokens** (asset consentiti: Cesium World Terrain, Bing Maps Aerial, Cesium OSM Buildings).
2. Copia `.env.example` in `.env.local` e inserisci:

   ```
   VITE_CESIUM_ION_TOKEN=il-tuo-token
   VITE_SCENE_PROVIDER=cesium
   ```

3. Riavvia il server di sviluppo.

Nota: con Cesium ion la scena mostra terrain reale e edifici volumetrici (OSM Buildings), non la mesh fotorealistica di Google. Il piano gratuito Community di ion prevede 15 GB/mese di streaming e 1.000 sessioni/mese di imagery commerciale (uso individuale, non commerciale). I credit dei dati restano a schermo: requisito dei provider.

## Deploy su GitHub Pages
1. Su GitHub crea un repository **vuoto** (senza README/license pregenerati) con branch `main`.
2. Aggiungi il remote e pubblica:

   ```
   git remote add origin https://github.com/<utente>/lunar-photo-planner.git
   git push -u origin main
   ```

3. Nel repository: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
4. **Settings → Secrets and variables → Actions → New repository secret**: nome `VITE_GOOGLE_MAPS_API_KEY`, valore = la stessa chiave di `.env.local`. Opzionale, per il provider `cesium`: secret `VITE_CESIUM_ION_TOKEN` con il token ion, e in **Variables** `VITE_SCENE_PROVIDER=cesium` per cambiare il provider di default del sito senza toccare il codice (poi rilanciare il workflow da Actions → Run workflow). A runtime il provider si può sempre cambiare con `?provider=google|cesium` nell'URL.
5. In Google Cloud Console aggiorna la restrizione HTTP referrer della chiave aggiungendo `https://<utente>.github.io/*`.
6. Il workflow `.github/workflows/deploy-pages.yml` esegue install/typecheck/test/build e pubblica `dist/` a ogni push su `main` (e manualmente da Actions → workflow_dispatch).

Il sito sarà su `https://<utente>.github.io/<repo>/`: la base relativa (T-004) funziona senza configurazioni aggiuntive. La chiave finisce nel bundle JavaScript (è una chiave browser): la protezione è la restrizione HTTP referrer lato Google Cloud, non il secret.

## Roadmap
Vedi `docs/ai/PLAN.md`.
