// Pure helper functions (no browser or Firebase needed, so they are easy to test)
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Only http(s) links are allowed. Anything else (javascript:, data:, ...) is rejected.
export function safeUrl(u) {
  const t = String(u ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(t)) return "";
  return "https://" + t;
}

export const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// "192524041", "192,524,041", "192524041.0", "1.92524041E8", "0192524041" all become the same key
export function normReg(raw) {
  let s = String(raw ?? "").replace(/\u00A0/g, "").trim();
  if (!s) return "";
  const c = s.replace(/[, ]/g, "");
  if (/^\d+(\.0+)?$/.test(c)) s = c.split(".")[0];
  else if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(c)) s = String(Math.round(Number(c)));
  const n = norm(s);
  return /^\d+$/.test(n) ? n.replace(/^0+/, "") || "0" : n;
}

export function parseCsv(t) {
  const rows = []; let row = []; let sb = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { sb += '"'; i++; } else q = false; } else sb += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(sb); sb = ""; }
    else if (c === "\n") { row.push(sb); sb = ""; rows.push(row); row = []; }
    else if (c !== "\r") sb += c;
  }
  if (sb.length || row.length) { row.push(sb); rows.push(row); }
  return rows;
}

const REG = new Set(["regno", "registerno", "registernumber", "registrationno", "registrationnumber", "regnumber", "regisno", "rollno", "rollnumber", "enrollmentno", "enrolmentno"]);
const NAME = new Set(["studentname", "name", "nameofthestudent", "candidatename", "nameofstudent"]);
const COURSE = new Set(["coursename", "course", "subjectname", "subject", "coursetitle"]);

// Turns the CSV text of one sheet into { headers, rows, regIdx, nameIdx, courseIdx, regKeys, nameKeys }
export function parseSheet(text) {
  if (text.trimStart().startsWith("<")) throw new Error("The sheet is private. Set sharing to 'Anyone with the link can view'.");
  const all = parseCsv(text.replace(/^\uFEFF/, ""));
  const hi = all.findIndex((r) => r.some((c) => REG.has(norm(c))) && r.some((c) => NAME.has(norm(c))));
  if (hi < 0) throw new Error("Could not find RegNo and StudentName columns. Check the tab name.");
  const headers = all[hi];
  const regIdx = headers.findIndex((c) => REG.has(norm(c)));
  const nameIdx = headers.findIndex((c) => NAME.has(norm(c)));
  const courseIdx = headers.findIndex((c) => COURSE.has(norm(c)));
  const rows = all.slice(hi + 1).filter((r) => (r[regIdx] || "").trim() || (r[nameIdx] || "").trim());
  return { headers, rows, regIdx, nameIdx, courseIdx,
    regKeys: rows.map((r) => normReg(r[regIdx] || "")), nameKeys: rows.map((r) => norm(r[nameIdx] || "")) };
}

export function searchSheet(sh, query) {
  const raw = String(query).trim();
  if (raw.length < 3) return [];
  const qReg = normReg(raw), qName = norm(raw), hasDigit = /\d/.test(raw);
  const out = [];
  for (let i = 0; i < sh.rows.length; i++) {
    const reg = sh.regKeys[i] || "", nm = sh.nameKeys[i] || "";
    const regHit = reg && (reg === qReg || (qReg.length >= 6 && reg.endsWith(qReg)));
    if (regHit || (!hasDigit && qName.length >= 3 && nm.includes(qName))) { out.push(sh.rows[i]); if (out.length >= 80) break; }
  }
  return out;
}

export function dateKey(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function wpmComment(w) {
  return w < 20 ? "Is your keyboard on vacation? 🐢" : w < 40 ? "Warming up. Your fingers need coffee ☕" :
    w < 60 ? "Solid! Your exam answers are safe ✍️" : w < 80 ? "Fast fingers. Teachers hate this trick 🔥" : "Are you even human? 🤖";
}

export function timeText(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export const WORDS = ("the be to of and in that have it for not on with he as you do at this but his by from they we say her she or an will my one all " +
  "would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some " +
  "could them see other than then now look only come its over think also back after use two how our work first well way even new want because " +
  "any these give day most us problem right program however both person plan public between own large school place hand high every keep never " +
  "again old great little where much before move thing life world still last long off need feel night real small friend example mean " +
  "word family system follow question story learn change point group number early study young water music light class power book check").split(" ");
