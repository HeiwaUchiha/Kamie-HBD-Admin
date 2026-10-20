import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// Public client config (not a secret). Security comes from the Firestore rules.
const app = initializeApp({
  apiKey: "AIzaSyBnbcg28XwfTXNqbaEVl_kGMZjr5IaDE8k",
  authDomain: "kamie-hbd-tracker.firebaseapp.com",
  projectId: "kamie-hbd-tracker",
  storageBucket: "kamie-hbd-tracker.firebasestorage.app",
  messagingSenderId: "788658613045",
  appId: "1:788658613045:web:c19be35c1091aa08773a7c"
});
const auth = getAuth(app), db = getFirestore(app);
const $ = (s) => document.querySelector(s);
const LIMIT = 1000;
let unsub = null, events = [];

const SEC = { welcome: "Welcome", declined: "No screen", hub: "Menu", wish: "Wish", pictures: "Pictures", song: "Song", person: "Person", letter: "Letter", rating: "Rating" };
const OPENABLE = ["wish", "pictures", "song", "person", "letter"];
const TYPES = { site_opened: "Site opened", gift_accepted: "Said YES", gift_declined: "Said NO", declined_return: "Back from NO", hub_returned: "Back to menu", section_opened: "Section opened", album_opened: "Album opened", photo_opened: "Photo opened", video_played: "Video opened", person_view_opened: "Person page opened", letter_downloaded: "Letter download", wish_send_clicked: "Wish send clicked", rating_opened: "Rating opened" };

const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const when = (e) => e.createdAt.toDate();
const fmt = (e) => when(e).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
const ago = (e) => { const m = Math.round((Date.now() - when(e)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const tally = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };

function describe(e) {
  const l = e.label || "";
  switch (e.type) {
    case "site_opened": return "Opened the gift site";
    case "gift_accepted": return "Said YES to the gift (menu opened)";
    case "gift_declined": return "Said NO to the gift";
    case "declined_return": return "Went back from the “no” screen";
    case "hub_returned": return "Returned to the menu" + (l ? ` from ${SEC[l] || l}` : "");
    case "section_opened": return `Opened “${SEC[e.section] || e.section}”`;
    case "album_opened": return `Opened the ${l} album`;
    case "photo_opened": return `Opened photo ${l}`;
    case "video_played": return `Opened video ${l}`;
    case "person_view_opened": return `Opened ${l === "lynx" ? "Baby Cat" : "Mama Bear"}`;
    case "letter_downloaded": return "Clicked the letter download";
    case "wish_send_clicked": return "Clicked send on the wish (text not recorded)";
    case "rating_opened": return "Opened the rating box";
    default: return e.type;
  }
}

// ----- screens -----
function show(name) { for (const id of ["loading", "login", "denied", "app"]) $("#" + id).hidden = id !== name; }
function setConn(s) { const c = $("#conn"); c.dataset.s = s; c.lastChild.textContent = { live: "Live", connecting: "Connecting…", offline: "Offline", error: "Connection problem" }[s]; }
function stop() { if (unsub) unsub(); unsub = null; events = []; resetClear(); $("#clearMsg").textContent = ""; for (const id of ["cards", "trend", "feedList", "secBars", "albumBars", "personBars", "mediaBars", "sessList"]) $("#" + id).replaceChildren(); }

// ----- auth -----
onAuthStateChanged(auth, (user) => {
  stop();
  if (!user) return show("login");
  show("loading"); // stays here until the SERVER confirms access
  $("#deniedWho").textContent = user.email || "this account";
  $("#setName").textContent = user.displayName || "—";
  $("#setEmail").textContent = user.email || "—";
  $("#setUid").textContent = user.uid;
  unsub = onSnapshot(query(collection(db, "events"), orderBy("createdAt", "desc"), limit(LIMIT)), { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache) return setConn("connecting");
      events = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.createdAt);
      $("#banner").hidden = true;
      setConn(navigator.onLine ? "live" : "offline");
      show("app"); render();
    },
    (err) => {
      if (err.code === "permission-denied") { stop(); return show("denied"); }
      setConn("error"); $("#banner").textContent = "Could not load activity (" + err.code + ")."; $("#banner").hidden = false;
    });
});
$("#loginBtn").addEventListener("click", async () => {
  const msg = $("#loginErr"); msg.textContent = "";
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, p); } catch (e) {
    msg.textContent = { "auth/popup-closed-by-user": "Sign-in was cancelled.", "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups for this site and retry.", "auth/unauthorized-domain": "This website’s domain isn’t authorized in Firebase yet.", "auth/network-request-failed": "Network problem. Check your connection." }[e.code] || "Sign-in failed (" + e.code + ").";
  }
});
document.querySelectorAll(".signout").forEach((b) => b.addEventListener("click", () => signOut(auth)));
addEventListener("online", () => setConn("live")); addEventListener("offline", () => setConn("offline"));

// ----- clear all events (admin only; the rules enforce this too) -----
function resetClear() { $("#clearConfirm").hidden = true; $("#clearBtn").hidden = false; $("#clearInput").value = ""; $("#clearGo").disabled = true; }
$("#clearBtn").addEventListener("click", () => { $("#clearBtn").hidden = true; $("#clearConfirm").hidden = false; $("#clearInput").focus(); });
$("#clearCancel").addEventListener("click", resetClear);
$("#clearInput").addEventListener("input", (e) => { $("#clearGo").disabled = e.target.value !== "CLEAR"; });
$("#clearGo").addEventListener("click", async () => {
  const msg = $("#clearMsg"); let n = 0;
  $("#clearGo").disabled = true; msg.textContent = "Deleting…";
  try {
    for (;;) { // delete in batches of 400 (Firestore allows at most 500 per batch)
      const snap = await getDocs(query(collection(db, "events"), limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db); snap.docs.forEach((d) => batch.delete(d.ref)); await batch.commit();
      n += snap.size; msg.textContent = `Deleted ${n}…`;
    }
    msg.textContent = `Done. ${n} events deleted.`;
  } catch (e) {
    msg.textContent = e.code === "permission-denied" ? "Delete refused. Publish the updated rules in Firebase first." : "Delete failed (" + e.code + ").";
  }
  resetClear();
});

// ----- navigation -----
$("#nav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]"); if (!b) return;
  document.querySelectorAll("#nav button").forEach((x) => x.removeAttribute("aria-current"));
  b.setAttribute("aria-current", "page");
  document.querySelectorAll("[data-v]").forEach((s) => (s.hidden = s.id !== "v-" + b.dataset.view));
});

// ----- rendering -----
function bars(el, rows) {
  if (!rows.some((r) => r[1])) return el.replaceChildren(h("p", "empty", "No data yet."));
  const max = Math.max(...rows.map((r) => r[1]));
  el.replaceChildren(...rows.map(([k, v]) => {
    const row = h("div", "row"), t = h("div", "track"), i = h("i");
    i.style.width = (v / max) * 100 + "%"; t.append(i);
    row.append(h("span", "", k), t, h("span", "val", v)); return row;
  }));
}
const stat = (k, v, s) => { const c = h("div", "card"); c.append(h("p", "k", k), h("p", "v", v), h("p", "s", s)); return c; };

function render() {
  const ev = events, loads = ev.filter((e) => e.type === "site_opened").length;
  const opens = tally(ev.filter((e) => e.type === "section_opened"), (e) => e.section);
  const lastOpen = ev.find((e) => e.type === "section_opened"), last = ev[0];
  $("#cards").replaceChildren(
    stat("Total events", ev.length >= LIMIT ? LIMIT + "+" : ev.length, `${loads} page loads · ${ev.length - loads} interactions`),
    stat("Visits (sessions)", new Set(ev.map((e) => e.sessionId)).size, "Anonymous browser-tab visits"),
    stat("Latest section visited", lastOpen ? SEC[lastOpen.section] : "—", lastOpen ? ago(lastOpen) : "No section opened yet"),
    stat("Most opened section", opens[0] ? SEC[opens[0][0]] : "—", opens[0] ? `${opens[0][1]} opens` : "No data yet"),
    stat("Latest activity", last ? ago(last) : "—", last ? fmt(last) : "Waiting for the first event"));
  $("#capNote").textContent = ev.length >= LIMIT ? `Showing only the most recent ${LIMIT} events.` : "";

  const dayKey = (d) => d.toLocaleDateString([], { month: "short", day: "numeric" });
  const days = new Map();
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.set(dayKey(d), 0); }
  ev.forEach((e) => { const k = dayKey(when(e)); if (days.has(k)) days.set(k, days.get(k) + 1); });
  bars($("#trend"), [...days]);

  $("#feedList").replaceChildren(...(ev.length ? ev.slice(0, 100).map((e) => {
    const li = h("li"); li.append(h("strong", "", describe(e)), h("span", "meta", `${SEC[e.section] || e.section} · ${fmt(e)} · visit ${e.sessionId.slice(0, 8)}`)); return li;
  }) : [h("li", "empty", "No activity recorded yet.")]));

  const count = (type) => tally(ev.filter((e) => e.type === type), (e) => e.label);
  const counts = new Map(opens);
  bars($("#secBars"), OPENABLE.map((s) => [SEC[s], counts.get(s) || 0]));
  bars($("#albumBars"), count("album_opened"));
  bars($("#personBars"), count("person_view_opened").map(([k, v]) => [k === "lynx" ? "Baby Cat" : "Mama Bear", v]));
  bars($("#mediaBars"), tally(ev.filter((e) => e.type === "photo_opened" || e.type === "video_played"), (e) => e.label).slice(0, 8));
  renderHistory();
}

function renderHistory() {
  const t = $("#fType").value, s = $("#fSec").value, r = $("#fRange").value;
  const start = r === "today" ? new Date().setHours(0, 0, 0, 0) : r === "7" ? Date.now() - 7 * 864e5 : 0;
  const list = events.filter((e) => (!t || e.type === t) && (!s || e.section === s) && when(e) >= start);
  const groups = new Map();
  list.forEach((e) => { if (!groups.has(e.sessionId)) groups.set(e.sessionId, []); groups.get(e.sessionId).push(e); });
  $("#histCount").textContent = `${list.length} events in ${groups.size} visits`;
  $("#sessList").replaceChildren(...(groups.size ? [...groups].slice(0, 50).map(([id, evs]) => {
    const d = h("details"), sm = h("summary");
    const mins = Math.max(0, Math.round((when(evs[0]) - when(evs[evs.length - 1])) / 60000));
    sm.textContent = `Visit ${id.slice(0, 8)} · ${fmt(evs[evs.length - 1])} · ${evs.length} events · ${mins} min`;
    const ul = h("ul"); evs.forEach((e) => ul.append(h("li", "", `${when(e).toLocaleTimeString()} — ${describe(e)}`)));
    d.append(sm, ul); return d;
  }) : [h("p", "empty", "No matching activity.")]));
}
for (const [k, v] of Object.entries(TYPES)) $("#fType").append(new Option(v, k));
for (const [k, v] of Object.entries(SEC)) $("#fSec").append(new Option(v, k));
["#fType", "#fSec", "#fRange"].forEach((id) => $(id).addEventListener("change", renderHistory));
