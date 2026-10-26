// Edge Function "promemoria": manda la notifica serale del Quaderno.
// - Chiamata ogni ora dal cron (con CRON_SECRET): se quest'ora è tra quelle scelte
//   manda una frase più o meno cattiva, diversa se oggi hai già aperto l'app.
//   Al primo orario della giornata manda anche un insulto per gli obiettivi di ieri
//   rimasti senza spunta (né "fatto" né "non fatto").
// - Chiamata dall'app con il tuo login: manda subito una notifica di prova.
// - I dispositivi del Quaderno di Kendra (colonna app = 'kendra') ricevono solo frasi gentili.
// - I dispositivi del Ciclo di Kendra (colonna app = 'ciclo') ricevono solo gli avvisi del ciclo:
//   due giorni prima, il giorno previsto, ogni giorno di ritardo, giorni fertili e ovulazione.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = "https://kristiankunov77-cloud.github.io/quaderno-kristian/";
const URL_DI: Record<string, string> = {
  kristian: APP_URL,
  kendra: "https://kristiankunov77-cloud.github.io/quaderno-kendra/",
  ciclo: "https://kristiankunov77-cloud.github.io/ciclo-kendra/",
};

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

// Quaderno di Kendra: promemoria normali, senza insulti.
const KENDRA = {
  titoli: ["Quaderno di Kendra", "Ciao Kendra", "Piccolo promemoria"],
  frasi: [
    "Come vanno gli obiettivi di oggi? Ricordati di spuntarli.",
    "Hai bevuto abbastanza acqua? Scrivilo nel Quaderno.",
    "Due minuti per segnare le spese di oggi?",
    "Sono le {ora}: un bicchiere d'acqua e un'occhiata agli obiettivi.",
    "Ricordati di aggiornare il tuo Quaderno.",
    "Ogni obiettivo fatto vale punti. Come stai andando oggi?",
  ],
};

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

// ---------- Ciclo di Kendra ----------
// Stesso calcolo dell'app: la data prevista è l'inizio dell'ultimo ciclo più la durata media
// (ultimi 6 cicli, oppure quella di partenza). Non si sposta: dal giorno dopo conta il ritardo.
type Periodo = { start: string; end?: string };
type DatiCiclo = {
  periods?: Periodo[];
  baseCycle?: number;
  basePeriod?: number;
  logs?: Record<string, unknown>;
  notifiche?: Record<string, unknown>;
};
const utc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const diff = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86400000);
const piu = (s: string, n: number) => new Date(utc(s) + n * 86400000).toISOString().slice(0, 10);
const media = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
const dataIt = (s: string) =>
  new Date(utc(s)).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const giorni = (n: number) => `${n} ${n === 1 ? "giorno" : "giorni"}`;

function messaggiCiclo(d: DatiCiclo, oggi: string, ora: number): Messaggio[] {
  const n = {
    ora: 9, prima: true, giorno: true, ritardo: true, fine: true, fertile: true, ovulazione: true, sintomi: false, oraSintomi: 21,
    ...(d.notifiche ?? {}),
  };
  const out: Messaggio[] = [];
  if (n.sintomi && ora === n.oraSintomi && !(d.logs ?? {})[oggi]) {
    out.push({ title: "Come stai oggi?", body: "Segna sintomi e umore di oggi, così i consigli sono più giusti per te.", tag: "ciclo-sintomi" });
  }
  const per = (d.periods ?? []).filter((p) => p && p.start).sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!per.length || ora !== n.ora) return out;
  const lens: number[] = [];
  for (let i = 1; i < per.length; i++) {
    const x = diff(per[i - 1].start, per[i].start);
    if (x >= 15 && x <= 90) lens.push(x);
  }
  const cyc = lens.length ? media(lens.slice(-6)) : (d.baseCycle ?? 28);
  const plens = per.filter((p) => p.end).map((p) => diff(p.start, p.end!) + 1).filter((x) => x >= 1 && x <= 15).slice(-6);
  const flow = plens.length ? media(plens) : (d.basePeriod ?? 5);
  const last = per[per.length - 1];
  if (oggi < last.start) return out;
  const atteso = piu(last.start, cyc);
  const fineStimata = piu(last.start, flow - 1);
  const ovu = piu(atteso, -14);
  const tra = diff(oggi, atteso);
  if (n.prima && tra === 2) {
    out.push({ title: "Il ciclo si avvicina", body: `Dovrebbe arrivare ${dataIt(atteso)}, tra 2 giorni. Tieni a portata assorbenti e la borsa dell'acqua calda.`, tag: "ciclo-prima" });
  }
  if (n.giorno && tra === 0) {
    out.push({ title: "Oggi è il giorno previsto", body: "Oggi dovrebbe arrivare il ciclo. Quando arriva, apri l'app e premi \"Mi è arrivato il ciclo\".", tag: "ciclo-giorno" });
  }
  if (n.ritardo && tra < 0 && (-tra <= 14 || -tra % 7 === 0)) {
    out.push({ title: "Ciclo in ritardo", body: `Il ciclo è in ritardo di ${giorni(-tra)}: era previsto ${dataIt(atteso)}. Quando arriva, segnalo nell'app.`, tag: "ciclo-ritardo" });
  }
  if (n.fine && !last.end && oggi === piu(fineStimata, 1)) {
    out.push({ title: "Il ciclo è finito?", body: "Se è finito, segnalo nell'app: così impara quanto dura di solito il tuo flusso.", tag: "ciclo-fine" });
  }
  if (ovu > fineStimata) {
    if (n.fertile && oggi === piu(ovu, -5)) {
      out.push({ title: "Giorni fertili", body: `Da oggi fino a ${dataIt(piu(ovu, 1))} sei nei giorni fertili.`, tag: "ciclo-fertile" });
    }
    if (n.ovulazione && oggi === ovu) {
      out.push({ title: "Ovulazione", body: "Oggi è il giorno stimato dell'ovulazione, il più fertile del ciclo.", tag: "ciclo-ovulazione" });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { oggi, ieri, ora } = adessoARoma();
  let corpo: { prova?: boolean; app?: string } = {};
  try { corpo = await req.json(); } catch { /* chiamata del cron senza corpo */ }
  const cron = !!CRON_SECRET && token === CRON_SECRET;
  const provaCiclo = !cron && corpo.app === "ciclo";

  let utenti: string[];
  let prova = false;
  const livelloDi = new Map<string, number>();
  const giaApertoOggi = new Set<string>();
  const insultoDi = new Map<string, Messaggio>();
  if (cron) {
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
  let inviate = 0;
  const errori: string[] = [];
  type Dispositivo = { endpoint: string; subscription: webpush.PushSubscription; user_id: string; app?: string };
  const invia = async (d: Dispositivo, msg: Messaggio) => {
    try {
      await webpush.sendNotification(d.subscription, JSON.stringify({ ...msg, url: URL_DI[d.app ?? "kristian"] ?? APP_URL }), { TTL: 3600 });
      inviate++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Dispositivo non più valido (app disinstallata o permesso tolto): lo togliamo.
      if (code === 404 || code === 410) await db.from("dispositivi").delete().eq("endpoint", d.endpoint);
      else errori.push(String((e as Error).message ?? e));
    }
  };

  // Avvisi del Ciclo di Kendra: all'ora scelta nell'app, solo sui dispositivi dell'app del ciclo.
  if (cron) {
    const { data: dc, error: ec } = await db.from("dispositivi").select("endpoint, subscription, user_id, app").eq("app", "ciclo");
    if (!ec && dc?.length) {
      const ids = [...new Set(dc.map((d) => d.user_id))];
      const { data: righe } = await db.from("ciclo_kendra").select("user_id, data").in("user_id", ids);
      for (const r of righe ?? []) {
        const msgs = messaggiCiclo((r.data ?? {}) as DatiCiclo, oggi, ora);
        for (const d of dc.filter((x) => x.user_id === r.user_id) as Dispositivo[]) for (const m of msgs) await invia(d, m);
      }
    }
  }
  if (!utenti.length) return json({ inviate, errori });

  // Se la colonna "app" non esiste ancora (SQL non eseguito), tutti i dispositivi sono del Quaderno di Kristian.
  const conApp = await db.from("dispositivi").select("endpoint, subscription, user_id, app").in("user_id", utenti);
  let disp = conApp.data as Dispositivo[] | null;
  if (conApp.error) {
    const senza = await db.from("dispositivi").select("endpoint, subscription, user_id").in("user_id", utenti);
    if (senza.error) return json({ errore: senza.error.message }, 500);
    disp = senza.data as Dispositivo[];
  }

  // La prova dell'app del ciclo va solo ai suoi dispositivi; i promemoria dei Quaderni non vanno mai lì.
  disp = (disp ?? []).filter((d) => (provaCiclo ? d.app === "ciclo" : d.app !== "ciclo"));
  for (const d of disp) {
    const kendra = d.app === "kendra";
    const msg: Messaggio = provaCiclo
      ? { title: "Prova riuscita!", body: "Le notifiche del ciclo funzionano. Ti avviso prima del ciclo, nei giorni fertili e se è in ritardo." }
      : prova
      ? (kendra
        ? { title: "Prova riuscita!", body: "Le notifiche funzionano. Ti scrivo negli orari che hai scelto." }
        : { title: "Prova riuscita!", body: "Le notifiche funzionano. Se un giorno non apri l'app, ti scrivo negli orari scelti, sempre più arrabbiato." })
      : kendra
      ? { title: pick(KENDRA.titoli), body: pick(KENDRA.frasi).replace("{ora}", `${ora}`) }
      : (() => {
        const l = LIVELLI[livelloDi.get(d.user_id) ?? 2];
        const frasi = giaApertoOggi.has(d.user_id) ? l.giaAperto : l.frasi;
        return { title: pick(l.titoli), body: pick(frasi).replace("{ora}", `${ora}`) };
      })();
    await invia(d, msg);
    const ins = kendra ? undefined : insultoDi.get(d.user_id);
    if (ins) await invia(d, ins);
  }
  return json({ inviate, dispositivi: disp?.length ?? 0, errori });
});
