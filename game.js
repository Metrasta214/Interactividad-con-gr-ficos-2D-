document.addEventListener("DOMContentLoaded", () => {
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
  const removedText = must($("removedText"), "#removedText"); // <- SOLO click
  const percentRemovedText = must($("percentRemovedText"), "#percentRemovedText"); // <- SOLO click
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

  // Fade
  const FADE_SPEED = 0.028;

  // Colisiones
  const RESTITUTION = 0.98;
  const SEPARATION_SLOP = 0.01;

  // Rebotes en límites
  const WALL_RESTITUTION = 0.98;

  // Estado
  let circles = [];
  let level = 1;
  let groupSize = groupSlider ? Number(groupSlider.value) : 10;

  let targetTotal = 100;
  let totalSpawned = 0;

  // ✅ Contadores separados
  let clickedRemoved = 0;   // eliminados por click
  let escapedRemoved = 0;   // escaparon por arriba
  let removedThisLevel = 0; // progreso de nivel (click + escape)

  let running = true;

  // Utils
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function setStatus(msg) {
    if (statusText) statusText.textContent = msg;
  }

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
      this.vy = -rand(BASE_UP_MIN, BASE_UP_MAX); // hacia arriba

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

      // Movimiento
      this.x += this.vx * speedScale;
      this.y += this.vy * speedScale;

      // Rebote lateral estricto
      if (this.x - this.r <= 0) {
        this.x = this.r;
        this.vx *= -WALL_RESTITUTION;
      } else if (this.x + this.r >= canvas.width) {
        this.x = canvas.width - this.r;
        this.vx *= -WALL_RESTITUTION;
      }

      // ✅ Rebote inferior (SUELO) — NO desaparecer por abajo
      if (this.y + this.r >= canvas.height) {
        this.y = canvas.height - this.r;
        this.vy *= -WALL_RESTITUTION;

        // Asegura que tras rebotar no se quede “pegado” bajando
        if (this.vy > 0) this.vy *= -1;
      }

      // Fade por click
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
      // ✅ Solo desaparecen por arriba (escape)
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

    // ✅ Eliminados SOLO click
    if (removedText) removedText.textContent = String(clickedRemoved);
    const removedPct = targetTotal ? (clickedRemoved / targetTotal) * 100 : 0;
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
    clickedRemoved = 0;
    escapedRemoved = 0;
    removedThisLevel = 0;

    running = true;

    spawnBatch();
    updateHUD();
    setStatus("Reiniciado (colisiones ON).");
  }

  // =========================
  // COLISIONES CÍRCULO-CÍRCULO
  // =========================
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

        const dist = Math.sqrt(dist2) || 0.0001;
        const nx = dx / dist;
        const ny = dy / dist;

        // Separación
        const overlap = rSum - dist;
        const sep = (overlap / 2) + SEPARATION_SLOP;

        a.x -= nx * sep;
        a.y -= ny * sep;
        b.x += nx * sep;
        b.y += ny * sep;

        // Impulso elástico (masas iguales)
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal > 0) continue;

        const jImpulse = -(1 + RESTITUTION) * velAlongNormal / 2;
        const ix = jImpulse * nx;
        const iy = jImpulse * ny;

        a.vx -= ix;
        a.vy -= iy;
        b.vx += ix;
        b.vy += iy;

        // ✅ IMPORTANTE: si por choque quedan bajando, el suelo ya los rebota,
        // pero evitamos que se vayan demasiado hacia abajo:
        // (pequeña corrección para mantener tendencia hacia arriba)
        if (a.vy > 1.8) a.vy = 1.8;
        if (b.vy > 1.8) b.vy = 1.8;
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

    // Update
    for (const c of circles) c.update(speedScale);

    // Collisions
    resolveCollisions();

    // Draw
    for (const c of circles) c.draw();

    // Remove only by:
    // - click fade (counts as Eliminados)
    // - out top (counts as Escaparon)
    circles = circles.filter((c) => {
      if (c.isFaded()) {
        clickedRemoved++;      // ✅ solo click
        removedThisLevel++;    // progreso de nivel
        return false;
      }
      if (c.isOutTop()) {
        escapedRemoved++;      // ✅ solo escape
        removedThisLevel++;    // progreso de nivel
        return false;
      }
      return true;
    });

    nextLevelIfNeeded();

    // Fin cuando ya procesaste todos (click+escape) y no queda nada en pantalla
    const processedTotal = clickedRemoved + escapedRemoved;
    if (totalSpawned >= targetTotal && circles.length === 0 && processedTotal >= targetTotal) {
      running = false;
      setStatus(`FIN • click: ${clickedRemoved}/${targetTotal} • escaparon: ${escapedRemoved}`);
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
  setStatus("Listo. Colisiones ON. Eliminados = solo click. Escaparon = arriba.");
  requestAnimationFrame(loop);
});
