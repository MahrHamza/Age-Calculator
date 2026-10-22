const $ = (id) => document.getElementById(id);
const form = $("form"), dobEl = $("dob"), targetEl = $("target");
const errorEl = $("error"), resultEl = $("result"), cardEl = $("card");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (n) => n.toLocaleString("en-US");
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const DAY = 86400000;

/* =========================================================
   AGE LOGIC (unchanged)
   ========================================================= */
function calculate(dob, target) {
  let years = target.getFullYear() - dob.getFullYear();
  let months = target.getMonth() - dob.getMonth();
  let days = target.getDate() - dob.getDate();

  if (days < 0) {
    months--;
    const prev = target.getMonth() === 0 ? 11 : target.getMonth() - 1;
    const prevYear = target.getMonth() === 0 ? target.getFullYear() - 1 : target.getFullYear();
    days += daysInMonth(prevYear, prev);
  }
  if (months < 0) { years--; months += 12; }

  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const totalDays = Math.round((utc(target) - utc(dob)) / DAY);

  return {
    years, months, days,
    totalMonths: years * 12 + months,
    totalWeeks: Math.floor(totalDays / 7),
    totalDays,
    totalHours: totalDays * 24,
  };
}

function nextBirthday(dob, from) {
  const make = (yr) => {
    // Feb 29 birthdays fall on Mar 1 in non-leap years
    const d = new Date(yr, dob.getMonth(), dob.getDate());
    if (d.getMonth() !== dob.getMonth()) return new Date(yr, 2, 1);
    return d;
  };
  let next = make(from.getFullYear());
  if (next <= from) next = make(from.getFullYear() + 1);

  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const left = Math.round((utc(next) - utc(from)) / DAY);

  // progress between the last birthday and the next one
  let prev = make(next.getFullYear() - 1);
  if (prev < dob) prev = dob;
  const span = utc(next) - utc(prev);
  const pct = span > 0 ? Math.min(Math.max((utc(from) - utc(prev)) / span, 0), 1) : 0;

  return { next, left, pct };
}

/* =========================================================
   AUTO "TODAY"
   ========================================================= */
const autoTag = $("autoTag");
let isAuto = true;
let lastDay = toISO(new Date());

const getToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

function setAuto(on) {
  isAuto = on;
  autoTag.classList.toggle("is-auto", on);
  autoTag.textContent = on ? "Auto: today" : "Use today";
  if (on) targetEl.value = toISO(getToday());
}

function syncToday() {
  const nowISO = toISO(getToday());
  dobEl.max = nowISO;
  if (nowISO !== lastDay) {
    lastDay = nowISO;
    if (isAuto) {
      targetEl.value = nowISO;
      if (!resultEl.hidden && dobEl.value) run();
    }
  }
}

setAuto(true);
dobEl.max = toISO(getToday());
setInterval(syncToday, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncToday(); });
targetEl.addEventListener("input", () => { if (isAuto) setAuto(false); });
autoTag.addEventListener("click", () => { setAuto(true); if (!resultEl.hidden && dobEl.value) run(); });

/* =========================================================
   DIAL (ticks, arc, orbiting dot)
   ========================================================= */
const TICKS = 60, RADIUS = 92, CIRC = 2 * Math.PI * RADIUS;
const ticksG = $("ticks"), arc = $("arc"), orbit = $("orbit");
const NS = "http://www.w3.org/2000/svg";

for (let i = 0; i < TICKS; i++) {
  const major = i % 5 === 0;
  const l = document.createElementNS(NS, "line");
  l.setAttribute("x1", 120); l.setAttribute("x2", 120);
  l.setAttribute("y1", major ? 4 : 8); l.setAttribute("y2", 14);
  l.setAttribute("transform", `rotate(${i * (360 / TICKS)} 120 120)`);
  l.setAttribute("class", "tick" + (major ? " major" : ""));
  l.style.setProperty("--t", i);
  ticksG.appendChild(l);
}
arc.style.strokeDasharray = CIRC;
arc.style.strokeDashoffset = CIRC;

function updateDial(pct) {
  const ticks = ticksG.children;
  const lit = Math.round(pct * TICKS);

  // reset to start without transition
  arc.style.transition = "none";
  orbit.style.transition = "none";
  arc.style.strokeDashoffset = CIRC;
  orbit.style.transform = "rotate(0deg)";
  for (const t of ticks) { t.classList.remove("on"); t.style.transitionDelay = "0s"; }
  void arc.getBoundingClientRect();

  const ease = "1.8s cubic-bezier(.3,.7,.2,1) .45s";
  arc.style.transition = `stroke-dashoffset ${ease}`;
  orbit.style.transition = `transform ${ease}`;
  arc.style.strokeDashoffset = CIRC * (1 - pct);
  orbit.style.transform = `rotate(${pct * 360}deg)`;

  for (let i = 0; i < lit; i++) {
    ticks[i].style.transitionDelay = `${0.45 + (i / Math.max(lit, 1)) * 1.6}s`;
    ticks[i].classList.add("on");
  }
}

/* =========================================================
   RESULT SHOW / HIDE + COUNT-UP
   ========================================================= */
let runId = 0;   // bumped on reset to cancel running animations
function countUp(el, to, duration = 1100) {
  if (reduceMotion || to === 0) { el.textContent = fmt(to); return; }
  const id = runId;
  const start = performance.now() + 250;
  el.textContent = "0";
  const tick = (now) => {
    if (id !== runId) return;
    if (now < start) return requestAnimationFrame(tick);
    const p = Math.min((now - start) / duration, 1);
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 4))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let hideTimer, confettiTimer;
function showResult() {
  clearTimeout(hideTimer);
  resultEl.classList.remove("in");
  resultEl.hidden = false;
  resultEl.querySelectorAll(".item").forEach((el, i) => el.style.setProperty("--i", i));
  void resultEl.offsetWidth;
  resultEl.classList.add("in");
}
function hideResult() {
  resultEl.classList.remove("in");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { resultEl.hidden = true; }, 450);
}

function showError(msg, field) {
  errorEl.textContent = msg;
  errorEl.classList.add("show");
  if (field) { field.classList.remove("invalid"); void field.offsetWidth; field.classList.add("invalid"); }
  hideResult();
}
function clearError() {
  errorEl.classList.remove("show");
  dobEl.classList.remove("invalid");
  targetEl.classList.remove("invalid");
}

form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
[dobEl, targetEl].forEach((el) => el.addEventListener("input", clearError));

function run() {
  clearError();

  if (!dobEl.value) return showError("Enter your date of birth.", dobEl);
  const dob = parseISO(dobEl.value);
  const target = targetEl.value ? parseISO(targetEl.value) : getToday();

  if (dob > target) return showError("Date of birth must be before the selected date.", dobEl);

  const r = calculate(dob, target);
  const nb = nextBirthday(dob, target);
  showResult();

  countUp($("years"), r.years, 1400);
  countUp($("months"), r.months);
  countUp($("days"), r.days);
  countUp($("totMonths"), r.totalMonths);
  countUp($("totWeeks"), r.totalWeeks);
  countUp($("totDays"), r.totalDays);
  countUp($("totHours"), r.totalHours, 1500);

  $("nextDate").textContent = nb.next.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  countUp($("daysLeft"), nb.left);
  updateDial(nb.pct);

  const bar = $("barFill");
  bar.style.transition = "none"; bar.style.width = "0%";
  void bar.offsetWidth;
  bar.style.transition = "width 1.8s cubic-bezier(.3,.7,.2,1) .6s";
  bar.style.width = (nb.pct * 100).toFixed(1) + "%";
  $("pctText").textContent = `${Math.round(nb.pct * 100)}% of the way to your next birthday`;

  const born = $("bornOn");
  const isBirthday = dob.getMonth() === target.getMonth() && dob.getDate() === target.getDate() && target > dob;
  born.classList.toggle("party", isBirthday);
  if (isBirthday) {
    born.textContent = "Happy birthday! 🎉";
    confettiTimer = setTimeout(confetti, 700);
  } else {
    born.textContent = "You were born on a " + dob.toLocaleDateString("en-US", { weekday: "long" }) + ".";
  }

  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetResultValues() {
  ["years", "months", "days", "totMonths", "totWeeks", "totDays", "totHours", "daysLeft"]
    .forEach((id) => { $(id).textContent = "0"; });
  $("nextDate").textContent = "—";
  $("pctText").textContent = "";
  const born = $("bornOn");
  born.textContent = "";
  born.classList.remove("party");

  const bar = $("barFill");
  bar.style.transition = "none";
  bar.style.width = "0%";

  arc.style.transition = "none";
  orbit.style.transition = "none";
  arc.style.strokeDashoffset = CIRC;
  orbit.style.transform = "rotate(0deg)";
  for (const t of ticksG.children) { t.classList.remove("on"); t.style.transitionDelay = "0s"; }
}

$("resetBtn").addEventListener("click", () => {
  runId++;                                   // stop count-ups and confetti
  clearTimeout(confettiTimer);
  const c = $("confetti");
  c.getContext("2d").clearRect(0, 0, c.width, c.height);

  form.reset();                              // clears date of birth
  setAuto(true);                             // "Age on date" -> today
  clearError();
  hideResult();
  setTimeout(() => {                         // wipe values once the fade-out ends
    if (!resultEl.classList.contains("in")) resetResultValues();
  }, 480);

  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  dobEl.focus({ preventScroll: true });
});

/* =========================================================
   THEME
   ========================================================= */
const root = document.documentElement;
const saved = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
root.dataset.theme = saved || "dark";
let particleRGB = "";
const readParticleColor = () => { particleRGB = getComputedStyle(root).getPropertyValue("--particle").trim(); };
readParticleColor();

$("themeBtn").addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  readParticleColor();
  try { localStorage.setItem("theme", next); } catch {}
});

/* =========================================================
   EFFECTS: spotlight + tilt, button ripple
   ========================================================= */
function spotlight(el, tilt) {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", x * 100 + "%");
    el.style.setProperty("--my", y * 100 + "%");
    if (tilt && !reduceMotion && e.pointerType === "mouse") {
      el.style.setProperty("--ry", (x - 0.5) * 6 + "deg");
      el.style.setProperty("--rx", (0.5 - y) * 6 + "deg");
    }
  });
  el.addEventListener("pointerleave", () => {
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  });
}
spotlight(cardEl, true);
spotlight(resultEl, false);

document.querySelectorAll(".btn").forEach((b) =>
  b.addEventListener("pointerdown", (e) => {
    if (reduceMotion) return;
    const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
    const s = document.createElement("span");
    s.className = "ripple";
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 700);
  })
);

/* =========================================================
   BACKGROUND PARTICLES (constellation + mouse parallax)
   ========================================================= */
(function stars() {
  const cv = $("stars"), ctx = cv.getContext("2d");
  let W, H, dpr, pts = [];
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
    const n = Math.min(Math.round((innerWidth * innerHeight) / 15000), 90);
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.28 * dpr, vy: (Math.random() - 0.5) * 0.28 * dpr,
      r: (Math.random() * 1.5 + 0.5) * dpr, p: Math.random() * 6.28, z: Math.random() * 0.8 + 0.2,
    }));
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const link = 120 * dpr;

    for (const p of pts) {
      if (!reduceMotion) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      }
      p.dx = p.x + mouse.x * 40 * p.z * dpr;
      p.dy = p.y + mouse.y * 40 * p.z * dpr;
      const a = 0.35 + 0.4 * Math.sin(t / 900 + p.p);
      ctx.fillStyle = `rgba(${particleRGB},${a})`;
      ctx.beginPath(); ctx.arc(p.dx, p.dy, p.r, 0, 6.283); ctx.fill();
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].dx - pts[j].dx, dy = pts[i].dy - pts[j].dy;
        const d = Math.hypot(dx, dy);
        if (d < link) {
          ctx.strokeStyle = `rgba(${particleRGB},${(1 - d / link) * 0.2})`;
          ctx.lineWidth = dpr * 0.8;
          ctx.beginPath(); ctx.moveTo(pts[i].dx, pts[i].dy); ctx.lineTo(pts[j].dx, pts[j].dy); ctx.stroke();
        }
      }
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => {
    mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5;
  });
  resize();
  requestAnimationFrame(draw);
})();

/* =========================================================
   CONFETTI (birthday)
   ========================================================= */
function confetti() {
  if (reduceMotion) return;
  const c = $("confetti"), ctx = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const colors = ["#7c5cff", "#ff4fa3", "#22d3ee", "#ffd166", "#ffffff"];
  const bits = Array.from({ length: 170 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 240, y: innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
    s: Math.random() * 8 + 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const myRun = runId;
  (function step(now) {
    if (myRun !== runId) { ctx.clearRect(0, 0, c.width, c.height); return; }
    const t = now - t0;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) {
      b.vy += 0.34; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2400) / 1600);
      ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      ctx.restore();
    }
    if (t < 4000) requestAnimationFrame(step); else ctx.clearRect(0, 0, c.width, c.height);
  })(t0);
}