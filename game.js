document.addEventListener("DOMContentLoaded", () => {
  // Helpers
  const $ = (id) => document.getElementById(id);
  const must = (el, name) => {
    if (!el) console.error(`❌ No encontré el elemento: ${name}`);
    return el;
  };

  // Canvas
  const canvas = must($("gameCanvas"), "canvas#gameCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // HUD
  const levelText = must($("levelText"), "#levelText");
  const aliveText = must($("aliveText"), "#aliveText");
  const removedText = must($("removedText"), "#removedText");
  const percentRemovedText = must($("percentRemovedText"), "#percentRemovedText");
  const levelProgressText = must($("levelProgressText"), "#levelProgressText");
  const targetText = must($("targetText"), "#targetText");
  const escapedText = must($("escapedText"), "#escapedText");
  const percentEscapedText = must($("percentEscapedText"), "#percentEscapedText");
  const statusText = must($("statusText"), "#statusText");

  // Controls
  const groupSlider = must($("groupSlider"), "#groupSlider");
  const groupValue = must($("groupValue"), "#groupValue");
  const resetBtn = must($("resetBtn"), "#resetBtn");
  const circleBtns = Array.from(document.querySelectorAll(".circle-btn"));

  // Mouse
  const mouse = { x: -9999, y: -9999 };

  // Config base
  const BASE_UP_MIN = 0.70;
  const BASE_UP_MAX = 1.20;
  const BASE_SIDE_MIN = 0.30;
  const BASE_SIDE_MAX = 1.10;

  // Fade out
  const FADE_SPEED = 0.028;

  // Física colisiones
  const RESTITUTION = 0.98; // 1.0 rebote perfecto, <1 pierde un poquito
  const SEPARATION_SLOP = 0.01; // evita vibración numérica

  // Estado
  let circles = [];
  let level = 1;
  let groupSize = groupSlider ? Number(groupSlider.value) : 10;

  let targetTotal = 100;
  let totalSpawned = 0;

  let removedTotal = 0;
  let removedThisLevel = 0;

  let escapedRemoved = 0;
  let running = true;

  // Utils
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function setStatus(msg) {
    if (statusText) statusText.textContent = msg;
  }

  // Velocidad por nivel (más rápido cada nivel)
  function speedScaleByLevel() {
    const scale = Math.pow(1.22, (level - 1));
    return Math.min(scale, 6.0);
  }

  class Circle {
    constructor() {
      this.r = rand(16, 30);
      this.x = rand(this.r + 4, canvas.width - this.r - 4);
      this.y = canvas.height + this.r + rand(20, 160);

      this.vx = rand(BASE_SIDE_MIN, BASE_SIDE_MAX) * (Math.random() < 0.5 ? -1 : 1);
      this.vy = -rand(BASE_UP_MIN, BASE_UP_MAX);

      this.alpha = 1;
      this.isFading = false;
      this.isHovered = false;

      this.baseColor = "rgba(64, 247, 255, 1)";
      this.hoverColor = "rgba(255, 75, 210, 1)";
      this.fadeColor  = "rgba(255, 228, 92, 1)";
    }

    containsPoint(px, py) {
      const dx = px - this.x;
      const dy = py - this.y;
      return (dx * dx + dy * dy) <= this.r * this.r;
    }

    startFade() {
      this.isFading = true;
    }

    update(speedScale) {
      // Hover SOLO color
      this.isHovered = this.containsPoint(mouse.x, mouse.y);

      // Movimiento (no multiplicamos por speedScale a la velocidad en sí,
      // sino al desplazamiento para conservar el "look" original)
      this.x += this.vx * speedScale;
      this.y += this.vy * speedScale;

      // Rebote lateral estricto
      if (this.x - this.r <= 0) {
        this.x = this.r;
        this.vx *= -1;
      } else if (this.x + this.r >= canvas.width) {
        this.x = canvas.width - this.r;
        this.vx *= -1;
      }

      // Fade por clic
      if (this.isFading) {
        this.alpha -= FADE_SPEED;
        this.alpha = clamp(this.alpha, 0, 1);
      }
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);

      if (this.isFading) ctx.fillStyle = this.fadeColor;
      else if (this.isHovered) ctx.fillStyle = this.hoverColor;
      else ctx.fillStyle = this.baseColor;

      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.stroke();

      ctx.restore();
    }

    isOutTop() {
      return (this.y + this.r) < 0;
    }

    isFaded() {
      return this.alpha <= 0;
    }
  }

  function spawnBatch() {
    if (totalSpawned >= targetTotal) return;

    const remaining = targetTotal - totalSpawned;
    const toSpawn = Math.min(groupSize, remaining);

    for (let i = 0; i < toSpawn; i++) {
      circles.push(new Circle());
      totalSpawned++;
    }
  }

  function updateHUD() {
    if (levelText) levelText.textContent = String(level);
    if (aliveText) aliveText.textContent = String(circles.length);
    if (removedText) removedText.textContent = String(removedTotal);

    const removedPct = targetTotal ? (removedTotal / targetTotal) * 100 : 0;
    if (percentRemovedText) percentRemovedText.textContent = `${removedPct.toFixed(1)}%`;

    if (levelProgressText) levelProgressText.textContent = `${removedThisLevel}/${groupSize}`;
    if (targetText) targetText.textContent = String(targetTotal);

    if (escapedText) escapedText.textContent = String(escapedRemoved);
    const escapedPct = targetTotal ? (escapedRemoved / targetTotal) * 100 : 0;
    if (percentEscapedText) percentEscapedText.textContent = `${escapedPct.toFixed(1)}%`;
  }

  function nextLevelIfNeeded() {
    if (removedThisLevel >= groupSize) {
      level++;
      removedThisLevel = 0;
      spawnBatch();
      setStatus(`Nivel ${level} • velocidad x${speedScaleByLevel().toFixed(2)} • colisiones ON`);
    }
  }

  function resetGame() {
    circles = [];
    level = 1;
    groupSize = groupSlider ? Number(groupSlider.value) : groupSize;

    totalSpawned = 0;
    removedTotal = 0;
    removedThisLevel = 0;
    escapedRemoved = 0;

    running = true;

    spawnBatch();
    updateHUD();
    setStatus("Reiniciado (colisiones ON).");
  }

  /* =========================================================
     COLISIONES CÍRCULO-CÍRCULO (rebote elástico + separación)
     - Se ignoran los que están en fade (para evitar “pegote”)
     ========================================================= */
  function resolveCollisions() {
    for (let i = 0; i < circles.length; i++) {
      const a = circles[i];
      if (a.isFading) continue;

      for (let j = i + 1; j < circles.length; j++) {
        const b = circles[j];
        if (b.isFading) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rSum = a.r + b.r;

        const dist2 = dx * dx + dy * dy;
        if (dist2 >= rSum * rSum) continue;

        // Si están exactamente encima, evita división entre 0
        const dist = Math.sqrt(dist2) || 0.0001;

        // Normal unitario
        const nx = dx / dist;
        const ny = dy / dist;

        // 1) Separar para que no se encimen (penetration resolution)
        const overlap = rSum - dist;
        const sep = (overlap / 2) + SEPARATION_SLOP;

        a.x -= nx * sep;
        a.y -= ny * sep;
        b.x += nx * sep;
        b.y += ny * sep;

        // 2) Rebote elástico (masas iguales)
        // velocidad relativa sobre la normal
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        // Si ya se están separando, no aplicar impulso
        if (velAlongNormal > 0) continue;

        // Impulso para masas iguales m=1
        const jImpulse = -(1 + RESTITUTION) * velAlongNormal / 2;

        const ix = jImpulse * nx;
        const iy = jImpulse * ny;

        a.vx -= ix;
        a.vy -= iy;
        b.vx += ix;
        b.vy += iy;

        // 3) Asegurar que sigan subiendo (vy debe permanecer hacia arriba)
        // (si por choque se vuelve positiva, la “re-corrigimos” un poco)
        if (a.vy > 0) a.vy *= -0.8;
        if (b.vy > 0) b.vy *= -0.8;
      }
    }
  }

  // Events
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
  });

  canvas.addEventListener("mouseleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  canvas.addEventListener("click", () => {
    for (let i = circles.length - 1; i >= 0; i--) {
      if (circles[i].containsPoint(mouse.x, mouse.y)) {
        circles[i].startFade();
        break;
      }
    }
  });

  if (groupSlider) {
    groupSlider.addEventListener("input", () => {
      groupSize = Number(groupSlider.value);
      if (groupValue) groupValue.textContent = String(groupSize);
      updateHUD();
      setStatus(`Grupo por nivel: ${groupSize} • colisiones ON`);
    });
  }

  circleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      circleBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      targetTotal = Number(btn.dataset.target);
      resetGame();
      setStatus(`Objetivo total: ${targetTotal} • colisiones ON`);
    });
  });

  if (circleBtns[0]) circleBtns[0].classList.add("active");
  if (resetBtn) resetBtn.addEventListener("click", resetGame);

  // Loop
  function loop() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const speedScale = speedScaleByLevel();

    // 1) Actualizar posiciones
    for (const c of circles) c.update(speedScale);

    // 2) Resolver colisiones entre círculos (después del update)
    resolveCollisions();

    // 3) Dibujar
    for (const c of circles) c.draw();

    // 4) Eliminar (fade o escape por arriba)
    circles = circles.filter((c) => {
      if (c.isFaded()) {
        removedTotal++;
        removedThisLevel++;
        return false;
      }
      if (c.isOutTop()) {
        removedTotal++;
        removedThisLevel++;
        escapedRemoved++;
        return false;
      }
      return true;
    });

    nextLevelIfNeeded();

    // Fin
    if (totalSpawned >= targetTotal && circles.length === 0) {
      running = false;
      setStatus(`FIN • eliminados: ${removedTotal}/${targetTotal} • escaparon: ${escapedRemoved}`);
      updateHUD();
      return;
    }

    updateHUD();
    requestAnimationFrame(loop);
  }

  // Start
  if (groupValue) groupValue.textContent = String(groupSize);
  spawnBatch();
  updateHUD();
  setStatus("Listo. Colisiones ON.");
  requestAnimationFrame(loop);
});
