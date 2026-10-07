# Lunar Photo Planner

Web app per pianificare fotografie della Luna in allineamento con edifici, monumenti e paesaggio reale, usando CesiumJS, Google Photorealistic 3D Tiles e calcoli astronomici topocentrici.

> Stato: **Fase 2 completata** (T-007…T-011): Observer/Target con pick su tiles, linea di vista, pannello misure testato (Vincenty su WGS84). Live: https://verbavolant.github.io/lunar-photo-planner/ — in attesa di approvazione per la Fase 3 (tempo + Luna topocentrica).

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

## Configurazione Google 3D Tiles
I tiles fotorealistici richiedono una chiave Google Maps Platform con la **Map Tiles API** abilitata:

1. Crea un progetto su Google Cloud e abilita la Map Tiles API.
2. Crea una chiave API di tipo browser e limitala con restrizioni HTTP referrer (dominio di deploy e `localhost`).
3. Copia `.env.example` in `.env.local` e inserisci il valore reale (mai committarlo):

   ```
   VITE_GOOGLE_MAPS_API_KEY=la-tua-chiave
   ```

4. Riavvia il server di sviluppo.

Senza chiave l'app resta navigabile (globo vuoto) e mostra un avviso a schermo. L'attribution richiesta dalle Google Map Tiles API Policies è mostrata automaticamente da CesiumJS (`showCreditsOnScreen`). Per il deploy (GitHub Actions) la chiave va passata come secret di build, senza stamparla nei log.

## Deploy su GitHub Pages
1. Su GitHub crea un repository **vuoto** (senza README/license pregenerati) con branch `main`.
2. Aggiungi il remote e pubblica:

   ```
   git remote add origin https://github.com/<utente>/lunar-photo-planner.git
   git push -u origin main
   ```

3. Nel repository: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
4. **Settings → Secrets and variables → Actions → New repository secret**: nome `VITE_GOOGLE_MAPS_API_KEY`, valore = la stessa chiave di `.env.local`.
5. In Google Cloud Console aggiorna la restrizione HTTP referrer della chiave aggiungendo `https://<utente>.github.io/*`.
6. Il workflow `.github/workflows/deploy-pages.yml` esegue install/typecheck/test/build e pubblica `dist/` a ogni push su `main` (e manualmente da Actions → workflow_dispatch).

Il sito sarà su `https://<utente>.github.io/<repo>/`: la base relativa (T-004) funziona senza configurazioni aggiuntive. La chiave finisce nel bundle JavaScript (è una chiave browser): la protezione è la restrizione HTTP referrer lato Google Cloud, non il secret.

## Roadmap
Vedi `docs/ai/PLAN.md`.
