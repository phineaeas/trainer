(() => {
  "use strict";

  const UNITS = window.UNITS;
  const QS = window.Q;
  const FIELDS = window.PROFILE_FIELDS;
  const KEY = "interview-trainer-v1";
  const DAY = 864e5;
  const INTERVALS = [0, 1, 2, 4, 7, 14]; // дни до повтора для коробок 0–5
  const GOAL = 50;                       // цель опыта на день
  const app = document.getElementById("app");

  // ---------- состояние ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  const S = Object.assign({ xp: 0, streak: 0, last: null, day: null, dayXp: 0, cards: {}, profile: {}, tipHidden: false }, load());
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно — работаем в памяти */ }
  }

  function localDay(d) {
    const x = d || new Date();
    return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const yesterday = () => localDay(new Date(Date.now() - DAY));

  function addXp(n) {
    const t = localDay();
    if (S.day !== t) { S.day = t; S.dayXp = 0; }
    if (S.last !== t) { S.streak = S.last === yesterday() ? S.streak + 1 : 1; S.last = t; }
    S.xp += n; S.dayXp += n;
    save();
  }

  const getC = (id) => S.cards[id] || { box: 0, due: 0, seen: false };
  function grade(id, result) {
    const c = S.cards[id] || (S.cards[id] = { box: 0, due: 0, seen: false, ok: 0, bad: 0 });
    c.seen = true;
    if (result === "good") { c.box = Math.min(5, c.box + 1); c.ok = (c.ok || 0) + 1; }
    else if (result === "ok") { c.box = Math.max(1, c.box); }
    else { c.box = 0; c.bad = (c.bad || 0) + 1; }
    c.due = Date.now() + INTERVALS[c.box] * DAY;
    save();
  }
  const mastered = (id) => getC(id).box >= 3;
  const isWeak = (id) => { const c = S.cards[id]; return !!c && c.seen && (c.box === 0 || c.due <= Date.now()); };

  // ---------- текст ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  function pval(k) {
    const f = FIELDS.find((x) => x.key === k);
    const v = S.profile[k];
    return (v !== undefined && String(v).trim() !== "") ? v : (f ? f.def : k);
  }
  function rich(text) {
    let h = esc(text);
    h = h.replace(/`([^`]+)`/g, (m, c) => "<code>" + c + "</code>");
    h = h.replace(/⟨([a-z_]+)⟩/g, (m, k) => '<mark class="ph" title="Из профиля — можно поменять">' + esc(pval(k)) + "</mark>");
    h = h.replace(/⟪BLANK⟫/g, '<span class="blank">?</span>');
    return h;
  }
  const plain = (text) => String(text).replace(/⟨([a-z_]+)⟩/g, (m, k) => pval(k)).replace(/`/g, "");
  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }

  // ---------- каркас экрана ----------
  let sheetEl = null;
  function clearSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  function view(html) { clearSheet(); app.innerHTML = html; window.scrollTo(0, 0); }
  function sheet(cls, inner, buttons) {
    clearSheet();
    sheetEl = document.createElement("div");
    sheetEl.className = "sheet " + (cls || "");
    sheetEl.innerHTML = '<div class="in" aria-live="polite">' + inner + buttons + "</div>";
    document.body.appendChild(sheetEl);
  }
  function setCheck(enabled) {
    const b = sheetEl && sheetEl.querySelector('[data-act="check"]');
    if (b) b.disabled = !enabled;
  }

  function topbar() {
    const t = localDay();
    const dx = S.day === t ? S.dayXp : 0;
    const st = (S.last === t || S.last === yesterday()) ? S.streak : 0;
    const m = QS.filter((q) => mastered(q.id)).length;
    return '<div class="top"><span class="stat" title="Дней подряд">🔥 ' + st + '</span><span class="stat" title="Опыт">⭐ ' + S.xp +
      '</span><div class="goal" title="Цель дня: ' + GOAL + ' опыта"><i style="width:' + Math.min(100, dx / GOAL * 100) + '%"></i></div>' +
      '<span class="stat" title="Освоено вопросов">🎯 ' + m + "/" + QS.length + "</span></div>";
  }

  function unitProgress(u) {
    const qs = QS.filter((q) => q.u === u.id);
    return { qs, m: qs.filter((q) => mastered(q.id)).length, seen: qs.filter((q) => getC(q.id).seen).length };
  }

  // ---------- главная ----------
  function home() {
    const weak = QS.filter((q) => isWeak(q.id)).length;
    let rec = UNITS.find((u) => { const p = unitProgress(u); return p.seen < p.qs.length; });
    if (!rec) rec = UNITS.reduce((a, u) => { const pa = unitProgress(a), pu = unitProgress(u); return pu.m / pu.qs.length < pa.m / pa.qs.length ? u : a; });
    const tip = S.tipHidden ? "" :
      '<div class="tip">Числа и названия, выделенные <mark class="ph">так</mark>, подставляются из профиля. Сейчас там значения из модели проекта — поменяй их на свои реальные, чтобы репетировать свою историю.<br>' +
      '<button data-go="profile">Открыть профиль</button><button data-act="hideTip">Понятно</button></div>';
    const units = UNITS.map((u) => {
      const p = unitProgress(u);
      const isRec = u === rec;
      return '<button class="unit' + (isRec ? " rec" : "") + '" data-unit="' + u.id + '"><span class="ic">' + u.icon + "</span><span>" +
        '<span class="t">' + u.id + ". " + esc(u.title) + '</span><span class="tag">' + esc(u.project) + "</span>" +
        '<div class="p">' + p.m + " из " + p.qs.length + " освоено" + (isRec ? " · дальше сюда" : "") + "</div>" +
        '<div class="bar"><i style="width:' + (p.m / p.qs.length * 100) + '%"></i></div></span></button>';
    }).join("");
    view('<div class="wrap">' + topbar() +
      "<h1>Собеседование: мой опыт</h1>" +
      '<p class="sub">100 вопросов о двух проектах. Отвечай вслух — так ответ запоминается быстрее.</p>' + tip +
      '<div class="actions">' +
      '<button class="tile" data-go="review"><b>🔁 Слабые места</b><span>' + (weak ? weak + " на повторение" : "пока нет") + "</span></button>" +
      '<button class="tile" data-go="interview"><b>🎙️ Собеседование</b><span>10 вопросов с таймером</span></button>' +
      '<button class="tile" data-go="cheat"><b>📄 Шпаргалка</b><span>все короткие ответы</span></button>' +
      '<button class="tile" data-go="profile"><b>⚙️ Профиль</b><span>твои числа и названия</span></button>' +
      "</div><h2>Разделы</h2><div class=\"path\">" + units + "</div></div>");
  }

  // ---------- уроки ----------
  let L = null;
  const cur = () => L.steps[L.i];

  function clozeData(q) {
    if (!q.w) return null;
    for (const t of shuffle(q.w)) {
      for (const src of [q.a, q.m || ""]) {
        const i = src.toLowerCase().indexOf(t.toLowerCase());
        if (i >= 0) return { term: src.substr(i, t.length), text: src.slice(0, i) + "⟪BLANK⟫" + src.slice(i + t.length) };
      }
    }
    return null;
  }
  function distractors(q, term, n) {
    const low = term.toLowerCase();
    const same = [...new Set(QS.filter((x) => x.u === q.u && x.id !== q.id).flatMap((x) => x.w || []))].filter((x) => x.toLowerCase() !== low);
    let res = shuffle(same).slice(0, n);
    if (res.length < n) {
      const all = [...new Set(QS.flatMap((x) => x.w || []))].filter((x) => x.toLowerCase() !== low && !res.includes(x));
      res = res.concat(shuffle(all).slice(0, n - res.length));
    }
    return res;
  }
  function practiceFor(q) {
    const out = [];
    if (q.mc) out.push({ type: "mcq", q });
    if (q.w) out.push({ type: "cloze", q });
    if (q.o) out.push({ type: "order", q });
    if (q.f) out.push({ type: "follow", q });
    return out;
  }
  function pickQs(pool, n) {
    const unseen = pool.filter((q) => !getC(q.id).seen);
    const seen = pool.filter((q) => getC(q.id).seen).sort((a, b) => (getC(a.id).due - getC(b.id).due) || (getC(a.id).box - getC(b.id).box));
    return unseen.concat(seen).slice(0, n);
  }
  function startUnit(uid) {
    const u = UNITS.find((x) => x.id === uid);
    const qs = pickQs(QS.filter((q) => q.u === uid), 5);
    const practice = shuffle(qs.flatMap(practiceFor)).slice(0, 9);
    const steps = qs.map((q) => ({ type: "flash", q })).concat(practice);
    steps.splice(Math.min(steps.length, qs.length + 2), 0, { type: "pairs", unit: u });
    begin(steps, u.icon + " " + u.title, uid);
  }
  function startReview() {
    let weak = QS.filter((q) => isWeak(q.id));
    if (!weak.length) weak = QS.filter((q) => getC(q.id).seen).sort((a, b) => getC(a.id).box - getC(b.id).box).slice(0, 6);
    if (!weak.length) {
      view('<div class="wrap"><button class="back" data-go="home">← Назад</button><h1>Пока нечего повторять</h1><p class="sub">Пройди пару уроков — сюда попадут вопросы, на которых ты ошиблась или которые пора повторить.</p></div>');
      return;
    }
    weak = shuffle(weak).slice(0, 6);
    const steps = shuffle(weak.flatMap((q) => {
      const p = practiceFor(q).filter((s) => s.type !== "follow");
      return p.length ? shuffle(p).slice(0, 2) : [{ type: "flash", q }];
    }));
    begin(steps, "🔁 Слабые места", null);
  }
  function begin(steps, title, unit) {
    L = { steps, i: 0, correct: 0, graded: 0, xp: 0, title, unit, gradedIds: new Set() };
    step();
  }
  function step() {
    if (L.i >= L.steps.length) { finish(); return; }
    const s = cur();
    const head = '<div class="wrap"><div class="lessonbar"><button class="x" data-act="quit" aria-label="Выйти">×</button>' +
      '<div class="prog"><i style="width:' + (L.i / L.steps.length * 100) + '%"></i></div></div>';
    ({ flash: rFlash, mcq: rMcq, cloze: rCloze, order: rOrder, pairs: rPairs, follow: rFollow })[s.type](s, head);
  }
  function give(n) { L.xp += n; addXp(n); }
  function lessonGrade(q, ok) {
    if (!ok) grade(q.id, "bad");
    else if (!L.gradedIds.has(q.id)) grade(q.id, "good");
    L.gradedIds.add(q.id);
  }
  function result(ok, expHtml) {
    L.graded++; if (ok) L.correct++;
    give(ok ? 10 : 2);
    sheet(ok ? "good" : "bad", '<p class="msg">' + (ok ? "Верно!" : "Не совсем") + '</p><div class="exp">' + expHtml + "</div>",
      '<button class="btn' + (ok ? "" : " red") + '" data-act="next">Дальше</button>');
  }

  function answerBlock(q) {
    let more = "";
    if (q.m || q.c || q.t) {
      more = "<details><summary>Подробнее</summary>" + (q.m ? "<p>" + rich(q.m) + "</p>" : "") +
        (q.c ? "<pre><code>" + esc(q.c) + "</code></pre>" : "") + (q.t ? '<div class="trap">⚠️ ' + rich(q.t) + "</div>" : "") + "</details>";
    }
    return '<div class="answer">' + rich(q.a) + '<ul class="keys">' + q.k.map((k) => "<li>" + rich(k) + "</li>").join("") + "</ul>" + more + "</div>";
  }

  // Карточка: отвечаешь вслух и оцениваешь себя
  function rFlash(s, head) {
    view(head + '<p class="kind">Ответь вслух</p><p class="qtext">' + rich(s.q.q) + '</p><p class="hint">Проговори ответ за 30 секунд, потом проверь себя.</p><div id="ans"></div></div>');
    sheet("", "", '<button class="btn" data-act="reveal">Показать ответ</button>');
  }
  function revealFlash() {
    document.getElementById("ans").innerHTML = answerBlock(cur().q);
    sheet("", '<p class="hint" style="margin:0 0 10px">Насколько близко ты ответила?</p>',
      '<div class="row"><button class="btn red" data-rate="bad">Не знаю</button><button class="btn amber" data-rate="ok">Почти</button><button class="btn" data-rate="good">Знаю</button></div>');
  }
  function rate(r) {
    const q = cur().q;
    grade(q.id, r); L.gradedIds.add(q.id);
    give(r === "good" ? 10 : r === "ok" ? 6 : 2);
    next();
  }

  // Выбор из трёх
  function rMcq(s, head) {
    s.opts = shuffle([s.q.mc.ok].concat(s.q.mc.no)); s.sel = null;
    view(head + '<p class="kind">Выбери верный ответ</p><p class="qtext">' + rich(s.q.mc.q || s.q.q) + '</p><div class="opts">' +
      s.opts.map((o, i) => '<button class="opt" data-opt="' + i + '">' + rich(o) + "</button>").join("") + "</div></div>");
    sheet("", "", '<button class="btn" data-act="check" disabled>Проверить</button>');
  }
  // Пропуск в тексте
  function rCloze(s, head) {
    const cd = clozeData(s.q);
    s.term = cd.term; s.opts = shuffle([cd.term].concat(distractors(s.q, cd.term, 2))); s.sel = null;
    view(head + '<p class="kind">Вставь пропущенное</p><p class="hint">' + rich(s.q.q) + '</p><div class="answer cloze">' + rich(cd.text) +
      '</div><div class="opts">' + s.opts.map((o, i) => '<button class="opt" data-opt="' + i + '">' + esc(o) + "</button>").join("") + "</div></div>");
    sheet("", "", '<button class="btn" data-act="check" disabled>Проверить</button>');
  }
  function pickOpt(i, el) {
    const s = cur();
    if (s.checked) return;
    s.sel = i;
    app.querySelectorAll(".opt").forEach((b) => b.classList.remove("sel"));
    el.classList.add("sel");
    setCheck(true);
  }

  // Порядок шагов
  function rOrder(s, head) {
    s.pool = shuffle(s.q.o.map((t, i) => ({ t, i }))); s.picked = [];
    view(head + '<p class="kind">Расставь по порядку</p><p class="qtext">' + rich(s.q.q) + '</p><div id="ord"></div></div>');
    sheet("", "", '<button class="btn" data-act="check" disabled>Проверить</button>');
    drawOrder();
  }
  function drawOrder() {
    const s = cur();
    document.getElementById("ord").innerHTML =
      '<div class="order-target">' + s.picked.map((pi, n) => '<button class="chip" data-ou="' + n + '"><span class="n">' + (n + 1) + ".</span> " + rich(s.pool[pi].t) + "</button>").join("") + "</div>" +
      '<div class="opts">' + s.pool.map((it, pi) => s.picked.includes(pi) ? "" : '<button class="chip" data-oi="' + pi + '">' + rich(it.t) + "</button>").join("") + "</div>";
    setCheck(s.picked.length === s.pool.length);
  }

  // Пары
  function rPairs(s, head) {
    const ps = shuffle(s.unit.pairs).slice(0, 4);
    s.left = shuffle(ps.map((p, i) => ({ t: p[0], i }))); s.right = shuffle(ps.map((p, i) => ({ t: p[1], i })));
    s.selL = null; s.selR = null; s.done = new Set(); s.miss = 0; s.n = ps.length;
    view(head + '<p class="kind">Найди пары</p><p class="qtext">Соедини понятие и его смысл</p><div class="pairs"><div class="col">' +
      s.left.map((x) => '<button class="opt" data-pl="' + x.i + '">' + esc(x.t) + "</button>").join("") + '</div><div class="col">' +
      s.right.map((x) => '<button class="opt" data-pr="' + x.i + '">' + esc(x.t) + "</button>").join("") + "</div></div></div>");
    sheet("", "", '<button class="btn" data-act="pairsDone" disabled>Дальше</button>');
  }
  function pairTap(el) {
    const s = cur();
    const isL = el.dataset.pl !== undefined;
    const i = +(isL ? el.dataset.pl : el.dataset.pr);
    if (s.done.has(i)) return;
    app.querySelectorAll(isL ? "[data-pl]" : "[data-pr]").forEach((b) => b.classList.remove("sel"));
    el.classList.add("sel");
    if (isL) s.selL = i; else s.selR = i;
    if (s.selL === null || s.selR === null) return;
    const l = app.querySelector('[data-pl="' + s.selL + '"]'), r = app.querySelector('[data-pr="' + s.selR + '"]');
    if (s.selL === s.selR) {
      s.done.add(i);
      [l, r].forEach((b) => { b.classList.remove("sel"); b.classList.add("done"); b.disabled = true; });
    } else {
      s.miss++;
      [l, r].forEach((b) => { b.classList.remove("sel"); b.classList.add("shake"); setTimeout(() => b.classList.remove("shake"), 320); });
    }
    s.selL = null; s.selR = null;
    if (s.done.size === s.n) {
      const b = sheetEl.querySelector('[data-act="pairsDone"]');
      if (b) b.disabled = false;
    }
  }

  // Уточняющий вопрос интервьюера
  function rFollow(s, head) {
    view(head + '<p class="kind">Уточняющий вопрос</p><p class="hint">После твоего ответа на «' + rich(s.q.q) + '» интервьюер спрашивает:</p><p class="qtext">' +
      rich(s.q.f.q) + '</p><div id="ans"></div></div>');
    sheet("", "", '<button class="btn" data-act="revealFollow">Показать ответ</button>');
  }
  function revealFollow() {
    document.getElementById("ans").innerHTML = '<div class="answer">' + rich(cur().q.f.a) + "</div>";
    sheet("", "", '<div class="row2"><button class="btn red" data-act="followBad">Не справилась</button><button class="btn" data-act="followGood">Справилась</button></div>');
  }

  function check() {
    const s = cur();
    if (s.type === "mcq" || s.type === "cloze") {
      if (s.sel === null) return;
      s.checked = true;
      const right = s.type === "mcq" ? s.q.mc.ok : s.term;
      const ok = s.opts[s.sel] === right;
      app.querySelectorAll(".opt").forEach((b, i) => { b.disabled = true; if (s.opts[i] === right) b.classList.add("ok"); else if (i === s.sel) b.classList.add("bad"); });
      lessonGrade(s.q, ok);
      result(ok, (ok ? "" : "<p>Правильно: <b>" + (s.type === "mcq" ? rich(right) : esc(right)) + "</b></p>") + "<p>" + rich(s.q.a) + "</p>");
    } else if (s.type === "order") {
      const ok = s.picked.every((pi, n) => s.pool[pi].i === n);
      app.querySelectorAll(".chip").forEach((b) => { b.disabled = true; });
      lessonGrade(s.q, ok);
      result(ok, ok ? "<p>Последовательность верная.</p>" : "<p>Правильный порядок:</p><ol>" + s.q.o.map((t) => "<li>" + rich(t) + "</li>").join("") + "</ol>");
    }
  }
  function next() { L.i++; step(); }

  function finish() {
    const acc = L.graded ? Math.round(L.correct / L.graded * 100) : 100;
    view('<div class="wrap">' + topbar() + '<div class="done-hero"><div class="big">🎉</div><h1>Урок пройден</h1><p class="sub">' + esc(L.title) + "</p></div>" +
      '<div class="stats"><div><b>+' + L.xp + "</b><span>опыта</span></div><div><b>" + acc + "%</b><span>точность</span></div><div><b>" + S.streak + "</b><span>дней подряд</span></div></div>" +
      (L.unit ? '<button class="btn" data-unit="' + L.unit + '">Ещё урок</button><div style="height:14px"></div>' : "") +
      '<button class="btn ghost" data-go="home">На главную</button></div>');
  }

  // ---------- собеседование ----------
  let I = null;
  const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  function startInterview() {
    const weak = shuffle(QS.filter((q) => isWeak(q.id))).slice(0, 4);
    const rest = shuffle(QS.filter((q) => !weak.includes(q))).slice(0, 10 - weak.length);
    I = { qs: shuffle(weak.concat(rest)), i: 0, scores: [], timer: null, t0: 0, rec: null, chunks: [], audioUrl: null };
    iStep();
  }
  function stopTimer() { if (I && I.timer) { clearInterval(I.timer); I.timer = null; } }
  function stopRec() { if (I && I.rec && I.rec.state === "recording") I.rec.stop(); }
  function iStep() {
    stopTimer(); stopRec();
    if (I.i >= I.qs.length) { iFinish(); return; }
    if (I.audioUrl) { URL.revokeObjectURL(I.audioUrl); I.audioUrl = null; }
    I.rec = null;
    const q = I.qs[I.i];
    const u = UNITS.find((x) => x.id === q.u);
    view('<div class="wrap"><div class="lessonbar"><button class="x" data-act="iquit" aria-label="Выйти">×</button><div class="prog"><i style="width:' +
      (I.i / I.qs.length * 100) + '%"></i></div></div><p class="kind">Вопрос ' + (I.i + 1) + " из " + I.qs.length + " · " + esc(u.title) +
      '</p><p class="qtext">' + rich(q.q) + '</p><div class="timer" id="timer">0:00</div><p class="hint" style="text-align:center">Цель — связный ответ за 30–60 секунд</p>' +
      (canRecord() ? '<button class="btn ghost" data-act="rec" id="recbtn">🎙️ Записать ответ</button>' : "") + '<div id="ians"></div></div>');
    sheet("", "", '<button class="btn" data-act="ireveal">Я ответила</button>');
    I.t0 = Date.now();
    I.timer = setInterval(() => {
      const sec = Math.floor((Date.now() - I.t0) / 1000);
      const el = document.getElementById("timer");
      if (!el) return;
      el.textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
      el.classList.toggle("over", sec > 60);
    }, 250);
  }
  async function toggleRec(btn) {
    if (I.rec && I.rec.state === "recording") { I.rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      I.chunks = [];
      I.rec = new MediaRecorder(stream);
      I.rec.ondataavailable = (e) => I.chunks.push(e.data);
      I.rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        I.audioUrl = URL.createObjectURL(new Blob(I.chunks, { type: I.rec.mimeType || "audio/webm" }));
        const b = document.getElementById("recbtn");
        if (b) { b.textContent = "✅ Записано"; b.disabled = true; }
        const box = document.getElementById("audio");
        if (box) box.innerHTML = '<p class="hint" style="margin:10px 0 6px">Твой ответ:</p><audio controls src="' + I.audioUrl + '" style="width:100%"></audio>';
      };
      I.rec.start();
      btn.textContent = "⏹️ Остановить запись";
    } catch (e) {
      btn.textContent = "Микрофон недоступен";
      btn.disabled = true;
    }
  }
  function iReveal() {
    stopTimer();
    const q = I.qs[I.i];
    document.getElementById("ians").innerHTML = '<div id="audio"></div><div class="answer" style="margin-top:14px">' + rich(q.a) + "</div>" +
      '<div class="card"><p class="kind" style="margin-bottom:4px">Что ты сказала</p>' +
      q.k.map((k, i) => '<label class="check"><input type="checkbox" data-key="' + i + '"><span>' + rich(k) + "</span></label>").join("") + "</div>";
    stopRec();
    sheet("", "", '<button class="btn" data-act="inext">Дальше</button>');
    document.getElementById("ians").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function iNext() {
    const q = I.qs[I.i];
    const boxes = [...app.querySelectorAll("[data-key]")];
    const score = boxes.length ? boxes.filter((b) => b.checked).length / boxes.length : 0;
    I.scores.push({ q, score });
    grade(q.id, score >= 0.75 ? "good" : score >= 0.5 ? "ok" : "bad");
    addXp(Math.round(4 + score * 8));
    I.i++;
    iStep();
  }
  function iFinish() {
    stopTimer();
    const avg = Math.round(I.scores.reduce((a, s) => a + s.score, 0) / Math.max(1, I.scores.length) * 100);
    const list = I.scores.map((s) => '<div class="cs-item"><p class="cs-q">' + rich(s.q.q) + '</p><div class="bar"><i style="width:' + Math.round(s.score * 100) +
      '%;background:' + (s.score >= 0.75 ? "var(--green)" : s.score >= 0.5 ? "var(--amber)" : "var(--red)") + '"></i></div></div>').join("");
    view('<div class="wrap">' + topbar() + '<div class="done-hero"><div class="big">🎙️</div><h1>Собеседование пройдено</h1><p class="sub">В среднем ты назвала ' + avg +
      '% ключевых пунктов. Вопросы ниже 50% попали в «Слабые места».</p></div><div class="card">' + list +
      '</div><div style="height:16px"></div><button class="btn" data-go="interview">Ещё раз</button><div style="height:14px"></div><button class="btn ghost" data-go="home">На главную</button></div>');
  }

  // ---------- шпаргалка ----------
  function cheat() {
    view('<div class="wrap"><button class="back" data-go="home">← Назад</button><h1>Шпаргалка</h1><p class="sub">Короткие ответы на все вопросы — пролистать перед звонком.</p>' +
      '<input class="search" id="cs" type="search" placeholder="Поиск по вопросам и ответам" aria-label="Поиск"><div id="cslist"></div></div>');
    drawCheat("");
    document.getElementById("cs").addEventListener("input", (e) => drawCheat(e.target.value));
  }
  function drawCheat(filter) {
    const f = filter.trim().toLowerCase();
    const html = UNITS.map((u) => {
      const items = QS.filter((q) => q.u === u.id && (!f || plain(q.q + " " + q.a + " " + q.k.join(" ")).toLowerCase().includes(f)));
      if (!items.length) return "";
      return '<div class="card" style="margin:0 0 14px"><h2>' + u.icon + " " + esc(u.title) + "</h2>" + items.map((q) =>
        '<div class="cs-item"><p class="cs-q">' + rich(q.q) + '<span class="lvl">' + "●".repeat(q.l) + "</span></p><div>" + rich(q.a) + "</div>" +
        (q.c ? "<details><summary>Код</summary><pre><code>" + esc(q.c) + "</code></pre></details>" : "") + "</div>").join("") + "</div>";
    }).join("");
    document.getElementById("cslist").innerHTML = html || '<p class="sub">Ничего не нашлось.</p>';
  }

  // ---------- профиль ----------
  function profile() {
    const groups = [...new Set(FIELDS.map((f) => f.group))];
    view('<div class="wrap"><button class="back" data-go="home">← Назад</button><h1>Профиль</h1>' +
      '<p class="sub">Эти значения подставляются в ответы. Сейчас стоят значения из модели проекта — замени их на свои реальные. Хранятся только в этом браузере.</p>' +
      groups.map((g) => '<p class="group">' + esc(g) + "</p>" + FIELDS.filter((f) => f.group === g).map((f) =>
        '<div class="field"><label for="f-' + f.key + '">' + esc(f.label) + '</label><input id="f-' + f.key + '" data-field="' + f.key + '" value="' +
        esc(S.profile[f.key] !== undefined ? S.profile[f.key] : f.def) + '"></div>').join("")).join("") +
      '<div class="row2" style="margin-top:24px"><button class="btn ghost" data-act="resetProfile">Вернуть значения модели</button>' +
      '<button class="btn red" data-act="resetProgress">Сбросить прогресс</button></div></div>');
    app.querySelectorAll("[data-field]").forEach((inp) => inp.addEventListener("input", (e) => { S.profile[e.target.dataset.field] = e.target.value; save(); }));
  }
  // Двойное нажатие вместо confirm(): окна подтверждения бывают заблокированы
  function confirmTap(btn, label, fn) {
    if (btn.dataset.armed) { fn(); return; }
    const original = btn.textContent;
    btn.dataset.armed = "1";
    btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = original; } }, 4000);
  }

  // ---------- навигация и клики ----------
  function go(name) {
    stopTimer(); stopRec();
    ({ home, review: startReview, interview: startInterview, cheat, profile })[name]();
  }
  const actions = {
    reveal: revealFlash,
    revealFollow,
    followGood: () => { give(8); next(); },
    followBad: () => { give(2); next(); },
    check,
    next,
    pairsDone: () => { const s = cur(); give(Math.max(2, 10 - s.miss * 2)); next(); },
    quit: () => go("home"),
    iquit: () => go("home"),
    rec: (btn) => toggleRec(btn),
    ireveal: iReveal,
    inext: iNext,
    hideTip: () => { S.tipHidden = true; save(); home(); },
    resetProfile: (btn) => confirmTap(btn, "Нажми ещё раз", () => { S.profile = {}; save(); profile(); }),
    resetProgress: (btn) => confirmTap(btn, "Нажми ещё раз", () => {
      Object.assign(S, { xp: 0, streak: 0, last: null, day: null, dayXp: 0, cards: {} }); save(); home();
    })
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (d.go) return go(d.go);
    if (d.unit) return startUnit(+d.unit);
    if (d.opt !== undefined) return pickOpt(+d.opt, el);
    if (d.rate) return rate(d.rate);
    if (d.pl !== undefined || d.pr !== undefined) return pairTap(el);
    if (d.oi !== undefined) { cur().picked.push(+d.oi); return drawOrder(); }
    if (d.ou !== undefined) { cur().picked.splice(+d.ou, 1); return drawOrder(); }
    if (d.act && actions[d.act]) actions[d.act](el);
  });

  home();
})();
