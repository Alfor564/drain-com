/* ============================================================
   Волны: окно-арка, дрейфующий фон, линия воды у подвала,
   сигнал в подвале. Плюс пауза и копирование почты.
   ============================================================ */

(() => {
  document.addEventListener('contextmenu', (event) => event.preventDefault());
  "use strict";

  const plateCanvas = document.getElementById("plate");
  const signalCanvas = document.getElementById("signal");
  const ambientCanvas = document.getElementById("ambient");
  const waterlineCanvas = document.getElementById("waterline");
  const dividerCanvas = document.getElementById("divider");
  const snowCanvas = document.getElementById("snow");
  const plateWindow = plateCanvas.parentElement;
  const toastEl = document.getElementById("toast");
  const audio = document.getElementById("track");
  const faces = Array.from(document.querySelectorAll(".face"));
  const faceNick = document.getElementById("faceNick");
  const visitsEl = document.getElementById("visits");

  const pctx = plateCanvas.getContext("2d");
  const sctx = signalCanvas.getContext("2d");
  const actx = ambientCanvas.getContext("2d");
  const wctx = waterlineCanvas.getContext("2d");
  const dctx = dividerCanvas.getContext("2d");
  const nctx = snowCanvas.getContext("2d");

  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STORAGE_KEY = "plate-motion";

  const ink = "255,255,255";
  const paperInk = "214,233,255";

  // Волновые источники: положение, амплитуда, частота, скорость, затухание.
  const SOURCES = [
    { x: 0.24, y: 0.4, amp: 15, k: 0.021, speed: 0.5, decay: 0.0016, drift: 0.07, phase: 0.0 },
    { x: 0.76, y: 0.63, amp: 11, k: 0.027, speed: -0.38, decay: 0.0022, drift: 0.05, phase: 1.9 },
    { x: 0.55, y: 0.16, amp: 9, k: 0.035, speed: 0.66, decay: 0.0026, drift: 0.04, phase: 3.6 },
  ];

  const state = {
    motion: true,
    t: 0,
    reveal: 0,
    dpr: 1,
    W: 0,
    H: 0,
    SW: 0,
    SH: 0,
    AW: 0,
    AH: 0,
    adpr: 1,
    WW: 0,
    WH: 0,
    wdpr: 1,
    DW: 0,
    DH: 0,
    ddpr: 1,
    flakes: [],
    raf: 0,
    last: 0,
    slowLast: 0,
    theme: null,
  };

  /* ── тема по киевскому времени ───────────────────────── */

  const THEME_CONFIG = {
    time: "",     // "HH:MM" — принудительное киевское время
    force: "",    // "night" | "dawn" | "morning" | "day" | "evening" | "late"
    debug: false, // панель: ?theme-debug=1
  };

  // waterline — три слоя воды у подвала, от дальнего гребня к переднему.
  // Последний слой обязан совпадать с footer[0]: на стыке воды и подвала
  // не должно быть шва. Первые два — тот же цвет, подмешанный к воде темы.

  const THEMES = [
    {
      key: "night", label: "ночь", from: 22 * 60, to: 5 * 60, preset: 60,
      paper: "#e6e7ff",
      papers: ["#f4f3ff", "#d9daff", "#ecebff", "#f0efff", "#e7e6fb", "#d9d9f5"],
      water: "#6d7cff", waterSoft: "#b9c0ff", waterDeep: "#1a2450", accent: "#5a67ff",
      aura: ["rgba(140,150,255,.42)", "rgba(185,170,255,.3)", "rgba(110,125,255,.3)", "rgba(200,195,255,.26)"],
      glass: ["rgba(244,244,255,.6)", "rgba(230,232,255,.48)", "rgba(195,200,250,.42)", "rgba(140,150,230,.52)"],
      mark: ["rgba(140,150,255,.85)", "rgba(190,195,255,.4)"],
      footer: ["#1a2450", "#0a1029"],
      gloss: ["#b9c1ff", "#6d7cff", "#4a56e0"],
      waterline: ["#2f3a7c", "#242f65", "#1a2450"],
      crest: ["rgba(170,180,255,.42)", "rgba(220,230,255,.42)", "rgba(120,150,255,.38)"],
      ambient: ["rgba(150,160,255,.17)", "rgba(190,175,255,.16)", "rgba(120,135,255,.14)", "rgba(225,228,255,.2)", "rgba(255,255,255,.25)"],
      divider: "90,100,255", plateInk: "238,240,255",
    },
    {
      key: "dawn", label: "рассвет", from: 5 * 60, to: 8 * 60, preset: 6 * 60 + 30,
      paper: "#f7eaf1",
      papers: ["#fff6f9", "#ffd9e4", "#ffeef2", "#fff3f6", "#fbeaf1", "#f3dbe8"],
      water: "#ff9fb3", waterSoft: "#ffc9d6", waterDeep: "#5a2a44", accent: "#ff6f9c",
      aura: ["rgba(255,170,190,.4)", "rgba(255,200,170,.3)", "rgba(200,170,255,.28)", "rgba(255,150,180,.3)"],
      glass: ["rgba(255,244,247,.6)", "rgba(255,230,238,.48)", "rgba(247,201,216,.42)", "rgba(232,168,189,.52)"],
      mark: ["rgba(255,159,179,.85)", "rgba(255,208,220,.4)"],
      footer: ["#5a2a44", "#250e1f"],
      gloss: ["#ffd0dd", "#ff8fa8", "#e85f86"],
      waterline: ["#834760", "#6e3851", "#5a2a44"],
      crest: ["rgba(255,190,205,.42)", "rgba(255,230,235,.42)", "rgba(255,170,190,.38)"],
      ambient: ["rgba(255,170,190,.17)", "rgba(255,200,170,.15)", "rgba(230,170,255,.14)", "rgba(255,255,255,.26)"],
      divider: "255,111,156", plateInk: "255,240,245",
    },
    {
      key: "morning", label: "утро", from: 8 * 60, to: 11 * 60, preset: 9 * 60,
      paper: "#e9f7f1",
      papers: ["#f4fffb", "#c9f3e5", "#e8fbf5", "#f0fdf9", "#e4f7ef", "#d4f0e5"],
      water: "#5fdcc4", waterSoft: "#b6f5e6", waterDeep: "#154a3f", accent: "#1fb394",
      aura: ["rgba(150,235,215,.4)", "rgba(120,220,210,.3)", "rgba(190,240,220,.28)", "rgba(150,220,255,.3)"],
      glass: ["rgba(243,255,251,.6)", "rgba(224,251,242,.48)", "rgba(192,240,226,.42)", "rgba(146,216,200,.52)"],
      mark: ["rgba(95,220,196,.85)", "rgba(182,245,230,.4)"],
      footer: ["#154a3f", "#08231d"],
      gloss: ["#b8f5e8", "#4fd0b8", "#1a9e86"],
      waterline: ["#286f60", "#1e5c4f", "#154a3f"],
      crest: ["rgba(160,240,220,.42)", "rgba(220,255,245,.42)", "rgba(120,220,200,.38)"],
      ambient: ["rgba(150,235,215,.17)", "rgba(120,220,200,.15)", "rgba(190,240,220,.13)", "rgba(255,255,255,.26)"],
      divider: "31,179,148", plateInk: "240,255,250",
    },
    {
      key: "day", label: "день", from: 11 * 60, to: 17 * 60, preset: 13 * 60,
      paper: "#e5f0fb",
      papers: ["#ffffff", "#d3eaff", "#e6f3ff", "#eef7ff", "#e4effb", "#d6e7f7"],
      water: "#6fb7ff", waterSoft: "#b8ddff", waterDeep: "#1b3858", accent: "#2f6bff",
      aura: ["rgba(198,172,255,.4)", "rgba(150,235,215,.32)", "rgba(255,198,170,.28)", "rgba(150,195,255,.34)"],
      glass: ["rgba(255,255,255,.6)", "rgba(230,244,255,.48)", "rgba(195,224,250,.42)", "rgba(143,189,233,.52)"],
      mark: ["rgba(96,158,235,.85)", "rgba(160,205,250,.4)"],
      footer: ["#142b47", "#0a1a2c"],
      gloss: ["#a6ceff", "#5a94f0", "#2f6bff"],
      waterline: ["#2b4e75", "#1f3c5d", "#142b47"],
      crest: ["rgba(190,170,255,.42)", "rgba(214,236,255,.42)", "rgba(150,235,215,.38)"],
      ambient: ["rgba(198,172,255,.17)", "rgba(150,235,215,.15)", "rgba(255,198,170,.13)", "rgba(150,196,244,.17)", "rgba(255,255,255,.26)"],
      divider: "47,107,255", plateInk: "255,255,255",
    },
    {
      key: "evening", label: "вечер", from: 17 * 60, to: 21 * 60, preset: 19 * 60,
      paper: "#f8ece1",
      papers: ["#fff8f0", "#ffd7b0", "#fff0e2", "#fff5eb", "#f9ecdf", "#f2dfcd"],
      water: "#ffb36b", waterSoft: "#ffd7b0", waterDeep: "#5a3018", accent: "#ff8a3d",
      aura: ["rgba(255,190,140,.4)", "rgba(255,160,120,.3)", "rgba(255,210,170,.3)", "rgba(230,160,120,.26)"],
      glass: ["rgba(255,248,240,.6)", "rgba(255,238,223,.48)", "rgba(247,217,192,.42)", "rgba(232,184,150,.52)"],
      mark: ["rgba(255,179,107,.85)", "rgba(255,215,176,.4)"],
      footer: ["#5a3018", "#221006"],
      gloss: ["#ffd7b0", "#ffa45f", "#e8742e"],
      waterline: ["#83512d", "#6e4022", "#5a3018"],
      crest: ["rgba(255,200,150,.42)", "rgba(255,235,215,.42)", "rgba(255,170,110,.38)"],
      ambient: ["rgba(255,190,140,.17)", "rgba(255,160,120,.15)", "rgba(255,210,170,.14)", "rgba(255,255,255,.26)"],
      divider: "255,138,61", plateInk: "255,248,240",
    },
    {
      key: "late", label: "поздний", from: 21 * 60, to: 22 * 60, preset: 21 * 60 + 30,
      paper: "#efe8f9",
      papers: ["#fbf7ff", "#dcc6ff", "#f0eaff", "#f6f1ff", "#efe8fa", "#e2d6f3"],
      water: "#b58cff", waterSoft: "#dcc6ff", waterDeep: "#3f235f", accent: "#8f5cff",
      aura: ["rgba(190,160,255,.4)", "rgba(220,190,255,.3)", "rgba(150,140,255,.28)", "rgba(240,200,255,.26)"],
      glass: ["rgba(250,247,255,.6)", "rgba(240,232,255,.48)", "rgba(220,198,255,.42)", "rgba(184,158,232,.52)"],
      mark: ["rgba(181,140,255,.85)", "rgba(220,198,255,.4)"],
      footer: ["#3f235f", "#170a26"],
      gloss: ["#dcc6ff", "#a97fff", "#7a45e0"],
      waterline: ["#5d3d87", "#4d3072", "#3f235f"],
      crest: ["rgba(210,190,255,.42)", "rgba(240,230,255,.42)", "rgba(180,150,255,.38)"],
      ambient: ["rgba(190,160,255,.17)", "rgba(220,190,255,.15)", "rgba(150,140,255,.14)", "rgba(255,255,255,.26)"],
      divider: "143,92,255", plateInk: "250,246,255",
    },
  ];

  let themeLab = null;

  const themeParams = new URLSearchParams(window.location.search);
  if (themeParams.get("time")) THEME_CONFIG.time = themeParams.get("time");
  if (themeParams.get("theme")) THEME_CONFIG.force = themeParams.get("theme");
  if (themeParams.get("theme-debug") === "1") THEME_CONFIG.debug = true;

  function parseTime(value) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!m) return null;
    return (Number(m[1]) % 24) * 60 + Math.min(59, Number(m[2]));
  }

  function kyivMinutes() {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Kiev", hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(new Date());
      const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
      const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
      return (h % 24) * 60 + m;
    } catch (_) {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
  }

  function requestedMinutes() {
    const fixed = parseTime(THEME_CONFIG.time);
    return fixed == null ? kyivMinutes() : fixed;
  }

  function pickTheme(minutes) {
    if (THEME_CONFIG.force) {
      const forced = THEMES.find((t) => t.key === THEME_CONFIG.force);
      if (forced) return forced;
    }
    return THEMES.find((t) => {
      if (t.from > t.to) return minutes >= t.from || minutes < t.to;
      return minutes >= t.from && minutes < t.to;
    }) || THEMES.find((t) => t.key === "day");
  }

  function formatMinutes(minutes) {
    return String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" +
      String(Math.round(minutes % 60)).padStart(2, "0");
  }

  function applyTheme(theme) {
    if (!theme) return;
    state.theme = theme;
    const r = document.documentElement;
    r.dataset.theme = theme.key;
    r.style.setProperty("--paper", theme.paper);
    theme.papers.forEach((c, i) => r.style.setProperty("--theme-paper-" + (i + 1), c));
    r.style.setProperty("--theme-water", theme.water);
    r.style.setProperty("--theme-water-soft", theme.waterSoft);
    r.style.setProperty("--theme-water-deep", theme.waterDeep);
    r.style.setProperty("--accent", theme.accent);
    theme.aura.forEach((c, i) => r.style.setProperty("--theme-aura-" + (i + 1), c));
    theme.glass.forEach((c, i) => r.style.setProperty("--theme-glass-" + (i + 1), c));
    theme.mark.forEach((c, i) => r.style.setProperty("--theme-mark-" + (i + 1), c));
    r.style.setProperty("--theme-mark-3", "transparent");
    r.style.setProperty("--theme-footer-1", theme.footer[0]);
    r.style.setProperty("--theme-footer-2", theme.footer[1]);
    theme.gloss.forEach((c, i) => r.style.setProperty("--theme-gloss-" + (i + 1), c));
    r.style.setProperty("--gloss", `linear-gradient(180deg, ${theme.gloss[0]} 0%, ${theme.gloss[1]} 45%, ${theme.gloss[2]} 100%)`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.paper);
    if (themeLab) updateThemeLab();
    if (!state.motion) drawStatic();
  }

  function updateThemeFromState() {
    applyTheme(pickTheme(requestedMinutes()));
  }

  function updateThemeLab() {
    if (!themeLab) return;
    const minutes = requestedMinutes();
    const theme = state.theme || pickTheme(minutes);
    const name = themeLab.querySelector(".theme-lab__name");
    const time = themeLab.querySelector(".theme-lab__time");
    const swatch = themeLab.querySelector(".theme-lab__swatch");
    const range = themeLab.querySelector(".theme-lab__range");
    const note = themeLab.querySelector(".theme-lab__note");
    if (name) name.textContent = theme.label.toUpperCase();
    if (time) time.textContent = "КИЕВ " + formatMinutes(minutes);
    if (swatch) swatch.style.background = theme.water;
    if (range) range.value = String(minutes);
    if (note) note.textContent = `${formatMinutes(theme.from)}–${formatMinutes(theme.to)} · ${theme.water}`;
    themeLab.querySelectorAll(".theme-lab__presets button").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.key === theme.key);
    });
  }

  function setupThemeLab() {
    if (!THEME_CONFIG.debug) return;
    themeLab = document.createElement("div");
    themeLab.className = "theme-lab";
    themeLab.innerHTML = `
      <div class="theme-lab__row"><span class="theme-lab__k">ТЕМА · КИЕВ</span><b class="theme-lab__name"></b></div>
      <div class="theme-lab__row"><span class="theme-lab__swatch"></span><span class="theme-lab__time"></span></div>
      <input class="theme-lab__range" type="range" min="0" max="1439" step="1" aria-label="Время темы">
      <div class="theme-lab__presets"></div>
      <button class="theme-lab__auto" type="button">авто · сейчас</button>
      <p class="theme-lab__note"></p>
    `;
    const presets = themeLab.querySelector(".theme-lab__presets");
    THEMES.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.key = t.key;
      b.textContent = t.label;
      b.addEventListener("click", () => {
        THEME_CONFIG.time = formatMinutes(t.preset);
        THEME_CONFIG.force = "";
        updateThemeFromState();
      });
      presets.appendChild(b);
    });
    themeLab.querySelector(".theme-lab__range").addEventListener("input", (e) => {
      THEME_CONFIG.time = formatMinutes(Number(e.target.value));
      THEME_CONFIG.force = "";
      updateThemeFromState();
    });
    themeLab.querySelector(".theme-lab__auto").addEventListener("click", () => {
      THEME_CONFIG.time = "";
      THEME_CONFIG.force = "";
      updateThemeFromState();
    });
    document.body.appendChild(themeLab);
    updateThemeLab();
  }


  /* ── размеры ─────────────────────────────────────────── */

  function sizeCanvas(canvas, ctx, width, height, dpr) {
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const pr = plateWindow.getBoundingClientRect();
    state.W = Math.round(pr.width);
    state.H = Math.round(pr.height);
    sizeCanvas(plateCanvas, pctx, state.W, state.H, state.dpr);

    const sr = signalCanvas.getBoundingClientRect();
    state.SW = Math.round(sr.width);
    state.SH = Math.round(sr.height);
    sizeCanvas(signalCanvas, sctx, state.SW, state.SH, state.dpr);

    state.adpr = Math.min(
      window.devicePixelRatio || 1,
      1.25,
      Math.max(0.75, Math.sqrt(2_500_000 / Math.max(1, window.innerWidth * window.innerHeight)))
    );
    state.AW = window.innerWidth;
    state.AH = window.innerHeight;
    sizeCanvas(ambientCanvas, actx, state.AW, state.AH, state.adpr);
    sizeCanvas(snowCanvas, nctx, state.AW, state.AH, state.adpr);
    buildSnow();

    const wr = waterlineCanvas.getBoundingClientRect();
    state.WW = Math.round(wr.width);
    state.WH = Math.round(wr.height);
    state.wdpr = Math.min(window.devicePixelRatio || 1, 1.5);
    sizeCanvas(waterlineCanvas, wctx, state.WW, state.WH, state.wdpr);

    const dr = dividerCanvas.getBoundingClientRect();
    state.DW = Math.round(dr.width);
    state.DH = Math.round(dr.height);
    state.ddpr = Math.min(window.devicePixelRatio || 1, 2);
    sizeCanvas(dividerCanvas, dctx, state.DW, state.DH, state.ddpr);

    if (state.motion) start();
    else drawStatic();
  }

  /* ── снег ────────────────────────────────────────────── */

  function buildSnow() {
    const count = Math.round(Math.min(220, Math.max(48, (state.AW * state.AH) / 9000)));
    state.flakes = Array.from({ length: count }, () => {
      const r = 0.8 + Math.random() * 2.6;
      return {
        x: Math.random() * state.AW,
        y: Math.random() * state.AH,
        r,
        vy: 8 + Math.random() * 34,
        sway: 4 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.6,
        alpha: 0.25 + Math.random() * 0.5,
        big: Math.random() > 0.9,
      };
    });
  }

  function drawSnow(t, dt) {
    const W = state.AW;
    const H = state.AH;
    if (!W || !H) return;

    nctx.setTransform(state.adpr, 0, 0, state.adpr, 0, 0);
    nctx.clearRect(0, 0, W, H);

    for (let i = 0; i < state.flakes.length; i++) {
      const f = state.flakes[i];

      if (dt) {
        f.y += f.vy * dt;
        f.x += Math.sin(t * f.speed + f.phase) * f.sway * dt + 3 * dt;
        if (f.y > H + 8) {
          f.y = -8;
          f.x = Math.random() * W;
        }
        if (f.x > W + 8) f.x = -8;
      }

      if (f.r > 1.6) {
        nctx.beginPath();
        nctx.fillStyle = "rgba(120,165,210,0.22)";
        nctx.arc(f.x + 0.6, f.y + 1, f.r * 1.35, 0, Math.PI * 2);
        nctx.fill();
      }

      nctx.beginPath();
      nctx.fillStyle = `rgba(255,255,255,${f.alpha})`;
      nctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      nctx.fill();

      if (f.big) {
        nctx.beginPath();
        nctx.fillStyle = `rgba(255,255,255,${f.alpha * 0.16})`;
        nctx.arc(f.x, f.y, f.r * 3.6, 0, Math.PI * 2);
        nctx.fill();
      }
    }
  }

  /* ── дрейфующий фон ──────────────────────────────────── */

  function drawAmbient(t) {
    const W = state.AW;
    const H = state.AH;
    if (!W || !H) return;

    actx.setTransform(state.adpr, 0, 0, state.adpr, 0, 0);
    actx.clearRect(0, 0, W, H);

    const count = 16;
    const scale = H / 900;
    const ambientColors = state.theme.ambient;

    for (let i = 0; i < count; i++) {
      const v = (i + 0.5) / count;
      const baseY = H * (0.03 + v * 0.94);
      const amp = (16 + 26 * Math.abs(Math.sin(i * 1.7))) * scale;
      const k = 0.0014 + (i % 4) * 0.0007;
      const sp = 0.05 + (i % 3) * 0.025;
      const ph = i * 1.37;

      actx.beginPath();
      for (let x = -20; x <= W + 20; x += 16) {
        const y = baseY
          + Math.sin(x * k + t * sp + ph) * amp
          + Math.sin(x * k * 2.4 - t * sp * 0.7 + ph) * amp * 0.32;
        if (x === -20) actx.moveTo(x, y);
        else actx.lineTo(x, y);
      }

      actx.strokeStyle = ambientColors[i % ambientColors.length];
      actx.lineWidth = 1;
      actx.stroke();
    }
  }

  /* ── окно-арка ───────────────────────────────────────── */

  function drawPlate(t, reveal) {
    const W = state.W;
    const H = state.H;
    if (!W || !H) return;

    pctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    pctx.clearRect(0, 0, W, H);

    const lines = Math.round(Math.min(58, Math.max(30, H / 9)));
    const step = Math.max(3, W / 64);
    const scale = H / 480;

    const sources = SOURCES.map((s) => ({
      sx: (s.x + Math.sin(t * s.drift + s.phase) * 0.025) * W,
      sy: (s.y + Math.cos(t * s.drift * 1.3 + s.phase) * 0.02) * H,
      amp: s.amp * scale,
      k: s.k,
      speed: s.speed,
      decay: s.decay,
      phase: s.phase,
    }));

    for (let i = 0; i < lines; i++) {
      const v = lines > 1 ? i / (lines - 1) : 0;
      const baseY = H * (0.055 + v * 0.89);
      const focus = Math.exp(-Math.pow((v - 0.56) / 0.33, 2));
      const alpha = (0.22 + 0.5 * focus) * reveal;
      const major = i % 11 === 0;

      pctx.beginPath();
      for (let x = -8; x <= W + 8; x += step) {
        let dy = 0;
        for (let s = 0; s < sources.length; s++) {
          const src = sources[s];
          const dx = x - src.sx;
          const dyy = baseY - src.sy;
          const dist = Math.sqrt(dx * dx + dyy * dyy);
          dy += src.amp * Math.sin(dist * src.k - t * src.speed + src.phase) * Math.exp(-dist * src.decay);
        }
        if (x === -8) pctx.moveTo(x, baseY + dy);
        else pctx.lineTo(x, baseY + dy);
      }

      pctx.strokeStyle = `rgba(${state.theme.plateInk},${major ? Math.min(0.95, alpha * 1.3) : alpha})`;
      pctx.lineWidth = major ? 1.3 : 0.75;
      pctx.stroke();
    }

    // медленные круги на воде
    const cx = W * 0.5;
    const cy = H * 0.74;
    for (let k = 0; k < 3; k++) {
      const period = 9 + k * 3.5;
      const p = ((t * 0.55 + k * period * 0.33) % period) / period;
      const r = p * W * 1.15;
      if (r < 2) continue;
      pctx.beginPath();
      pctx.arc(cx, cy, r, 0, Math.PI * 2);
      pctx.strokeStyle = `rgba(${state.theme.plateInk},${(1 - p) * 0.2 * reveal})`;
      pctx.lineWidth = 1;
      pctx.stroke();
    }
  }

  /* ── сигнал в подвале ────────────────────────────────── */

  function drawSignal(t) {
    const W = state.SW;
    const H = state.SH;
    if (!W || !H) return;

    sctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    sctx.clearRect(0, 0, W, H);

    for (let k = 0; k < 2; k++) {
      sctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = H * 0.58
          + Math.sin(x * 0.011 + t * 0.7 + k * 2.1) * (6 - k * 2)
          + Math.sin(x * 0.0035 - t * 0.4 + k) * 5;
        if (x === 0) sctx.moveTo(x, y);
        else sctx.lineTo(x, y);
      }
      sctx.strokeStyle = `rgba(${paperInk},${k ? 0.16 : 0.4})`;
      sctx.lineWidth = 1;
      sctx.stroke();
    }
  }

  /* ── линия воды перед подвалом ───────────────────────── */

  function drawWaterline(t) {
    const W = state.WW;
    const H = state.WH;
    if (!W || !H) return;

    wctx.setTransform(state.wdpr, 0, 0, state.wdpr, 0, 0);
    wctx.clearRect(0, 0, W, H);

    const layers = [
      { color: "#2b4f77", base: 0.34, amp: 7, k: 0.008, sp: 0.22, ph: 0.0 },
      { color: "#1b3858", base: 0.5, amp: 6, k: 0.0065, sp: -0.18, ph: 2.2 },
      { color: "#142b47", base: 0.66, amp: 5, k: 0.0055, sp: 0.14, ph: 4.1 },
    ];

    for (let l = 0; l < layers.length; l++) {
      const L = layers[l];
      const pts = [];
      for (let x = -20; x <= W + 20; x += 10) {
        const y = H * L.base
          + Math.sin(x * L.k + t * L.sp + L.ph) * L.amp
          + Math.sin(x * L.k * 2.2 - t * L.sp * 0.65 + L.ph) * L.amp * 0.4
          + Math.sin(x * 0.018 + t * 0.35 + L.ph) * 1.6;
        pts.push(x, y);
      }

      wctx.beginPath();
      wctx.moveTo(-20, H + 20);
      for (let i = 0; i < pts.length; i += 2) wctx.lineTo(pts[i], pts[i + 1]);
      wctx.lineTo(W + 20, H + 20);
      wctx.closePath();
      wctx.fillStyle = (state.theme.waterline && state.theme.waterline[l]) || L.color;
      wctx.fill();

      // пенный гребень у переднего слоя
      if (l === layers.length - 1) {
        wctx.beginPath();
        wctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) wctx.lineTo(pts[i], pts[i + 1]);
        const crest = wctx.createLinearGradient(0, 0, W, 0);
        const crestColors = state.theme.crest;
        crest.addColorStop(0, crestColors[0]);
        crest.addColorStop(0.45, crestColors[1]);
        crest.addColorStop(1, crestColors[2]);
        wctx.strokeStyle = crest;
        wctx.lineWidth = 1;
        wctx.stroke();
      }
    }
  }

  /* ── волнистая линия в заголовке указателя ───────────── */

  function drawDivider(t) {
    const W = state.DW;
    const H = state.DH;
    if (!W || !H) return;

    dctx.setTransform(state.ddpr, 0, 0, state.ddpr, 0, 0);
    dctx.clearRect(0, 0, W, H);

    for (let k = 0; k < 2; k++) {
      dctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = H * 0.5
          + Math.sin(x * 0.028 + t * (0.45 + k * 0.2) + k * 2) * 2.4
          + Math.sin(x * 0.009 - t * 0.3 + k) * 1.6;
        if (x === 0) dctx.moveTo(x, y);
        else dctx.lineTo(x, y);
      }
      dctx.strokeStyle = `rgba(${state.theme.divider},${k ? 0.18 : 0.4})`;
      dctx.lineWidth = 1;
      dctx.stroke();
    }
  }

  /* ── цикл ────────────────────────────────────────────── */

  function frame(now) {
    const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 0.016;
    state.last = now;
    state.t += dt;
    state.reveal = Math.min(1, state.reveal + dt / 1.1);

    // фоновые волны медленные — хватит 30 кадров в секунду
    if (!state.slowLast || now - state.slowLast >= 33) {
      state.slowLast = now;
      drawAmbient(state.t);
      drawWaterline(state.t);
      drawDivider(state.t);
    }

    drawPlate(state.t, state.reveal);
    drawSignal(state.t);
    drawSnow(state.t, dt);

    state.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (state.raf || !state.motion || document.hidden) return;
    state.last = 0;
    state.slowLast = 0;
    state.raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function drawStatic() {
    state.reveal = 1;
    drawAmbient(state.t || 6.4);
    drawPlate(state.t || 6.4, 1);
    drawSignal(state.t || 6.4);
    drawWaterline(state.t || 6.4);
    drawDivider(state.t || 6.4);
    drawSnow(state.t || 6.4, 0);
  }

  /* ── пауза / движение ────────────────────────────────── */

  function applyMotion(on, persist) {
    state.motion = on;
    document.body.classList.toggle("is-calm", !on);

    if (on) {
      start();
    } else {
      stop();
      state.t = 6.4;
      drawStatic();
    }

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, on ? "on" : "off"); } catch (_) {}
    }
  }

  const stored = (() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  })();

  applyMotion(stored ? stored === "on" : !reduceQuery.matches, false);

  reduceQuery.addEventListener?.("change", (e) => {
    if (e.matches) applyMotion(false, false);
  });

  /* ── копирование почты ───────────────────────────────── */

  let toastTimer = 0;

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) { /* ниже — запасной путь */ }

    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    area.remove();
    return ok;
  }

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await copyText(btn.dataset.copy);
      showToast(ok ? `скопировано — ${btn.dataset.copy}` : "не удалось скопировать");
    });
  });

  /* ── витрина с аватарками ────────────────────────────── */

  let faceIndex = 0;

  function showFace(i) {
    if (!faces.length) return;
    faceIndex = (i + faces.length) % faces.length;

    faces.forEach((f, j) => {
      const active = j === faceIndex;
      f.classList.toggle("is-active", active);
      f.setAttribute("aria-hidden", active ? "false" : "true");
      const link = f.querySelector(".face__link");
      if (link) link.tabIndex = active ? 0 : -1;
    });

    if (faceNick) faceNick.textContent = faces[faceIndex].dataset.nick || "";
  }

  showFace(0);

  /* ── часы: текущее время в Киеве ─────────────────────── */

  const kyivTimeEl = document.getElementById("kyivTime");
  const kyivTimeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kiev",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const kyivDateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kiev",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  function updateKyivTime() {
    if (!kyivTimeEl) return;
    const now = new Date();
    const text = kyivTimeFmt.format(now);
    if (kyivTimeEl.textContent === text) return;
    kyivTimeEl.textContent = text;
    kyivTimeEl.dateTime = `${kyivDateFmt.format(now)}T${text}`;
  }

  updateKyivTime();
  window.setInterval(updateKyivTime, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateKyivTime();
  });

  /* ── счётчик заходов (заглушка, потом заменить на GitHub) ── */

  if (visitsEl) {
    try {
      const seen = localStorage.getItem("uniqueUser");
      let n = Number(localStorage.getItem("uniqueCount")) || 0;
      if (!seen) {
        n += 1;
        localStorage.setItem("uniqueUser", "1");
        localStorage.setItem("uniqueCount", String(n));
      }
      visitsEl.textContent = String(Math.max(1, n));
    } catch (_) {
      visitsEl.textContent = "1";
    }
  }

  window.setInterval(() => {
    if (document.body.classList.contains("is-calm")) return;
    showFace(faceIndex + 1);
  }, 3800);

  document.querySelectorAll(".face__img").forEach((img) => {
    const hide = () => img.classList.add("is-missing");
    img.addEventListener("error", hide);
    if (img.complete && img.naturalWidth === 0) hide();
  });

  /* ── трек: случайный из плейлиста, старт с первого жеста ── */

  if (audio) {
    const TRACKS = [
      "audio/1-april-2024-g-minor.mp3",
      "audio/all-wild-things-are-shy.mp3",
      "audio/365.mp3",
      "audio/24-april-2024-key-unknown.mp3",
      "audio/27-march-2024-b-minor.mp3",
      "audio/7-march-2024-f-minor.mp3",
    ];
    const VOLUME = 0.4;
    let queue = [];
    let last = "";
    let unlocked = false;
    let stallTimer = 0;

    const shuffle = (list) => {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const armStall = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        // трек стоит на месте, хотя должен играть — берём следующий
        if (!audio.paused && audio.currentTime < 0.35 && audio.readyState >= 2) nextTrack();
      }, 9000);
    };

    const nextTrack = () => {
      if (!queue.length) {
        queue = shuffle(TRACKS);
        if (queue.length > 1 && queue[0] === last) {
          [queue[0], queue[queue.length - 1]] = [queue[queue.length - 1], queue[0]];
        }
      }
      last = queue.shift();
      audio.src = last;
      audio.volume = VOLUME;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      armStall();
    };

    const onGesture = () => {
      if (unlocked) return;
      audio.muted = false;
      audio.volume = VOLUME;
      const p = audio.play();
      const success = () => {
        if (!audio.muted) {
          unlocked = true;
          ["pointerdown", "keydown", "touchstart"].forEach((ev) => {
            window.removeEventListener(ev, onGesture, true);
          });
          armStall();
        }
      };
      if (p && typeof p.then === "function") {
        p.then(success).catch(() => {
          audio.muted = true;
          const q = audio.play();
          if (q && typeof q.catch === "function") q.catch(() => {});
        });
      } else {
        success();
      }
    };

    audio.addEventListener("ended", nextTrack);
    audio.addEventListener("error", nextTrack);
    audio.addEventListener("playing", armStall);

    // сразу запускаем без звука — это браузер разрешает всегда;
    // звук включается на первом клике/клавише, повторяем до успеха
    audio.muted = true;
    nextTrack();

    ["pointerdown", "keydown", "touchstart"].forEach((ev) => {
      window.addEventListener(ev, onGesture, { capture: true, passive: true });
    });
  }

  /* ── лайк / дизлайк ───────────────────────────────────── */

  const reacts = Array.from(document.querySelectorAll(".react"));
  if (reacts.length) {
    const KEY = "warm.respect.v1";
    const sets = reacts.map((container) => ({
      like: container.querySelector('[data-react="like"]'),
      dislike: container.querySelector('[data-react="dislike"]'),
      likeCount: container.querySelector('[data-react-count="like"]'),
      dislikeCount: container.querySelector('[data-react-count="dislike"]'),
    }));
    const data = { like: 0, dislike: 0, vote: "" };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        data.vote = saved.vote === "like" || saved.vote === "dislike" ? saved.vote : "";
        // ровно один стоящий голос у этого браузера
        data.like = data.vote === "like" ? 1 : 0;
        data.dislike = data.vote === "dislike" ? 1 : 0;
      }
    } catch (_) {}

    const render = () => {
      sets.forEach((set) => {
        ["like", "dislike"].forEach((key) => {
          const btn = set[key];
          if (btn) {
            btn.classList.toggle("is-on", data.vote === key);
            btn.setAttribute("aria-pressed", String(data.vote === key));
          }
          const count = set[key + "Count"];
          if (count) count.textContent = data[key];
        });
      });
    };

    sets.forEach((set) => {
      ["like", "dislike"].forEach((key) => {
        const btn = set[key];
        if (!btn) return;
        btn.addEventListener("click", () => {
          // ровно один стоящий голос: без накоплений и двойных единиц
          if (data.vote === key) {
            data[key] = 0;
            data.vote = "";
          } else {
            if (data.vote) data[data.vote] = 0;
            data[key] = 1;
            data.vote = key;
          }
          try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
          render();
        });
      });
    });
    render();
  }

  /* ── боковые колонки: полный текст + бесшовная прокрутка ── */

  function buildSide(raw, copy) {
    const lines = raw.replace(/\r/g, "").split("\n");
    const frag = document.createDocumentFragment();
    const isLeft = !!copy.closest(".side--left");

    const add = (cls, text) => {
      const p = document.createElement("p");
      p.className = cls;
      p.textContent = text;
      frag.appendChild(p);
      return p;
    };

    add("side__top", isLeft ? "2005." : "6969.");

    let chapterSeen = false;
    let chapterCount = 0;
    let skipTitle = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      if (skipTitle) {
        add("side__chap-title", "— " + line + " —");
        skipTitle = false;
        continue;
      }

      if (/^Глава\s+\d+/i.test(line)) {
        if (chapterCount > 0) add("side__sep", "✦ // ✦");
        chapterCount += 1;
        chapterSeen = true;
        const num = (line.match(/\d+/) || ["0"])[0];
        add("side__chap", "§ ГЛАВА " + num + " //");
        skipTitle = true;
        continue;
      }

      if (!chapterSeen) {
        add("side__credit", line);
        continue;
      }

      if (line.length < 60 && !/[.!?…:]$/.test(line) && !/^[-–—]/.test(line)) {
        add("side__sub", "// " + line);
        continue;
      }

      if (/^[-–—]/.test(line)) {
        line = "— " + line.replace(/^[-–—]\s*/, "");
      }

      add("side__para", line);
    }

    copy.textContent = "";
    copy.appendChild(frag);
  }

  document.querySelectorAll(".side__copy").forEach((copy) => {
    const raw = copy.closest(".side--left") ? window.SIDE_LEFT : window.SIDE_RIGHT;
    if (raw) buildSide(raw, copy);
    copy.parentElement.appendChild(copy.cloneNode(true));
  });

  /* ── отражения слов на бумаге ────────────────────────── */

  const REFLECTIONS = [
    { sel: ".name__first", level: "strong" },
    { sel: ".kicker", level: "key" },
    { sel: ".lead", level: "key" },
    { sel: ".index__title", level: "key" },
    { sel: ".row__name", level: "key" },
    { sel: ".masthead__brand", level: "soft" },
    { sel: ".facts dt", level: "soft" },
    { sel: ".facts dd:not(.status):not(.facts__clock)", level: "soft" },
    { sel: ".index__note", level: "soft" },
    { sel: ".row__handle", level: "soft" }
  ];

  const reflectFontProps = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle",
    "letterSpacing", "lineHeight", "color", "textTransform",
    "whiteSpace", "textAlign", "wordSpacing"
  ];

  function buildReflections() {
    document.querySelectorAll(".reflection").forEach((n) => n.remove());

    REFLECTIONS.forEach(({ sel, level }) => {
      const factor = level === "strong" ? 0.82 : level === "key" ? 0.55 : 0.4;

      document.querySelectorAll(sel).forEach((el) => {
        if (el.closest(".plate")) return;
        if (el.closest(".facts__item--react")) return;
        if (!el.offsetWidth || !el.offsetHeight) return;

        const cs = getComputedStyle(el);
        const clone = el.cloneNode(true);

        clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
        clone.removeAttribute("id");
        clone.classList.add("reflection", "reflection--" + level);
        clone.setAttribute("aria-hidden", "true");

        reflectFontProps.forEach((prop) => {
          clone.style[prop] = cs[prop];
        });

        clone.style.textShadow = "none";
        clone.style.position = "absolute";
        clone.style.margin = "0";
        clone.style.padding = "0";
        clone.style.border = "0";
        clone.style.background = "transparent";
        clone.style.boxShadow = "none";
        clone.style.zIndex = "0";
        clone.style.pointerEvents = "none";
        clone.style.userSelect = "none";
        clone.style.transformOrigin = "top left";
        clone.style.width = el.offsetWidth + "px";

        let sx = 1;
        try {
          const m = new DOMMatrixReadOnly(cs.transform);
          if (Math.abs(m.a) > 0.0001) sx = Math.abs(m.a);
        } catch (_) {}
        clone.style.setProperty("--reflect-x", String(sx));

        document.body.appendChild(clone);

        const box = el.getBoundingClientRect();
        const h = clone.offsetHeight;

        clone.style.left = box.left + window.scrollX + "px";
        clone.style.top = box.bottom + window.scrollY + h * factor + "px";
      });
    });
  }

  let reflectTimer = 0;
  function scheduleReflections(delay) {
    clearTimeout(reflectTimer);
    reflectTimer = setTimeout(buildReflections, delay);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => scheduleReflections(1500));
  } else {
    scheduleReflections(1500);
  }
  window.addEventListener("load", () => scheduleReflections(1500));
  window.addEventListener("resize", () => scheduleReflections(500));

  /* ── вкладка и размеры ───────────────────────────────── */

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (state.motion) start();
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 160);
  });

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });
    ro.observe(plateWindow);
  }

  /* ── старт ───────────────────────────────────────────── */

  resize();
  applyTheme(pickTheme(requestedMinutes()));
  setupThemeLab();
  setInterval(() => {
    if (THEME_CONFIG.time || THEME_CONFIG.force) return;
    const next = pickTheme(kyivMinutes());
    if (!state.theme || state.theme.key !== next.key) applyTheme(next);
    else if (themeLab) updateThemeLab();
  }, 30000);
  if (state.motion) start();
  else drawStatic();
})();
