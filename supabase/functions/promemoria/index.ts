// Edge Function "promemoria": manda la notifica serale del Quaderno.
// - Chiamata ogni ora dal cron (con CRON_SECRET): se quest'ora è tra quelle scelte
//   manda una frase più o meno cattiva, diversa se oggi hai già aperto l'app.
//   Al primo orario della giornata manda anche un insulto per gli obiettivi di ieri
//   rimasti senza spunta (né "fatto" né "non fatto").
// - Chiamata dall'app con il tuo login: manda subito una notifica di prova.
// - I dispositivi del Quaderno di Kendra (colonna app = 'kendra') ricevono solo frasi gentili.
// - I dispositivi del Ciclo di Kendra (colonna app = 'ciclo') ricevono solo gli avvisi del ciclo:
//   due giorni prima, il giorno previsto, ogni giorno di ritardo, giorni fertili e ovulazione.
// - I dispositivi del Quaderno di Krasimir (colonna app = 'krasimir') ricevono una notifica per ogni
//   obiettivo di oggi non ancora fatto, con suono e vibrazione: agli orari scelti e all'ora del singolo obiettivo.
// - Anche nel Quaderno di Kristian e in quello di Kendra, oltre alla frase normale, arriva una notifica per ogni
//   obiettivo di oggi non spuntato ("Ricordati di fare allenamento oggi!"): agli orari scelti e all'ora
//   dell'obiettivo, se gliel'hai data. Per Kristian il tono peggiora col passare delle ore, per Kendra resta gentile.
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
  krasimir: "https://kristiankunov77-cloud.github.io/quaderno-krasimir/",
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
type Messaggio = { title: string; body: string; tag?: string; vibrate?: number[] };

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

// ---------- Quaderno di Krasimir ----------
// "Chiamare Francesco" diventa "Ricordati di chiamare Francesco oggi!".
const VIBRA = [400, 150, 400, 150, 400];
function frase(testo: string, quando = "oggi") {
  const t = testo.trim().replace(/[.!\s]+$/, "");
  const primo = t.split(/\s+/)[0] ?? "";
  const oggi = new RegExp(`\\b${quando.split(" ").pop()}\\b`, "i").test(t) ? "" : ` ${quando}`;
  if (/^ricordati\b/i.test(t)) return `${t.charAt(0).toUpperCase()}${t.slice(1)}!`;
  if (/^ricordar(e|si)\s/i.test(t)) return `Ricordati ${t.replace(/^ricordar(e|si)\s+/i, "")}${oggi}!`;
  // Se inizia con un verbo all'infinito (chiamare, mandare, comprare...) la frase scorre meglio.
  if (/^[A-Za-zÀ-ú]+(are|ere|ire|rre|arsi|ersi|irsi|arlo|arla|arle|arli|erlo|irlo)$/i.test(primo)) return `Ricordati di ${t.charAt(0).toLowerCase()}${t.slice(1)}${oggi}!`;
  return `Ricordati${oggi}: ${t}!`;
}
type ObiettivoK = { id?: string; text?: string; type?: string; date?: string; done?: boolean; failed?: boolean; ora?: number | null };
function messaggiKrasimir(goals: ObiettivoK[], oggi: string, ora: number, ore: number[] | null): Messaggio[] {
  const delGiorno = goals.filter((g) => g.type === "day" && g.date === oggi);
  const daFare = delGiorno.filter((g) => !g.done && !g.failed && g.text);
  const orarioScelto = !!ore && ore.includes(ora);
  const out: Messaggio[] = [];
  if (orarioScelto && !delGiorno.length && Math.min(...ore!) === ora) {
    out.push({ title: "Buongiorno Krasimir!", body: "Scrivi le cose da fare oggi, così te le ricordo io.", tag: "krasimir-giorno", vibrate: VIBRA });
  }
  const ora_ = daFare.filter((g) => g.ora === ora);
  const altri = orarioScelto ? daFare.filter((g) => g.ora !== ora) : [];
  for (const g of ora_) out.push({ title: `Sono le ${ora}:00`, body: frase(g.text!), tag: `krasimir-${g.id}`, vibrate: VIBRA });
  // Al massimo 6 notifiche per volta, le altre in una sola.
  const max = Math.max(0, 6 - out.length);
  for (const g of altri.slice(0, altri.length > max ? max - 1 : max)) out.push({ title: "Da fare oggi", body: frase(g.text!), tag: `krasimir-${g.id}`, vibrate: VIBRA });
  if (altri.length > max && max > 0) {
    const resto = altri.length - (max - 1);
    out.push({ title: "Da fare oggi", body: `Hai ancora altre ${resto} cose da fare oggi. Apri il Quaderno per vederle.`, tag: "krasimir-altre", vibrate: VIBRA });
  }
  return out;
}

// ---------- Obiettivi nel Quaderno di Kristian e di Kendra ----------
const TABELLA_DI: Record<string, string> = { kristian: "quaderno", kendra: "quaderno_kendra" };
const lunediDi = (s: string) => piu(s, -((new Date(utc(s)).getUTCDay() + 6) % 7));
// Kristian: tranquillo al primo orario, poi sempre più cattivo. {f} è "Ricordati di ... oggi!".
const OB_KRISTIAN = [
  { titoli: ["Obiettivo di oggi"], frasi: ["{f}", "{f} Quando lo fai, spuntalo.", "{f} Dai che ce la fai."] },
  {
    titoli: ["Obiettivo di oggi", "Ehi Kristian!"],
    frasi: ["{f} Muoviti.", "{f} Non farmelo ripetere.", "{f} Sono le {ora} e non è ancora spuntato, campione.", "{f} Il telefono può aspettare."],
  },
  {
    titoli: ["Ancora da fare", "KRISTIAN!", "Ultima chiamata"],
    frasi: [
      "{f} Sono le {ora} e non l'hai ancora fatto, cazzo.",
      "{f} Muovi il culo, poi puoi tornare a scrollare.",
      "{f} Se non lo spunti sono -{p} punti, coglione.",
      "{f} Che cazzo aspetti? La giornata sta finendo.",
    ],
  },
];
const OB_KENDRA = {
  titoli: ["Obiettivo di oggi", "Piccolo promemoria"],
  frasi: ["{f}", "{f} Ce la fai!", "{f} Un passo alla volta.", "{f} Poi spuntalo nel Quaderno."],
};
const livelloPerOra = (ora: number) => (ora < 13 ? 0 : ora < 19 ? 1 : 2);

function messaggiObiettivi(
  app: string, goals: ObiettivoK[], oggi: string, ora: number, ore: number[], liv: number,
): Messaggio[] {
  const daFare = goals.filter((g) => g.type === "day" && g.date === oggi && !g.done && !g.failed && g.text);
  const orarioScelto = ore.includes(ora);
  const primoOrario = orarioScelto && Math.min(...ore) === ora;
  const kendra = app === "kendra";
  const testo = (f: string, l: number) => {
    const t = kendra ? OB_KENDRA : OB_KRISTIAN[l];
    return { title: pick(t.titoli), body: pick(t.frasi).replace("{f}", f).replace("{ora}", `${ora}`).replace("{p}", `${PUNTI_NON_FATTO}`) };
  };
  const out: Messaggio[] = [];
  // All'ora del singolo obiettivo.
  for (const g of daFare.filter((g) => g.ora === ora)) {
    out.push({ ...testo(frase(g.text!), livelloPerOra(ora)), title: `Sono le ${ora}:00`, tag: `ob-${g.id ?? g.text}` });
  }
  if (orarioScelto) {
    const altri: Messaggio[] = daFare.filter((g) => g.ora !== ora).map((g) => ({ ...testo(frase(g.text!), liv), tag: `ob-${g.id ?? g.text}` }));
    // Gli obiettivi della settimana solo al primo orario della giornata.
    if (primoOrario) {
      const lun = lunediDi(oggi);
      for (const g of goals.filter((g) => g.type === "week" && g.date === lun && !g.done && !g.failed && g.text)) {
        altri.push({ title: "Obiettivo della settimana", body: frase(g.text!, "questa settimana"), tag: `ob-${g.id ?? g.text}` });
      }
    }
    // Al massimo 4 per volta, gli altri in una sola notifica.
    const max = Math.max(1, 4 - out.length);
    if (altri.length > max) {
      out.push(...altri.slice(0, max - 1));
      const resto = altri.length - (max - 1);
      out.push({
        title: kendra ? "Obiettivi di oggi" : "Obiettivi di oggi",
        body: kendra
          ? `Hai ancora altri ${resto} obiettivi da fare. Apri il Quaderno per vederli.`
          : `Hai ancora altri ${resto} obiettivi da fare. ${liv === 2 ? "Muoviti, cazzo." : "Apri il Quaderno."}`,
        tag: "ob-altri",
      });
    } else out.push(...altri);
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
  const oreDi = new Map<string, number[]>();
  if (cron) {
    // Tutti i promemoria attivi: anche fuori dagli orari scelti può esserci un obiettivo con la sua ora.
    const { data, error } = await db.from("promemoria").select("user_id, ultimo_accesso, ore").eq("attivo", true);
    if (error) return json({ errore: error.message }, 500);
    for (const r of data ?? []) oreDi.set(r.user_id, Array.isArray(r.ore) ? r.ore : []);
    utenti = (data ?? []).map((r) => r.user_id);
    // La notifica parte a ogni orario scelto, anche se oggi hai già aperto l'app:
    // cambia solo la frase.
    const daAvvisare = (data ?? []).filter((r) => oreDi.get(r.user_id)!.includes(ora));
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
  // Quaderno di Krasimir: ogni ora controlla gli obiettivi di oggi.
  if (cron) {
    const { data: dk, error: ek } = await db.from("dispositivi").select("endpoint, subscription, user_id, app").eq("app", "krasimir");
    if (!ek && dk?.length) {
      const ids = [...new Set(dk.map((d) => d.user_id))];
      const { data: righe } = await db.from("quaderno_krasimir").select("user_id, data").in("user_id", ids);
      const { data: prom } = await db.from("promemoria").select("user_id, attivo, ore").in("user_id", ids);
      for (const r of righe ?? []) {
        const p = (prom ?? []).find((x) => x.user_id === r.user_id);
        const ore = p && p.attivo !== false && Array.isArray(p.ore) ? p.ore as number[] : null;
        const msgs = messaggiKrasimir((r.data?.goals ?? []) as ObiettivoK[], oggi, ora, ore);
        for (const d of dk.filter((x) => x.user_id === r.user_id) as Dispositivo[]) for (const m of msgs) await invia(d, m);
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
  // Il Quaderno di Krasimir ha le sue notifiche (sopra): qui riceve solo la prova.
  disp = (disp ?? []).filter((d) => (provaCiclo ? d.app === "ciclo" : d.app !== "ciclo" && (prova || d.app !== "krasimir")));
  let provaKrasimir: Messaggio | null = null;
  if (prova && disp.some((d) => d.app === "krasimir")) {
    const { data: q } = await db.from("quaderno_krasimir").select("data").eq("user_id", utenti[0]).maybeSingle();
    const g = ((q?.data?.goals ?? []) as ObiettivoK[]).find((x) => x.type === "day" && x.date === oggi && !x.done && !x.failed && x.text);
    provaKrasimir = {
      title: "Prova riuscita!",
      body: g ? frase(g.text!) : "Le notifiche funzionano. Ti avviso per ogni cosa da fare, con suono e vibrazione.",
      tag: "krasimir-prova",
      vibrate: VIBRA,
    };
  }
  // Obiettivi di ogni utente, dalla tabella della sua app.
  const obiettiviDi = new Map<string, ObiettivoK[]>();
  if (!provaCiclo) {
    for (const app of ["kristian", "kendra"]) {
      const ids = [...new Set(disp.filter((d) => (d.app ?? "kristian") === app).map((d) => d.user_id))];
      if (!ids.length) continue;
      const { data: righe } = await db.from(TABELLA_DI[app]).select("user_id, data").in("user_id", ids);
      for (const r of righe ?? []) obiettiviDi.set(`${app}:${r.user_id}`, (r.data?.goals ?? []) as ObiettivoK[]);
    }
  }
  for (const d of disp) {
    if (d.app === "krasimir") { if (provaKrasimir) await invia(d, provaKrasimir); continue; }
    const kendra = d.app === "kendra";
    const app = kendra ? "kendra" : "kristian";
    const goals = obiettiviDi.get(`${app}:${d.user_id}`) ?? [];
    if (cron) {
      const ore = oreDi.get(d.user_id) ?? [];
      const liv = livelloDi.get(d.user_id) ?? livelloPerOra(ora);
      const obiettivi = messaggiObiettivi(app, goals, oggi, ora, ore, liv);
      // Fuori dagli orari scelti arrivano solo gli obiettivi con quell'ora.
      if (!ore.includes(ora)) { for (const m of obiettivi) await invia(d, m); continue; }
      await invia(d, kendra
        ? { title: pick(KENDRA.titoli), body: pick(KENDRA.frasi).replace("{ora}", `${ora}`) }
        : (() => {
          const l = LIVELLI[liv];
          const frasi = giaApertoOggi.has(d.user_id) ? l.giaAperto : l.frasi;
          return { title: pick(l.titoli), body: pick(frasi).replace("{ora}", `${ora}`) };
        })());
      const ins = kendra ? undefined : insultoDi.get(d.user_id);
      if (ins) await invia(d, ins);
      for (const m of obiettivi) await invia(d, m);
      continue;
    }
    const msg: Messaggio = provaCiclo
      ? { title: "Prova riuscita!", body: "Le notifiche del ciclo funzionano. Ti avviso prima del ciclo, nei giorni fertili e se è in ritardo." }
      : kendra
      ? { title: "Prova riuscita!", body: "Le notifiche funzionano. Ti scrivo negli orari che hai scelto e ti ricordo i tuoi obiettivi." }
      : { title: "Prova riuscita!", body: "Le notifiche funzionano. Ti scrivo negli orari scelti, sempre più arrabbiato, e ti ricordo ogni obiettivo." };
    await invia(d, msg);
    // Nella prova, un esempio con un obiettivo di oggi non ancora fatto.
    const g = provaCiclo ? undefined : goals.find((x) => x.type === "day" && x.date === oggi && !x.done && !x.failed && x.text);
    if (g) await invia(d, { title: "Così ti ricordo gli obiettivi", body: frase(g.text!), tag: "ob-prova" });
  }
  return json({ inviate, dispositivi: disp?.length ?? 0, errori });
});
