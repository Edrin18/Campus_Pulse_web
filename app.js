import { esc, safeUrl, parseSheet, searchSheet, dateKey, wpmComment, timeText, WORDS } from "./util.js";
import { firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const APP_VERSION = "1.9.1";
const DAY = 24 * 60 * 60 * 1000;
const TYPES = ["Event", "Workshop", "Club", "Exam", "Announcement", "Nearby"];
const JOKES = ["Attendance is mandatory. Snacks are not guaranteed.", "Exams are temporary. Memes are forever.", "Free food events: the real campus economy.", "Sleep is optional. Deadlines are not.", "You are not late, you are fashionably on campus."];
const EXAM_JOKES = ["Caffeine is not a study plan.", "Pray. Then revise.", "Bring a pen. And hope."];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const $ = (id) => document.getElementById(id);
const view = $("view");
const S = { user: null, isAdmin: false, tab: "campus", subs: [], timers: [] };
let auth, db;

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 4500);
}
function clearAll() {
  S.subs.forEach((f) => { try { f(); } catch {} }); S.subs = [];
  S.timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); S.timers = [];
}
function openModal(html, onMount) {
  const m = $("modal"); m.innerHTML = `<div class="sheet">${html}</div>`; m.classList.remove("hidden");
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  if (onMount) onMount(m);
}
function closeModal() { const m = $("modal"); m.classList.add("hidden"); m.innerHTML = ""; }
const firstName = () => (S.user.displayName || "friend").split(" ")[0];
const myName = () => S.user.displayName || "Student";
const link = (u, label, cls = "btn") => `<a class="${cls}" style="text-decoration:none;display:inline-block" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

// ---------------- start + login ----------------
function start() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE")) { $("setup").classList.remove("hidden"); return; }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app);
  $("loginBtn").onclick = async () => {
    $("loginErr").textContent = "";
    const p = new GoogleAuthProvider();
    try { await signInWithPopup(auth, p); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") { try { await signInWithRedirect(auth, p); } catch (e2) { $("loginErr").textContent = e2.message; } }
      else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("loginErr").textContent = e.message;
    }
  };
  $("logout").onclick = () => signOut(auth);
  document.querySelectorAll("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  onAuthStateChanged(auth, async (u) => {
    clearAll(); S.user = u; S.isAdmin = false;
    if (!u) { $("app").classList.add("hidden"); $("login").classList.remove("hidden"); return; }
    try { S.isAdmin = (await getDoc(doc(db, "admins", u.uid))).exists(); } catch {}
    $("login").classList.add("hidden"); $("app").classList.remove("hidden");
    $("who").textContent = myName() + (S.isAdmin ? " (admin)" : "");
    go("campus");
  });
}

function go(tab) {
  S.tab = tab; clearAll();
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  ({ campus: renderCampus, exams: renderExams, faculty: renderFaculty, chat: renderChat, type: renderType, about: renderAbout })[tab]();
  window.scrollTo(0, 0);
}

// ---------------- CAMPUS ----------------
function renderCampus() {
  view.innerHTML = `<h1>Hey ${esc(firstName())} 👋</h1><p class="sub">${S.isAdmin ? "Admin mode: with great power comes great spam" : esc(pick(JOKES))}</p>
    <input id="q" class="input" placeholder="Search events, places..."><div class="chips" id="chips"></div><div id="list"></div>
    ${S.isAdmin ? '<button class="fab" id="add">+ Post update</button>' : ""}`;
  let items = [], filter = "All", term = ""; const open = new Set();
  const drawChips = () => { $("chips").innerHTML = ["All", ...TYPES].map((t) => `<button class="chip ${t === filter ? "on" : ""}" data-t="${esc(t)}">${esc(t)}</button>`).join(""); };
  const cardHtml = (it) => {
    const o = open.has(it.id), reg = safeUrl(it.link);
    return `<article class="card" data-id="${esc(it.id)}"><div class="row"><span class="tag">${esc(it.type)}</span>${S.isAdmin ? `<button class="link danger" data-del="${esc(it.id)}">Delete</button>` : ""}</div>
      <h3>${esc(it.title)}</h3>${o ? `${it.whenText ? `<div>🕒 ${esc(it.whenText)}</div>` : ""}${it.place ? `<div>📍 ${esc(it.place)}</div>` : ""}
      ${it.details ? `<p class="muted pre">${esc(it.details)}</p>` : ""}${it.type === "Exam" ? `<p class="accent small">${esc(EXAM_JOKES[it.id.length % EXAM_JOKES.length])}</p>` : ""}
      <div class="row" style="justify-content:flex-start">${reg ? link(reg, "Register") : ""}${it.full ? `<button class="btn alt" data-full="${esc(it.id)}">&gt;&gt; Details</button>` : ""}</div>` : '<p class="muted small" style="margin:0">Tap for venue &amp; timings</p>'}</article>`;
  };
  const draw = () => {
    const l = items.filter((i) => (filter === "All" || i.type === filter) && (!term || (i.title + " " + i.place).toLowerCase().includes(term)));
    $("list").innerHTML = l.length ? l.map(cardHtml).join("") : '<p class="empty">Nothing here. Campus is quiet...<br>suspiciously quiet. 🦗</p>';
  };
  drawChips(); draw();
  $("q").oninput = (e) => { term = e.target.value.trim().toLowerCase(); draw(); };
  $("chips").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { filter = b.dataset.t; drawChips(); draw(); } };
  $("list").onclick = (e) => {
    if (e.target.closest("a")) return;
    const del = e.target.closest("[data-del]");
    if (del) { if (confirm("Delete this post?")) deleteDoc(doc(db, "feed", del.dataset.del)).catch((x) => toast(x.message)); return; }
    const f = e.target.closest("[data-full]");
    if (f) { showFull(items.find((i) => i.id === f.dataset.full)); return; }
    const a = e.target.closest("article"); if (a) { const id = a.dataset.id; open.has(id) ? open.delete(id) : open.add(id); draw(); }
  };
  if ($("add")) $("add").onclick = showAddPost;
  S.subs.push(onSnapshot(query(collection(db, "feed"), orderBy("createdAt", "desc"), limit(100)),
    (snap) => { items = snap.docs.map((d) => ({ id: d.id, type: "Event", title: "", details: "", place: "", whenText: "", link: "", full: "", ...d.data() })); draw(); },
    (e) => toast("Could not load posts: " + e.message)));
}
function showFull(it) {
  if (!it) return;
  const urls = [...new Set((it.full.match(/https?:\/\/[^\s]+/g) || []).map((u) => u.replace(/[.,)]+$/, "")))];
  const reg = safeUrl(it.link);
  openModal(`<div class="row"><span class="accent small">${esc(it.type)}</span><button class="link" id="mc">Close</button></div><h2>${esc(it.title)}</h2>
    ${it.whenText ? `<div>🕒 ${esc(it.whenText)}</div>` : ""}${it.place ? `<div>📍 ${esc(it.place)}</div>` : ""}<p class="pre">${esc(it.full)}</p>
    ${reg ? `<p>${link(reg, "Register")}</p>` : ""}${urls.map((u) => `<div>${link(safeUrl(u), "🔗 " + u.slice(0, 45), "link")}</div>`).join("")}`, () => ($("mc").onclick = closeModal));
}
function showAddPost() {
  let type = "Event";
  openModal(`<h2>Post an update</h2><div class="chips" id="tc"></div>
    <input id="f1" class="input" placeholder="Title"><input id="f2" class="input" placeholder="Date & time (e.g. 12 Oct, 10 AM)"><input id="f3" class="input" placeholder="Venue">
    <textarea id="f4" rows="2" placeholder="Short details"></textarea><input id="f5" class="input" placeholder="Registration link (optional)">
    <textarea id="f6" rows="6" placeholder="Full details (long paragraph, optional)"></textarea>
    <div class="row" style="justify-content:flex-end"><button class="link" id="cx">Cancel</button><button class="btn" id="ok">Post</button></div>`, () => {
    const dc = () => ($("tc").innerHTML = TYPES.map((t) => `<button class="chip ${t === type ? "on" : ""}" data-t="${t}">${t}</button>`).join(""));
    dc(); $("tc").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { type = b.dataset.t; dc(); } };
    $("cx").onclick = closeModal;
    $("ok").onclick = async () => {
      const title = $("f1").value.trim(); if (!title) return toast("Title is required");
      try { await addDoc(collection(db, "feed"), { type, title, whenText: $("f2").value.trim(), place: $("f3").value.trim(), details: $("f4").value.trim(), link: $("f5").value.trim(), full: $("f6").value.trim(), createdAt: Date.now() }); closeModal(); }
      catch (e) { toast("Could not post: " + e.message); }
    };
  });
}

// ---------------- EXAMS ----------------
const sheetCache = new Map();
async function loadSheet(s) {
  const key = s.id + "|" + s.tab;
  if (sheetCache.has(key)) return sheetCache.get(key);
  let text;
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(s.id)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(s.tab)}`);
    if (!r.ok) throw new Error("bad status");
    text = await r.text();
  } catch { throw new Error("Could not open the sheet. Set sharing to 'Anyone with the link can view'."); }
  const sh = parseSheet(text); sheetCache.set(key, sh); return sh;
}
function renderExams() {
  view.innerHTML = `<h1>Exam seating</h1><p class="sub">Find your hall before the exam finds you.</p>
    ${S.isAdmin ? '<div class="card" id="adm"></div>' : ""}<input id="q" class="input" placeholder="Register number or name"><div id="st" class="muted small"></div><div id="res"></div>`;
  let sheets = [], loaded = [], cfgLoaded = false, loading = false;
  const saveCfg = (list) => setDoc(doc(db, "config", "exam"), { sheets: list, updatedAt: Date.now() }).catch((e) => toast("Save failed: " + e.message));
  const drawAdmin = () => {
    if (!S.isAdmin) return;
    $("adm").innerHTML = `<b>Admin: exam sheets (${sheets.length}/12)</b><p class="muted small">Add up to 12 Google Sheets (sharing: 'Anyone with the link'). Students are searched across all of them.</p>
      ${sheets.map((s, i) => `<div class="row"><div><div>${i + 1}. ${esc(s.label || "Sheet " + (i + 1))}</div><div class="muted small">Tab: ${esc(s.tab)} • …${esc(s.id.slice(-8))}</div></div><button class="link danger" data-rm="${i}">Remove</button></div>`).join("")}
      ${sheets.length < 12 ? `<input id="sl" class="input" placeholder="Google Sheet link"><input id="sb" class="input" placeholder="Label (optional)"><input id="stab" class="input" value="Nominal Roll"><button class="btn" id="sadd">Add sheet</button>` : ""}`;
    $("adm").onclick = (e) => { const r = e.target.closest("[data-rm]"); if (r && confirm("Remove this sheet?")) saveCfg(sheets.filter((_, i) => i !== +r.dataset.rm)); };
    if ($("sadd")) $("sadd").onclick = () => {
      const m = $("sl").value.match(/\/d\/([a-zA-Z0-9_-]+)/); if (!m) return toast("That doesn't look like a Google Sheets link");
      saveCfg([...sheets, { id: m[1], tab: $("stab").value.trim() || "Nominal Roll", label: $("sb").value.trim() }]);
    };
  };
  const card = (h) => {
    const sh = h.sh, v = (i) => (h.r[i] || "").trim();
    return `<div class="card">${h.label ? `<div class="muted small">${esc(h.label)}</div>` : ""}${sh.courseIdx >= 0 && v(sh.courseIdx) ? `<h3 style="color:var(--text)">${esc(v(sh.courseIdx))}</h3>` : ""}
      <div class="accent small">${esc(v(sh.nameIdx))} • ${esc(v(sh.regIdx))}</div><div style="margin-top:6px">${sh.headers.map((hd, i) => i !== sh.courseIdx && i !== sh.nameIdx && i !== sh.regIdx && hd.trim() && v(i) ? `<div>${esc(hd.trim())}: ${esc(v(i))}</div>` : "").join("")}</div>
      <p class="muted small" style="margin-bottom:0">${esc(pick(EXAM_JOKES))}</p></div>`;
  };
  const search = () => {
    const q = $("q").value, st = $("st");
    if (loading) { st.textContent = "Loading exam data..."; $("res").innerHTML = ""; return; }
    const errs = loaded.filter((l) => l.error);
    if (!cfgLoaded) return;
    if (!sheets.length) { st.textContent = "No exam sheet uploaded yet. The admin is probably still negotiating with the exam cell."; $("res").innerHTML = ""; return; }
    const hits = loaded.flatMap((l) => (l.sheet ? searchSheet(l.sheet, q).map((r) => ({ sh: l.sheet, label: l.cfg.label, r })) : [])).slice(0, 80);
    st.innerHTML = errs.length ? `<span style="color:var(--bad)">${errs.length} sheet(s) failed: ${esc(errs[0].error)}</span> <button class="link" id="rf">Try again</button>` : q.trim().length < 3 ? "Type your register number (exact) or at least 3 letters of your name. We'll tell you where to sit. Where to cry is your choice. 😅" : hits.length ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "No match found. Either you're not in this sheet, or a typo struck.";
    $("res").innerHTML = hits.map(card).join("");
    if ($("rf")) $("rf").onclick = () => { sheetCache.clear(); loadAll(); };
  };
  const loadAll = async () => {
    loading = true; search();
    loaded = await Promise.all(sheets.map(async (s) => { try { return { cfg: s, sheet: await loadSheet(s) }; } catch (e) { return { cfg: s, error: e.message }; } }));
    loading = false; search();
  };
  let deb; $("q").oninput = () => { clearTimeout(deb); deb = setTimeout(search, 200); };
  S.subs.push(onSnapshot(doc(db, "config", "exam"), (d) => {
    cfgLoaded = true; const x = d.exists() ? d.data() : {};
    sheets = Array.isArray(x.sheets) ? x.sheets.filter((s) => s && s.id).map((s) => ({ id: s.id, tab: s.tab || "Nominal Roll", label: s.label || "" })) : x.sheetId ? [{ id: x.sheetId, tab: x.tab || "Nominal Roll", label: "" }] : [];
    drawAdmin(); loadAll();
  }, (e) => toast("Could not load exam settings: " + e.message)));
}

// ---------------- FACULTY ----------------
function renderFaculty() {
  view.innerHTML = `<div class="row"><div><h1>Rate your faculty</h1><p class="sub">Be honest. Be kind. Faculty have feelings too.</p></div><button class="btn" id="rate">+ Rate</button></div>
    <p class="muted small">Reviews are posted as "Anonymous student".</p><input id="q" class="input" placeholder="Search faculty or course..."><div id="out"></div>`;
  let list = [], term = "";
  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const draw = () => {
    const l = list.filter((r) => !term || r.faculty.toLowerCase().includes(term) || r.subject.toLowerCase().includes(term));
    if (!list.length) { $("out").innerHTML = '<p class="empty">No reviews yet.<br>Be the first brave soul. 🫡</p>'; return; }
    if (!l.length) { $("out").innerHTML = `<p class="muted">No faculty or course matches "${esc(term)}". Spelling check? 🧐</p>`; return; }
    const g = {}; l.forEach((r) => { const k = r.faculty.trim().toLowerCase(); (g[k] = g[k] || { name: r.faculty.trim(), s: [] }).s.push(r.stars); });
    const board = Object.values(g).map((x) => ({ name: x.name, n: x.s.length, avg: x.s.reduce((a, b) => a + b, 0) / x.s.length })).sort((a, b) => b.avg - a.avg);
    $("out").innerHTML = `<h3>Leaderboard</h3>${board.map((b) => `<div class="card row"><div><b>${esc(b.name)}</b><div class="muted small">${b.n} review${b.n === 1 ? "" : "s"}</div></div><div class="accent" style="font-size:18px">${b.avg.toFixed(1)} ★</div></div>`).join("")}
      <h3>Latest reviews</h3>${l.map((r) => `<div class="card"><div class="row"><b>${esc(r.faculty)}</b>${S.isAdmin ? `<button class="link danger" data-del="${esc(r.id)}">Delete</button>` : ""}</div>
      <div class="muted small">Subject: ${esc(r.subject)}</div><div class="accent" style="font-size:18px">${stars(r.stars)}</div>${r.comment ? `<p class="pre" style="margin:4px 0">${esc(r.comment)}</p>` : ""}<div class="muted small">- Anonymous student</div></div>`).join("")}`;
  };
  $("q").oninput = (e) => { term = e.target.value.trim().toLowerCase(); draw(); };
  $("out").onclick = (e) => { const d = e.target.closest("[data-del]"); if (d && confirm("Delete this review?")) deleteDoc(doc(db, "ratings", d.dataset.del)).catch((x) => toast(x.message)); };
  $("rate").onclick = () => {
    let st = 0;
    openModal(`<h2>Rate a faculty</h2><input id="r1" class="input" placeholder="Faculty name"><input id="r2" class="input" placeholder="Subject they teach">
      <div class="muted small">Overall rating</div><div class="stars" id="sr"></div><textarea id="r3" rows="3" placeholder="How was the teaching? (optional)"></textarea>
      <div class="row" style="justify-content:flex-end"><button class="link" id="cx">Cancel</button><button class="btn" id="ok">Submit</button></div>`, () => {
      const ds = () => ($("sr").innerHTML = [1, 2, 3, 4, 5].map((i) => `<button data-s="${i}">${i <= st ? "★" : "☆"}</button>`).join(""));
      ds(); $("sr").onclick = (e) => { const b = e.target.closest("[data-s]"); if (b) { st = +b.dataset.s; ds(); } };
      $("cx").onclick = closeModal;
      $("ok").onclick = async () => {
        const faculty = $("r1").value.trim(), subject = $("r2").value.trim();
        if (!faculty || !subject || !st) return toast("Please fill the name, subject and stars");
        try { await addDoc(collection(db, "ratings"), { faculty, subject, stars: st, comment: $("r3").value.trim(), userId: S.user.uid, createdAt: Date.now() }); closeModal(); }
        catch (x) { toast("Could not submit: " + x.message); }
      };
    });
  };
  S.subs.push(onSnapshot(query(collection(db, "ratings"), orderBy("createdAt", "desc"), limit(500)),
    (snap) => { list = snap.docs.map((d) => { const x = d.data(); return { id: d.id, faculty: x.faculty || "", subject: x.subject || "", stars: Number(x.stars) || 0, comment: x.comment || "" }; }); draw(); },
    (e) => toast("Could not load reviews: " + e.message)));
}

// ---------------- CHAT + FEEDBACK ----------------
function renderChat() {
  view.innerHTML = `<h1>Campus chat</h1><p class="sub">Messages vanish after 24 hours. Screenshots do not. 🫥</p>
    <div class="chips"><button class="chip on" id="tg">Group chat</button><button class="chip" id="tf">${S.isAdmin ? "Feedback inbox" : "Feedback to admin"}</button></div><div id="pane"></div>`;
  const show = (which) => {
    clearAll(); $("tg").classList.toggle("on", which === 0); $("tf").classList.toggle("on", which === 1);
    which === 0 ? groupChat() : feedbackPane();
  };
  $("tg").onclick = () => show(0); $("tf").onclick = () => show(1);
  show(0);
}
function groupChat() {
  $("pane").innerHTML = `<div class="chat"><div id="msgs" class="msgs"></div><div id="rbar" class="rbar hidden"></div>
    <div class="send"><textarea id="mi" rows="1" maxlength="500" placeholder="Say something... the admin is watching 👀"></textarea><button id="sb" class="btn">Send</button></div></div>`;
  let msgs = [], replyTo = null, firstDraw = true;
  const track = new Map();
  const SLOW = ["Slow network... your message is hitching a ride 🐌", "Still trying... the internet is taking a nap 😴", "Network slower than Monday morning 🚶"];
  const SENT = ["Sent ✓ Delivered. No takebacks 😎", "Sent ✓ The group has been warned 📣", "Sent ✓ Your words are out in the wild 🚀"];
  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const status = (m) => { const t = track.get(m.id); if (!t) return ""; return t === "sending" ? '<div class="status">Sending...</div>' : t === "slow" ? `<div class="status slow">${SLOW[hash(m.id) % 3]}</div>` : `<div class="status">${SENT[hash(m.id) % 3]}</div>`; };
  const bubble = (m) => {
    const mine = m.uid === S.user.uid;
    return `<div class="bubble ${mine ? "mine" : ""}" data-id="${esc(m.id)}"><div><span class="nm">${mine ? "You" : esc(m.name)}</span>${m.admin ? '<span class="adm">ADMIN</span>' : ""}</div>
      ${m.rId ? `<div class="quote"><b>↩ ${esc(m.rName)}</b>${esc(m.rText)}</div>` : ""}<div class="txt">${esc(m.text)}</div>${mine ? status(m) : ""}
      <div class="meta"><span>${esc(timeText(m.ts))}</span><span class="rp" data-rp="${esc(m.id)}">Reply</span>${mine || S.isAdmin ? `<span class="dl" data-dl="${esc(m.id)}">Delete</span>` : ""}</div></div>`;
  };
  const draw = () => {
    const el = $("msgs"); if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    const vis = msgs.filter((m) => m.ts > Date.now() - DAY).sort((a, b) => a.ts - b.ts);
    el.innerHTML = vis.length ? vis.map(bubble).join("") : '<p class="empty">No messages yet.<br>Be the first to say hi to the void. 👋</p>';
    if (near || firstDraw) { el.scrollTop = el.scrollHeight; firstDraw = false; }
  };
  const setReply = (m) => {
    replyTo = m; const b = $("rbar");
    if (!m) { b.classList.add("hidden"); b.innerHTML = ""; return; }
    b.classList.remove("hidden");
    b.innerHTML = `<div><b class="accent">Replying to ${m.uid === S.user.uid ? "yourself" : esc(m.name)}</b><div class="muted">${esc(m.text.slice(0, 80))}</div></div><button class="link" id="rx">✕</button>`;
    $("rx").onclick = () => setReply(null); $("mi").focus();
  };
  $("msgs").onclick = (e) => {
    const r = e.target.closest("[data-rp]"); if (r) return setReply(msgs.find((m) => m.id === r.dataset.rp));
    const d = e.target.closest("[data-dl]"); if (d && confirm("Delete this message?")) deleteDoc(doc(db, "chat", d.dataset.dl)).catch((x) => toast(x.message));
  };
  // swipe right on a message to reply (touch screens)
  let sx = 0, sy = 0, sel = null, dx = 0;
  $("msgs").addEventListener("touchstart", (e) => { sel = e.target.closest(".bubble"); if (sel) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; sel.style.transition = "none"; } }, { passive: true });
  $("msgs").addEventListener("touchmove", (e) => { if (!sel) return; const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy; if (Math.abs(x) > Math.abs(y) && x > 0) { dx = Math.min(x, 90); sel.style.transform = `translateX(${dx}px)`; } }, { passive: true });
  $("msgs").addEventListener("touchend", () => { if (!sel) return; sel.style.transition = ""; sel.style.transform = ""; if (dx >= 70) setReply(msgs.find((m) => m.id === sel.dataset.id)); sel = null; dx = 0; }, { passive: true });
  const send = () => {
    const t = $("mi").value.trim(); if (!t) return; const now = Date.now();
    const data = { uid: S.user.uid, name: myName(), text: t, admin: S.isAdmin, createdAt: now, expireAt: new Date(now + DAY) };
    if (replyTo) { data.replyToId = replyTo.id; data.replyToUid = replyTo.uid; data.replyToName = replyTo.name; data.replyToText = replyTo.text.slice(0, 120); }
    $("mi").value = ""; setReply(null);
    addDoc(collection(db, "chat"), data).catch((e) => toast("Message failed: " + e.message));
  };
  $("sb").onclick = send;
  $("mi").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const cleanup = async () => {
    try {
      const snap = await getDocs(query(collection(db, "chat"), where("createdAt", "<", Date.now() - DAY), limit(100)));
      snap.docs.filter((d) => S.isAdmin || d.data().uid === S.user.uid).forEach((d) => deleteDoc(d.ref));
    } catch {}
  };
  cleanup(); S.timers.push(setInterval(cleanup, 10 * 60 * 1000), setInterval(draw, 30000));
  S.subs.push(onSnapshot(query(collection(db, "chat"), where("createdAt", ">", Date.now() - DAY), orderBy("createdAt", "desc"), limit(100)), { includeMetadataChanges: true }, (snap) => {
    msgs = snap.docs.map((d) => { const x = d.data(); return { id: d.id, uid: x.uid || "", name: x.name || "Student", text: x.text || "", admin: !!x.admin, ts: x.createdAt || 0, rId: x.replyToId || "", rName: x.replyToName || "", rText: x.replyToText || "" }; });
    snap.docs.forEach((d) => {
      if (d.data().uid !== S.user.uid) return;
      const pending = d.metadata.hasPendingWrites, st = track.get(d.id);
      if (pending && !st) { track.set(d.id, "sending"); S.timers.push(setTimeout(() => { if (track.get(d.id) === "sending") { track.set(d.id, "slow"); draw(); } }, 3000)); }
      else if (!pending && st && st !== "sent") { track.set(d.id, "sent"); S.timers.push(setTimeout(() => { track.delete(d.id); draw(); }, 4000)); }
    });
    draw();
  }, (e) => toast("Could not load chat: " + e.message)));
}
function feedbackPane() {
  $("pane").innerHTML = `${S.isAdmin ? "" : `<textarea id="ft" rows="3" maxlength="1000" placeholder="Tell the admin anything: bugs, ideas, complaints..."></textarea>
    <div class="row"><span class="muted small">Only you and the admin can see this.</span><button class="btn" id="fs">Send</button></div>`}<div id="fl" style="margin-top:12px"></div>`;
  let list = [];
  const draw = () => {
    const keep = {}; document.querySelectorAll("textarea[data-rt]").forEach((t) => (keep[t.dataset.rt] = t.value));
    $("fl").innerHTML = list.length ? list.map((f) => `<div class="card"><div class="row"><b class="accent small">${S.isAdmin ? esc(f.name) : "You"}</b><span class="muted small">${esc(timeText(f.ts))}</span></div><p class="pre">${esc(f.text)}</p>
      ${S.isAdmin ? `<textarea data-rt="${esc(f.id)}" rows="2" placeholder="Write a reply..." maxlength="500">${esc(keep[f.id] ?? f.reply)}</textarea><div class="row" style="justify-content:flex-start"><button class="btn" data-rp="${esc(f.id)}">${f.reply ? "Update reply" : "Reply"}</button><button class="link danger" data-dl="${esc(f.id)}">Delete</button></div>`
      : f.reply ? `<div class="quote"><b>Admin replied</b>${esc(f.reply)}</div>` : '<p class="muted small">Waiting for the admin... they\'re probably in an exam too.</p>'}</div>`).join("")
      : `<p class="empty">${S.isAdmin ? "Inbox empty.<br>Either everyone is happy, or nobody found this tab. 🦗" : "No feedback sent yet.<br>Be honest. The admin can take it. Probably."}</p>`;
  };
  $("fl").onclick = (e) => {
    const r = e.target.closest("[data-rp]");
    if (r) { const t = document.querySelector(`textarea[data-rt="${CSS.escape(r.dataset.rp)}"]`).value.trim(); if (t) updateDoc(doc(db, "feedback", r.dataset.rp), { reply: t, repliedAt: Date.now() }).catch((x) => toast(x.message)); return; }
    const d = e.target.closest("[data-dl]"); if (d && confirm("Delete this feedback?")) deleteDoc(doc(db, "feedback", d.dataset.dl)).catch((x) => toast(x.message));
  };
  if ($("fs")) $("fs").onclick = async () => {
    const t = $("ft").value.trim(); if (!t) return;
    try { await addDoc(collection(db, "feedback"), { uid: S.user.uid, name: myName(), text: t, createdAt: Date.now() }); $("ft").value = ""; } catch (e) { toast("Could not send: " + e.message); }
  };
  const q = S.isAdmin ? query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(200)) : query(collection(db, "feedback"), where("uid", "==", S.user.uid));
  S.subs.push(onSnapshot(q, (snap) => { list = snap.docs.map((d) => { const x = d.data(); return { id: d.id, name: x.name || "Student", text: x.text || "", ts: x.createdAt || 0, reply: x.reply || "" }; }).sort((a, b) => b.ts - a.ts); draw(); }, (e) => toast("Could not load feedback: " + e.message)));
}

// ---------------- TYPING GAME ----------------
const GAME_SECONDS = 30;
function renderType() {
  view.innerHTML = `<h1>Speed typer</h1><p class="sub">Your keyboard called. It wants a raise. Unlimited retries, best score of the day counts.</p><div id="game"></div>
    <h3>🏆 Yesterday's champions</h3><div id="yday"></div><h3>⚡ Today's leaderboard</h3><div id="today"></div>`;
  const rows = (arr, el, empty) => ($(el).innerHTML = arr.length ? arr.map((s, i) => `<div class="card lb"><span style="width:30px">${["🥇", "🥈", "🥉"][i] || i + 1 + "."}</span><span class="nm">${esc(s.name)}</span><b>${s.wpm} wpm • ${s.acc}%</b></div>`).join("") : `<p class="muted">${empty}</p>`);
  const toScore = (d) => { const x = d.data(); return { name: x.name || "Student", wpm: Number(x.wpm) || 0, acc: Number(x.acc) || 0 }; };
  rows([], "today", "Nobody has typed yet today. The throne is empty 🪑");
  S.subs.push(onSnapshot(query(collection(db, "typing", dateKey(), "scores"), orderBy("wpm", "desc"), limit(10)),
    (snap) => rows(snap.docs.map(toScore), "today", "Nobody has typed yet today. The throne is empty 🪑"), (e) => toast("Leaderboard: " + e.message)));
  getDocs(query(collection(db, "typing", dateKey(-1), "scores"), orderBy("wpm", "desc"), limit(5)))
    .then((snap) => rows(snap.docs.map(toScore), "yday", "No champions yet. Be the first one tomorrow! 👑")).catch(() => rows([], "yday", "No champions yet. Be the first one tomorrow! 👑"));
  newRound();
}
function newRound() {
  clearTimers();
  const words = Array.from({ length: 200 }, () => pick(WORDS));
  let idx = 0, typed = "", startMs = 0, finished = false; const done = [];
  $("game").innerHTML = `<div class="card"><div class="row"><span class="muted small">time ${GAME_SECONDS} • english</span><span class="timer" id="tm">${GAME_SECONDS}</span></div>
    <div class="words" id="wd"></div><input id="ti" class="hidden-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
    <p class="muted small" id="hint">Click here, then start typing. Space moves to the next word ⌨️</p><button class="link" id="nw">↻ New words</button></div>`;
  const draw = () => {
    const from = Math.floor(idx / 12) * 12, to = Math.min(from + 36, words.length); let h = "";
    for (let i = from; i < to; i++) {
      const w = words[i];
      if (i < idx) { const t = done[i]; for (let k = 0; k < w.length; k++) h += `<span class="${k < t.length && t[k] === w[k] ? "ok" : "bad"}">${esc(w[k])}</span>`; if (t.length > w.length) h += `<span class="bad">${esc(t.slice(w.length))}</span>`; }
      else if (i === idx) { for (let k = 0; k < w.length; k++) h += `<span class="${k < typed.length ? (typed[k] === w[k] ? "ok" : "bad") : "pend"}${k === typed.length ? " cur" : ""}">${esc(w[k])}</span>`; if (typed.length > w.length) h += `<span class="bad">${esc(typed.slice(w.length))}</span>`; }
      else h += `<span class="pend">${esc(w)}</span>`;
      h += " ";
    }
    $("wd").innerHTML = h;
  };
  const finish = async () => {
    if (finished) return; finished = true; clearTimers();
    let correctChars = 0, typedChars = 0, correctTyped = 0;
    done.forEach((t, i) => { const w = words[i]; typedChars += t.length + 1; correctTyped += 1; for (let k = 0; k < t.length; k++) if (k < w.length && t[k] === w[k]) correctTyped++; if (t === w) correctChars += w.length + 1; });
    typedChars += typed.length; if (idx < words.length) for (let k = 0; k < typed.length; k++) if (k < words[idx].length && typed[k] === words[idx][k]) correctTyped++;
    const wpm = Math.round(correctChars / 5 * 60 / GAME_SECONDS), raw = Math.round(typedChars / 5 * 60 / GAME_SECONDS), acc = typedChars ? Math.round(correctTyped * 100 / typedChars) : 0;
    $("game").innerHTML = `<div class="card" style="text-align:center"><div class="muted">wpm</div><div class="bigwpm">${wpm}</div><div>accuracy ${acc}% • raw ${raw}</div><p class="accent">${esc(wpmComment(wpm))}</p><p class="muted small" id="sv"></p><button class="btn" id="again">Try again</button></div>`;
    $("again").onclick = newRound;
    try {
      const ref = doc(db, "typing", dateKey(), "scores", S.user.uid); const old = (await getDoc(ref)).data()?.wpm ?? -1;
      if (wpm > 0 && wpm > old) { await setDoc(ref, { uid: S.user.uid, name: myName(), wpm, acc, createdAt: Date.now() }); if ($("sv")) $("sv").textContent = "New personal best today! 🎉"; }
      else if ($("sv")) $("sv").textContent = old >= 0 ? `Your best today: ${old} wpm` : "";
    } catch (e) { if ($("sv")) $("sv").textContent = "Could not save score: " + e.message; }
  };
  const ti = $("ti");
  ti.oninput = () => {
    if (finished) return; const v = ti.value;
    if (!startMs) { startMs = Date.now(); $("hint").textContent = "Go go go! 🚀"; S.timers.push(setInterval(() => { const left = GAME_SECONDS - Math.floor((Date.now() - startMs) / 1000); if ($("tm")) $("tm").textContent = Math.max(left, 0); if (left <= 0) finish(); }, 200)); }
    if (v.endsWith(" ")) { const w = v.trim(); if (w) { done.push(w); idx++; if (idx >= words.length) return finish(); } typed = ""; ti.value = ""; } else typed = v;
    draw();
  };
  $("game").querySelector(".words").onclick = () => ti.focus(); $("hint").onclick = () => ti.focus(); $("nw").onclick = newRound;
  draw(); ti.focus();
}
function clearTimers() { S.timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); S.timers = []; }

// ---------------- ABOUT ----------------
function renderAbout() {
  view.innerHTML = `<div class="about"><img class="me" src="assets/dev.jpg" alt="Edrin J S"><h1>Campus Pulse</h1><p class="accent">Version ${APP_VERSION} (web)</p>
    <div class="card" style="text-align:left"><div class="muted small">Developed by</div><h3 style="color:var(--text);margin:2px 0 8px">Edrin J S</h3>
    <ul><li>Built by a student, for students.</li><li>Zero professors were consulted.</li><li>Bugs? Those are undocumented features.</li><li>Powered by caffeine and last-minute panic.</li><li>If it crashes, try turning your semester off and on again.</li></ul></div>
    <p>${link("https://www.instagram.com/edrin.js?srtk=MWg5cnVocjc3cWRjZA==", "Follow @edrin.js on Instagram")}</p>
    <p class="muted small">Tap it. The developer needs the likes more than the exam needs you.</p></div>`;
}

start();
