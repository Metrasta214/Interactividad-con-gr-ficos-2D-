document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // HELPERS
  // =========================================================
  const $ = (id) => document.getElementById(id);
  const must = (el, name) => {
    if (!el) console.error(`❌ No encontré el elemento: ${name}`);
    return el;
  };

  // =========================================================
  // CANVAS
  // =========================================================
  const canvas = must($("gameCanvas"), "canvas#gameCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("❌ No se pudo obtener el contexto 2D del canvas.");
    return;
  }

  // =========================================================
  // HUD
  // =========================================================
  const levelText = must($("levelText"), "#levelText");
  const aliveText = must($("aliveText"), "#aliveText");

  // ✅ Eliminados = SOLO por click
  const removedText = must($("removedText"), "#removedText");
  const percentRemovedText = must($("percentRemovedText"), "#percentRemovedText");

  const levelProgressText = must($("levelProgressText"), "#levelProgressText");
  const targetText = must($("targetText"), "#targetText");

  // ✅ Escaparon = SOLO por arriba
  const escapedText = must($("escapedText"), "#escapedText");
  const percentEscapedText = must($("percentEscapedText"), "#percentEscapedText");

  const statusText = must($("statusText"), "#statusText");

  // =========================================================
  // CONTROLS
  // =========================================================
  const groupSlider = must($("groupSlider"), "#groupSlider");
  const groupValue = must($("groupValue"), "#groupValue");
  const resetBtn = must($("resetBtn"), "#resetBtn");
  const circleBtns = Array.from(document.querySelectorAll(".circle-btn"));

  // =========================================================
  // GAME OVER OVERLAY (debe existir en index.html)
  // =========================================================
  const gameOver = $("gameOver");
  const gameOverMsg = $("gameOverMsg");
  const finalLevelEl = $("finalLevel");
  const finalClickedEl = $("finalClicked");
  const finalEscapedEl = $("finalEscaped");
  const btnResetOverlay = $("btnReset");
  const unlockHint = $("unlockHint");
  const overlayBtns = Array.from(document.querySelectorAll(".overlay-btn"));

  // =========================================================
  // MOUSE
  // =========================================================
  const mouse = { x: -9999, y: -9999 };

  // =========================================================
  // CONFIG
  // =========================================================
  const MAX_LEVELS = 10;        // ✅ fin del juego al completar 10 niveles
  const FADE_SPEED = 0.028;     // velocidad de desaparición por click

  // Movimiento base
  const BASE_UP_MIN = 0.70;
  const BASE_UP_MAX = 1.20;
  const BASE_SIDE_MIN = 0.30;
  const BASE_SIDE_MAX = 1.10;

  // Colisiones entre círculos
  const RESTITUTION = 0.98;
  const SEPARATION_SLOP = 0.01;

  // Rebotes con paredes/suelo
  const WALL_RESTITUTION = 0.98;

  // =========================================================
  // STATE
  // =========================================================
  let circles = [];

  let level = 1;
  let groupSize = groupSlider ? Number(groupSlider.value) : 10;

  // Total objetivo (100/150/200)
  let targetTotal = 100;
  let totalSpawned = 0;

  // Contadores separados
  let clickedRemoved = 0;   // ✅ solo click
  let escapedRemoved = 0;   // ✅ solo arriba (escape)
  let removedThisLevel = 0; // progreso del nivel (click + escape)

  let running = true;

  // =========================================================
  // UTILS
  // =========================================================
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

  // =========================================================
  // CIRCLE CLASS
  // =========================================================
  class Circle {
    constructor() {
      this.r = rand(16, 30);
      this.x = rand(this.r + 4, canvas.width - this.r - 4);

      // ✅ Nace estrictamente fuera por abajo
      this.y = canvas.height + this.r + rand(20, 160);

      this.vx = rand(BASE_SIDE_MIN, BASE_SIDE_MAX) * (Math.random() < 0.5 ? -1 : 1);
      this.vy = -rand(BASE_UP_MIN, BASE_UP_MAX); // hacia arriba

      this.alpha = 1;
      this.isFading = false;
      this.isHovered = false;

      // colores
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
      // Hover SOLO cambia color
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

      // ✅ Rebote inferior (no se elimina por abajo)
      if (this.y + this.r >= canvas.height) {
        this.y = canvas.height - this.r;
        this.vy *= -WALL_RESTITUTION;
        if (this.vy > 0) this.vy *= -1; // asegura que vaya hacia arriba tras rebotar
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

    // ✅ solo desaparecen por arriba si escaparon
    isOutTop() {
      return (this.y + this.r) < 0;
    }

    isFaded() {
      return this.alpha <= 0;
    }
  }

  // =========================================================
  // SPAWN
  // =========================================================
  function spawnBatch() {
    if (totalSpawned >= targetTotal) return;

    const remaining = targetTotal - totalSpawned;
    const toSpawn = Math.min(groupSize, remaining);

    for (let i = 0; i < toSpawn; i++) {
      circles.push(new Circle());
      totalSpawned++;
    }
  }

  // =========================================================
  // HUD UPDATE
  // =========================================================
  function updateHUD() {
    if (levelText) levelText.textContent = String(level);
    if (aliveText) aliveText.textContent = String(circles.length);

    // ✅ Eliminados SOLO click
    if (removedText) removedText.textContent = String(clickedRemoved);
    const removedPct = targetTotal ? (clickedRemoved / targetTotal) * 100 : 0;
    if (percentRemovedText) percentRemovedText.textContent = `${removedPct.toFixed(1)}%`;

    if (levelProgressText) levelProgressText.textContent = `${removedThisLevel}/${groupSize}`;
    if (targetText) targetText.textContent = String(targetTotal);

    // ✅ Escaparon SOLO arriba
    if (escapedText) escapedText.textContent = String(escapedRemoved);
    const escapedPct = targetTotal ? (escapedRemoved / targetTotal) * 100 : 0;
    if (percentEscapedText) percentEscapedText.textContent = `${escapedPct.toFixed(1)}%`;
  }

  // =========================================================
  // GAME OVER
  // =========================================================
  function endGameSession() {
    running = false;

    // Estadísticas finales
    if (gameOverMsg) {
      gameOverMsg.textContent =
        "Terminaste los 10 niveles. Puedes resetear o iniciar otra sesión con grupos desbloqueados según tu nivel.";
    }
    if (finalLevelEl) finalLevelEl.textContent = String(level);
    if (finalClickedEl) finalClickedEl.textContent = String(clickedRemoved);
    if (finalEscapedEl) finalEscapedEl.textContent = String(escapedRemoved);

    // Desbloqueo por nivel alcanzado:
    // - Siempre 10
    // - 15 si llegaste >= 5
    // - 20 si llegaste >= 10
    const unlock15 = level >= 5;
    const unlock20 = level >= 10;

    overlayBtns.forEach((btn) => {
      const g = Number(btn.dataset.g);
      if (g === 10) btn.disabled = false;
      if (g === 15) btn.disabled = !unlock15;
      if (g === 20) btn.disabled = !unlock20;
    });

    if (unlockHint) {
      if (!unlock15) unlockHint.textContent = "Desbloquea grupo 15 llegando al nivel 5.";
      else if (!unlock20) unlockHint.textContent = "Desbloquea grupo 20 llegando al nivel 10.";
      else unlockHint.textContent = "¡Desbloqueaste todos los grupos!";
    }

    if (gameOver) gameOver.classList.remove("hidden");
    setStatus("Sesión finalizada.");
  }

  function startNewSessionWithGroup(g) {
    // Ajusta slider
    if (groupSlider) groupSlider.value = String(g);
    groupSize = g;
    if (groupValue) groupValue.textContent = String(g);

    // Oculta overlay
    if (gameOver) gameOver.classList.add("hidden");

    // Reinicia estado de sesión completa
    resetGame(true);

    running = true;
    requestAnimationFrame(loop);
  }

  // =========================================================
  // NEXT LEVEL LOGIC
  // =========================================================
  function nextLevelIfNeeded() {
    if (removedThisLevel >= groupSize) {
      // ✅ Si ya completó el último nivel -> Game Over
      if (level >= MAX_LEVELS) {
        endGameSession();
        return;
      }

      level++;
      removedThisLevel = 0;
      spawnBatch();
      setStatus(`Nivel ${level}/${MAX_LEVELS} • velocidad x${speedScaleByLevel().toFixed(2)} • colisiones ON`);
    }
  }

  // =========================================================
  // RESET
  // fullReset=true reinicia targetTotal? NO, conserva targetTotal elegido
  // =========================================================
  function resetGame(fromOverlay = false) {
    circles = [];

    level = 1;
    removedThisLevel = 0;

    totalSpawned = 0;
    clickedRemoved = 0;
    escapedRemoved = 0;

    // groupSize toma el valor actual del slider
    groupSize = groupSlider ? Number(groupSlider.value) : groupSize;

    // Oculta overlay si se resetea
    if (fromOverlay && gameOver) gameOver.classList.add("hidden");

    spawnBatch();
    updateHUD();
    setStatus("Reiniciado. ¡A jugar!");
  }

  // =========================================================
  // COLLISIONS CIRCLE-CIRCLE
  // =========================================================
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

        // Si se separan, no empujar
        if (velAlongNormal > 0) continue;

        const jImpulse = -(1 + RESTITUTION) * velAlongNormal / 2;
        const ix = jImpulse * nx;
        const iy = jImpulse * ny;

        a.vx -= ix;
        a.vy -= iy;
        b.vx += ix;
        b.vy += iy;

        // Suelo ya rebota, pero limitamos bajada extrema
        if (a.vy > 2.2) a.vy = 2.2;
        if (b.vy > 2.2) b.vy = 2.2;
      }
    }
  }

  // =========================================================
  // EVENTS
  // =========================================================
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
    // Click: inicia fade en el círculo que esté bajo mouse
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

  // target total 100/150/200
  circleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      circleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      targetTotal = Number(btn.dataset.target);
      resetGame();
      running = true;
      requestAnimationFrame(loop);
      setStatus(`Objetivo total: ${targetTotal} • colisiones ON`);
    });
  });

  if (circleBtns[0]) circleBtns[0].classList.add("active");

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetGame();
      running = true;
      requestAnimationFrame(loop);
    });
  }

  // Overlay buttons
  if (btnResetOverlay) {
    btnResetOverlay.addEventListener("click", () => {
      if (gameOver) gameOver.classList.add("hidden");
      resetGame(true);
      running = true;
      requestAnimationFrame(loop);
    });
  }

  overlayBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const g = Number(btn.dataset.g);
      startNewSessionWithGroup(g);
    });
  });

  // =========================================================
  // LOOP
  // =========================================================
  function loop() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const speedScale = speedScaleByLevel();

    // 1) Update
    for (const c of circles) c.update(speedScale);

    // 2) Collisions
    resolveCollisions();

    // 3) Draw
    for (const c of circles) c.draw();

    // 4) Removals
    circles = circles.filter((c) => {
      if (c.isFaded()) {
        clickedRemoved++;    // ✅ solo click
        removedThisLevel++;  // progreso de nivel
        return false;
      }
      if (c.isOutTop()) {
        escapedRemoved++;    // ✅ solo escape
        removedThisLevel++;  // progreso de nivel
        return false;
      }
      return true;
    });

    // Subir nivel / terminar en 10
    nextLevelIfNeeded();

    updateHUD();

    // Si terminó, no seguir
    if (!running) return;

    requestAnimationFrame(loop);
  }

  // =========================================================
  // START
  // =========================================================
  if (groupValue) groupValue.textContent = String(groupSize);
  spawnBatch();
  updateHUD();
  setStatus(`Listo. Niveles: 1/${MAX_LEVELS}. Colisiones ON.`);
  requestAnimationFrame(loop);
});
