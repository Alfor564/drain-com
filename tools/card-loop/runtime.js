/* Рендер зацикленной карточки: волны в стекле + переключение аватарок.
   Работает на странице, где уже лежит разметка .plate (её берём из index.html). */
(function () {
  const c = document.getElementById("plate");
  const pctx = c.getContext("2d");
  const win = c.parentElement;
  const faces = Array.from(document.querySelectorAll(".face"));
  const nick = document.getElementById("faceNick");
  const INK = "238,240,255";

  const SOURCES = [
    { x: 0.24, y: 0.4, amp: 15, k: 0.021, speed: 0.5, decay: 0.0016, drift: 0.07, phase: 0.0 },
    { x: 0.76, y: 0.63, amp: 11, k: 0.027, speed: -0.38, decay: 0.0022, drift: 0.05, phase: 1.9 },
    { x: 0.55, y: 0.16, amp: 9, k: 0.035, speed: 0.66, decay: 0.0026, drift: 0.04, phase: 3.6 }
  ];

  const HOLD = 1.15;
  const FADE = 0.85;
  const FPS = 25;

  let W = 0, H = 0;
  const DPR = 2;

  function resize() {
    const r = win.getBoundingClientRect();
    W = r.width; H = r.height;
    c.width = Math.round(W * DPR);
    c.height = Math.round(H * DPR);
    drawPlate(6.4);
  }

  function drawPlate(t) {
    if (!W || !H) return;
    pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    pctx.clearRect(0, 0, W, H);

    const lines = Math.round(Math.min(58, Math.max(30, H / 9)));
    const step = Math.max(3, W / 64);
    const scale = H / 480;

    const sources = SOURCES.map((s) => ({
      sx: (s.x + Math.sin(t * s.drift + s.phase) * 0.025) * W,
      sy: (s.y + Math.cos(t * s.drift * 1.3 + s.phase) * 0.02) * H,
      amp: s.amp * scale,
      k: s.k * (W / 320),
      speed: s.speed,
      decay: s.decay,
      phase: s.phase
    }));

    for (let i = 0; i < lines; i++) {
      const v = lines > 1 ? i / (lines - 1) : 0;
      const baseY = H * (0.055 + v * 0.89);
      const focus = Math.exp(-Math.pow((v - 0.56) / 0.33, 2));
      const alpha = 0.22 + 0.5 * focus;
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
      pctx.strokeStyle = "rgba(" + INK + "," + (major ? Math.min(0.95, alpha * 1.3) : alpha) + ")";
      pctx.lineWidth = major ? 1.3 : 0.75;
      pctx.stroke();
    }

    const cx = W * 0.5, cy = H * 0.74;
    for (let k = 0; k < 3; k++) {
      const period = 9 + k * 3.5;
      const p = ((t * 0.55 + k * period * 0.33) % period) / period;
      const r = p * W * 1.15;
      if (r < 2) continue;
      pctx.beginPath();
      pctx.arc(cx, cy, r, 0, Math.PI * 2);
      pctx.strokeStyle = "rgba(" + INK + "," + (1 - p) * 0.2 + ")";
      pctx.lineWidth = 1;
      pctx.stroke();
    }
  }

  window.setState = function (u) {
    const n = faces.length;
    const f = Math.floor(u) % n;
    const r = u - Math.floor(u);
    const h = HOLD / (HOLD + FADE);
    const fd = FADE / (HOLD + FADE);
    let t = 0;
    if (r >= h) t = Math.min(1, (r - h) / fd);
    const e = t * t * (3 - 2 * t);
    const w = new Array(n).fill(0);
    w[f] = 1 - e;
    w[(f + 1) % n] = e;
    faces.forEach((el, i) => {
      const o = w[i];
      el.style.opacity = o.toFixed(4);
      el.style.transform = "scale(" + (0.94 + 0.06 * o).toFixed(4) + ")";
      el.classList.toggle("is-active", o === 1);
    });
    const mid = t >= 0.5 ? (f + 1) % n : f;
    if (nick) {
      nick.textContent = faces[mid].dataset.nick || "";
      const dip = Math.max(0, 1 - Math.abs(2 * t - 1) * 6);
      nick.style.opacity = (1 - 0.92 * dip).toFixed(3);
    }
  };

  window.render = function (frame, total) {
    const p = frame / total;
    window.setState(p * faces.length);
    drawPlate(6.4 + 1.7 * Math.sin(Math.PI * 2 * p));
  };

  window.loopFps = FPS;
  window.loopFrames = Math.round(faces.length * (HOLD + FADE) * FPS);

  const imgs = Array.from(document.querySelectorAll(".face__img"));
  let left = imgs.length;
  function oneDone() {
    left -= 1;
    if (left > 0) return;
    document.fonts.ready.then(function () {
      resize();
      window.setState(0);
      window.__ready = true;
    });
  }
  if (!imgs.length) oneDone();
  imgs.forEach(function (im) {
    if (im.complete && im.naturalWidth) oneDone();
    else { im.addEventListener("load", oneDone); im.addEventListener("error", oneDone); }
  });

  window.addEventListener("resize", resize);
})();
