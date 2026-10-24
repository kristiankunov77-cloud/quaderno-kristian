# Quaderno di Kristian

App web personale per obiettivi, spese, tempo al telefono e ore di lavoro sui progetti.

- I file del sito sono nella cartella principale e vengono pubblicati con GitHub Pages.
- I dati sono salvati su Supabase, protetti da login e dalle regole in `supabase/schema.sql`.
- In `config.js` ci sono solo l'indirizzo del progetto e la chiave pubblica: nessuna password.
- Il promemoria serale usa la Edge Function in `supabase/functions/promemoria` e le tabelle in `supabase/promemoria.sql`. Le chiavi private stanno solo nei Secrets di Supabase.

## Quaderno di Kendra
Nella cartella `kendra/` c'è una seconda app con obiettivi e punti, spese, acqua e riepilogo, con colori rosa e viola.
Usa lo stesso progetto Supabase ma una tabella propria (`supabase/kendra.sql`) e un login separato, e riceve solo promemoria gentili.
