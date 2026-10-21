// Edge Function "promemoria": manda la notifica serale del Quaderno.
// - Chiamata ogni ora dal cron (con CRON_SECRET): se quest'ora è tra quelle scelte
//   manda una frase più o meno cattiva, diversa se oggi hai già aperto l'app.
//   Al primo orario della giornata manda anche un insulto per gli obiettivi di ieri
//   rimasti senza spunta (né "fatto" né "non fatto").
// - Chiamata dall'app con il tuo login: manda subito una notifica di prova.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = "https://kristiankunov77-cloud.github.io/quaderno-kristian/";

webpush.setVapidDetails(APP_URL, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

// Tre livelli: il primo promemoria della giornata è tranquillo, l'ultimo è cattivo.
const LIVELLI = [
  {
    titoli: ["Ciao Kristian", "Piccolo promemoria", "Quaderno di Kristian"],
    giaAperto: [
      "Bravo, oggi il Quaderno l'hai già aperto. Come vanno gli obiettivi di oggi?",
      "Pausa pranzo: segna le spese di stamattina, così stasera sei già a posto.",
      "Mezza giornata andata. Quanti obiettivi hai già spuntato?",
    ],
    frasi: [
      "Pausa pranzo? Due minuti per segnare cosa hai fatto stamattina.",
      "Quando hai un attimo, apri il Quaderno e scrivi com'è andata finora.",
      "Segna le spese di stamattina finché te le ricordi.",
      "I tuoi obiettivi di oggi ti aspettano. Con calma, eh.",
      "Mentre mangi, dai un'occhiata al Quaderno?",
    ],
  },
  {
    titoli: ["Ehi Kristian!", "Sveglia!", "Oh, Kristian"],
    giaAperto: [
      "Hai aperto il Quaderno, ok. Ma gli obiettivi li stai facendo davvero?",
      "Sono le {ora}: ore di lavoro e spese del pomeriggio, segnale adesso.",
      "Aprire l'app non basta, campione. Spunta qualche obiettivo.",
    ],
    frasi: [
      "Sono le {ora} e il Quaderno è ancora vuoto. Non farmi arrabbiare.",
      "Le spese non si scrivono da sole, campione.",
      "Hai passato ore sul telefono e non trovi due minuti per me? Ma dai.",
      "Svegliaaa! Obiettivi, spese, ore di lavoro. Muoviti.",
      "Ancora niente? Guarda che lo vedo. Apri il Quaderno, forza.",
      "Quanto hai speso oggi? Non lo sai, vero? Appunto. Apri l'app.",
    ],
  },
  {
    titoli: ["Ultima chiamata", "KRISTIAN!", "Adesso basta"],
    giaAperto: [
      "Sono le {ora}. La giornata sta finendo: hai scritto tutto o no, cazzo?",
      "Ultimo giro: obiettivi, spese, telefono, lavoro. Controlla che ci sia tutto.",
      "Hai aperto l'app, bene. Ora finisci di scrivere la giornata, poi puoi riposare.",
    ],
    frasi: [
      "Sono le {ora} e il Quaderno è ancora vuoto. Cosa cazzo stai facendo? Aprilo.",
      "Dai cazzo, sono due minuti: scrivi la tua giornata.",
      "Muovi il culo e segna gli obiettivi di oggi. Poi puoi tornare a scrollare.",
      "Ultimo avviso prima che la giornata sparisca nel nulla. Apri il Quaderno, cazzo.",
      "Ti ho scritto prima, ti ho riscritto dopo. Adesso apri questa cazzo di app.",
      "Ultima ora: Kristian ignora il Quaderno da tutto il giorno. Il mondo è sconvolto, e pure io.",
    ],
  },
];

const INSULTI = [
  "Ieri non hai spuntato {n}. Che cazzo hai fatto tutto il giorno? -{p} punti.",
  "{n}: niente spunta, quindi non l'hai fatto. Pigro di merda. -{p} punti.",
  "Te l'eri scritto da solo: {n}. E non l'hai fatto. Coglione. -{p} punti.",
  "Ieri: {n}. Risultato: zero. Campione del mondo di cazzeggio. -{p} punti.",
  "Ma porca puttana Kristian, {n} e nemmeno la spunta. -{p} punti, te li sei meritati.",
  "Anche un sasso avrebbe fatto {n}. Tu no. -{p} punti.",
];
const TITOLI_INSULTO = ["Obiettivi di ieri: bocciato", "Vergognati", "Kristian, che figura di merda"];
const PUNTI_NON_FATTO = 5;

// Livello in base alla posizione dell'orario tra quelli scelti: primo 0, ultimo 2.
function livello(ore: number[], ora: number) {
  const ordinate = [...ore].sort((a, b) => a - b);
  const i = ordinate.indexOf(ora);
  if (ordinate.length <= 1) return 2;
  return Math.round((i / (ordinate.length - 1)) * 2);
}

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
  const oggi = `${p.year}-${p.month}-${p.day}`;
  const ieri = new Date(Date.parse(oggi + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  return { oggi, ieri, ora: Number(p.hour) };
}

type Obiettivo = { text?: string; type?: string; date?: string; done?: boolean; failed?: boolean; insultato?: boolean };
type Messaggio = { title: string; body: string; tag?: string };

// Obiettivi del giorno di ieri senza spunta. Se li hai già visti nell'app (insultato) non li ripete.
function insultoDiIeri(goals: Obiettivo[], ieri: string): Messaggio | null {
  const mancati = goals.filter((g) => g.type === "day" && g.date === ieri && !g.done && !g.failed && !g.insultato);
  if (!mancati.length) return null;
  const nomi = mancati.map((g) => `"${g.text ?? ""}"`);
  const n = nomi.length === 1 ? nomi[0] : `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
  return {
    title: pick(TITOLI_INSULTO),
    body: pick(INSULTI).replace("{n}", n).replace("{p}", `${mancati.length * PUNTI_NON_FATTO}`),
    tag: "insulto",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { oggi, ieri, ora } = adessoARoma();

  let utenti: string[];
  let prova = false;
  const livelloDi = new Map<string, number>();
  const giaApertoOggi = new Set<string>();
  const insultoDi = new Map<string, Messaggio>();
  if (CRON_SECRET && token === CRON_SECRET) {
    const { data, error } = await db.from("promemoria").select("user_id, ultimo_accesso, ore").eq("attivo", true).contains("ore", [ora]);
    if (error) return json({ errore: error.message }, 500);
    // La notifica parte a ogni orario scelto, anche se oggi hai già aperto l'app:
    // cambia solo la frase.
    const daAvvisare = data ?? [];
    utenti = daAvvisare.map((r) => r.user_id);
    for (const r of daAvvisare) {
      livelloDi.set(r.user_id, livello(r.ore, ora));
      if (r.ultimo_accesso === oggi) giaApertoOggi.add(r.user_id);
    }
    const primoOrario = daAvvisare.filter((r) => Math.min(...r.ore) === ora).map((r) => r.user_id);
    if (primoOrario.length) {
      const { data: quaderni } = await db.from("quaderno").select("user_id, data").in("user_id", primoOrario);
      for (const q of quaderni ?? []) {
        const m = insultoDiIeri((q.data?.goals ?? []) as Obiettivo[], ieri);
        if (m) insultoDi.set(q.user_id, m);
      }
    }
  } else {
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return json({ errore: "Non autorizzato" }, 401);
    utenti = [user.id];
    prova = true;
  }
  if (!utenti.length) return json({ inviate: 0 });

  const { data: disp, error } = await db.from("dispositivi").select("endpoint, subscription, user_id").in("user_id", utenti);
  if (error) return json({ errore: error.message }, 500);

  let inviate = 0;
  const errori: string[] = [];
  const invia = async (d: { endpoint: string; subscription: webpush.PushSubscription }, msg: Messaggio) => {
    try {
      await webpush.sendNotification(d.subscription, JSON.stringify({ ...msg, url: APP_URL }), { TTL: 3600 });
      inviate++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Dispositivo non più valido (app disinstallata o permesso tolto): lo togliamo.
      if (code === 404 || code === 410) await db.from("dispositivi").delete().eq("endpoint", d.endpoint);
      else errori.push(String((e as Error).message ?? e));
    }
  };
  for (const d of disp ?? []) {
    const msg: Messaggio = prova
      ? { title: "Prova riuscita!", body: "Le notifiche funzionano. Se un giorno non apri l'app, ti scrivo negli orari scelti, sempre più arrabbiato." }
      : (() => {
        const l = LIVELLI[livelloDi.get(d.user_id) ?? 2];
        const frasi = giaApertoOggi.has(d.user_id) ? l.giaAperto : l.frasi;
        return { title: pick(l.titoli), body: pick(frasi).replace("{ora}", `${ora}`) };
      })();
    await invia(d, msg);
    const ins = insultoDi.get(d.user_id);
    if (ins) await invia(d, ins);
  }
  return json({ inviate, dispositivi: disp?.length ?? 0, errori });
});
