// Edge Function "promemoria": manda la notifica serale del Quaderno.
// - Chiamata ogni ora dal cron (con CRON_SECRET): avvisa chi ha il promemoria a quest'ora
//   e oggi non ha ancora aperto l'app.
// - Chiamata dall'app con il tuo login: manda subito una notifica di prova.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = "https://kristiankunov77-cloud.github.io/quaderno-kristian/";

webpush.setVapidDetails(APP_URL, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

const TITOLI = ["Ehi Kristian!", "Sveglia!", "Ultima chiamata", "Quaderno di Kristian", "Oh, Kristian"];
const FRASI = [
  "Sono le {ora} e il Quaderno è ancora vuoto. Cosa cazzo stai facendo? Aprilo.",
  "La giornata sta per finire e tu non hai scritto niente. Dai, sono due minuti.",
  "Le spese non si scrivono da sole, campione.",
  "Ultimo avviso prima che la giornata sparisca nel nulla. Apri il Quaderno.",
  "Hai passato ore sul telefono e non trovi due minuti per me? Ma dai.",
  "Svegliaaa! Obiettivi, spese, ore di lavoro. Muoviti.",
  "Il Kristian di domani ti ringrazierà. Quello di adesso però deve aprire l'app.",
  "Ti sei dimenticato di me? Il Quaderno ti aspetta, offeso.",
  "Dai cazzo, sono due minuti: scrivi la tua giornata.",
  "Ultima ora: Kristian non ha ancora aperto il Quaderno. Il mondo è sconvolto.",
  "Quanto hai speso oggi? Non lo sai, vero? Appunto. Apri l'app.",
  "Se non scrivi la giornata adesso, domani non te la ricordi. Fidati.",
  "Toc toc. Chi è? La giornata che sta finendo. Scrivila!",
  "Ancora niente? Guarda che lo vedo. Apri il Quaderno, forza.",
  "Muovi il culo e segna gli obiettivi di oggi. Poi puoi tornare a scrollare.",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function adessoARoma() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return { oggi: `${p.year}-${p.month}-${p.day}`, ora: Number(p.hour) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { oggi, ora } = adessoARoma();

  let utenti: string[];
  let prova = false;
  if (CRON_SECRET && token === CRON_SECRET) {
    const { data, error } = await db.from("promemoria").select("user_id, ultimo_accesso").eq("attivo", true).eq("ora", ora);
    if (error) return json({ errore: error.message }, 500);
    utenti = (data ?? []).filter((r) => r.ultimo_accesso !== oggi).map((r) => r.user_id);
  } else {
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return json({ errore: "Non autorizzato" }, 401);
    utenti = [user.id];
    prova = true;
  }
  if (!utenti.length) return json({ inviate: 0 });

  const { data: disp, error } = await db.from("dispositivi").select("endpoint, subscription").in("user_id", utenti);
  if (error) return json({ errore: error.message }, 500);

  let inviate = 0;
  const errori: string[] = [];
  for (const d of disp ?? []) {
    const msg = prova
      ? { title: "Prova riuscita!", body: "Le notifiche funzionano. Stasera, se non apri l'app, ti rompo le scatole così." }
      : { title: pick(TITOLI), body: pick(FRASI).replace("{ora}", `${ora}`) };
    try {
      await webpush.sendNotification(d.subscription, JSON.stringify({ ...msg, url: APP_URL }), { TTL: 3600 });
      inviate++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Dispositivo non più valido (app disinstallata o permesso tolto): lo togliamo.
      if (code === 404 || code === 410) await db.from("dispositivi").delete().eq("endpoint", d.endpoint);
      else errori.push(String((e as Error).message ?? e));
    }
  }
  return json({ inviate, dispositivi: disp?.length ?? 0, errori });
});
