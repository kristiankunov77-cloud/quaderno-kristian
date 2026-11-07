# Progetto: le app di Kristian

Quattro web app (PWA) in italiano, ognuna nel suo repository GitHub (account `kristiankunov77-cloud`), pubblicate con GitHub Pages dal branch `main`:

| Cartella | App | Indirizzo | Tabella Supabase | `app` nei dispositivi |
|---|---|---|---|---|
| `quaderno-kristian` | Quaderno di Kristian | https://kristiankunov77-cloud.github.io/quaderno-kristian/ | `quaderno` | `kristian` (o vuoto) |
| `quaderno-kendra` | Quaderno di Kendra | https://kristiankunov77-cloud.github.io/quaderno-kendra/ | `quaderno_kendra` | `kendra` |
| `quaderno-krasimir` | Quaderno di Krasimir (papà, cartongessista/imbianchino) | https://kristiankunov77-cloud.github.io/quaderno-krasimir/ | `quaderno_krasimir` | `krasimir` |
| `ciclo-kendra` | Ciclo di Kendra | https://kristiankunov77-cloud.github.io/ciclo-kendra/ | `ciclo_kendra` | `ciclo` |

## Come sono fatte
- Ogni app è un solo `index.html` (HTML, CSS e JavaScript insieme, nessun build), più `sw.js` (service worker: cache e notifiche), `manifest.webmanifest`, icone, `config.js` (URL e chiave pubblica di Supabase, chiave pubblica VAPID) e `supabase.js` (client Supabase già pronto).
- I dati stanno in `localStorage` e si sincronizzano con Supabase: una riga per utente (`user_id`, `data` jsonb) con RLS "proprietario".
- Quando si cambia `sw.js` o un file in cache, aumentare il numero in `const CACHE = '...-vN'` così i telefoni scaricano la versione nuova.
- Animazioni: rispettare `prefers-reduced-motion`. Tema chiaro e scuro con variabili CSS.
- Testi dell'interfaccia sempre in italiano.

## Supabase (progetto `ebhaxdtdttfhsvrjjvgy`, condiviso da tutte le app)
- Tabelle condivise: `promemoria` (user_id, attivo, ore[], ultimo_accesso) e `dispositivi` (endpoint, user_id, subscription, app).
- Edge Function `promemoria` (codice in `quaderno-kristian/supabase/functions/promemoria/index.ts`): la chiama ogni ora `pg_cron` con `CRON_SECRET`, usa web-push e l'ora di Roma. Manda le frasi del Quaderno di Kristian (sempre più cattive), quelle gentili di Kendra, una notifica per ogni obiettivo di oggi non fatto, gli avvisi del ciclo e quelli di Krasimir.
- SQL in `quaderno-kristian/supabase/` (per esempio `krasimir.sql`).
- Dopo aver cambiato la funzione bisogna fare il deploy: con la Supabase CLI `supabase functions deploy promemoria`, oppure incollando il codice nella dashboard.

## Provare un'app sul computer
Dalla cartella dell'app: `python -m http.server 8000` (oppure `npx serve`) e apri http://localhost:8000. Il login usa il vero Supabase.

## Pubblicare
`git add -A && git commit -m "..." && git push` sul branch `main`: GitHub Pages aggiorna il sito in un paio di minuti e le app sui telefoni si aggiornano da sole.
