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
  if (!ctx) return;

  // =========================================================
  // HUD
  // =========================================================
  const levelText = must($("levelText"), "#levelText");
  const aliveText = must($("aliveText"), "#aliveText");

  const removedText = must($("removedText"), "#removedText"); // SOLO click
  const percentRemovedText = must($("percentRemovedText"), "#percentRemovedText");

  const levelProgressText = must($("levelProgressText"), "#levelProgressText");
  const targetText = must($("targetText"), "#targetText");

  const escapedText = must($("escapedText"), "#escapedText");
  const percentEscapedText = must($("percentEscapedText"), "#percentEscapedText");

  const statusText = must($("statusText"), "#statusText");
  const hudPanel = document.querySelector(".hud");

  // =========================================================
  // CONTROLS
  // =========================================================
  const groupSlider = must($("groupSlider"), "#groupSlider");
  const groupValue = must($("groupValue"), "#groupValue");
  const resetBtn = must($("resetBtn"), "#resetBtn");
  const circleBtns = Array.from(document.querySelectorAll(".circle-btn"));
  const audioBtn = $("audioBtn"); // opcional

  // =========================================================
  // GAME OVER OVERLAY
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
  // MOUSE + CROSSHAIR
  // =========================================================
  const mouse = { x: -9999, y: -9999 };
  let mouseInside = false;

  // =========================================================
  // CONFIG
  // =========================================================
  const MAX_LEVELS = 10;
  const FADE_SPEED = 0.028;

  const BASE_UP_MIN = 0.70;
  const BASE_UP_MAX = 1.20;
  const BASE_SIDE_MIN = 0.30;
  const BASE_SIDE_MAX = 1.10;

  const RESTITUTION = 0.98;
  const SEPARATION_SLOP = 0.01;

  const WALL_RESTITUTION = 0.98;

  // Animaciones
  const PARTICLE_COUNT = 18;
  const SHAKE_STRENGTH = 7;
  const SHAKE_DECAY = 0.86;

  // =========================================================
  // AUDIO (Web Audio API)
  // =========================================================
  let audioCtx = null;
  let musicOn = false;
  let musicTimer = null;

  const BPM = 120;
  const STEP_MS = (60_000 / BPM) / 2;
  const melody = [0, 0, 7, 7, 9, 9, 7, null, 5, 5, 4, 4, 2, 2, 0, null];
  const bass   = [-12, null, -12, null, -17, null, -17, null, -19, null, -19, null, -24, null, -24, null];

  function semitoneToFreq(semi, base = 440) {
    return base * Math.pow(2, semi / 12);
  }

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playBeep({ freq, dur = 0.08, type = "square", gain = 0.05, detune = 0 }) {
    ensureAudio();
    const t = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.setValueAtTime(detune, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function playExplosionSFX() {
    ensureAudio();
    const t = audioCtx.currentTime;

    const bufferSize = audioCtx.sampleRate * 0.12;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    const boom = audioCtx.createOscillator();
    boom.type = "square";
    boom.frequency.setValueAtTime(160, t);
    boom.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    const boomGain = audioCtx.createGain();
    boomGain.gain.setValueAtTime(0.0001, t);
    boomGain.gain.exponentialRampToValueAtTime(0.10, t + 0.008);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

    noise.connect(noiseGain).connect(audioCtx.destination);
    boom.connect(boomGain).connect(audioCtx.destination);

    noise.start(t);
    noise.stop(t + 0.14);
    boom.start(t);
    boom.stop(t + 0.14);

    playBeep({ freq: 880, dur: 0.05, type: "square", gain: 0.04, detune: -18 });
    playBeep({ freq: 660, dur: 0.06, type: "square", gain: 0.03, detune: +12 });
  }

  function startMusic() {
    ensureAudio();
    if (musicOn) return;

    musicOn = true;
    let step = 0;

    musicTimer = setInterval(() => {
      if (!musicOn) return;

      const m = melody[step % melody.length];
      const b = bass[step % bass.length];

      if (m !== null) playBeep({ freq: semitoneToFreq(m, 440), dur: 0.09, type: "square", gain: 0.035 });
      if (b !== null) playBeep({ freq: semitoneToFreq(b, 440), dur: 0.11, type: "square", gain: 0.03, detune: -8 });

      step++;
    }, STEP_MS);

    if (audioBtn) audioBtn.textContent = "SOUND: ON";
    setStatus("Audio ON (chiptune).");
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    if (audioBtn) audioBtn.textContent = "SOUND: OFF";
    setStatus("Audio OFF.");
  }

  function toggleMusic() {
    if (!audioCtx) ensureAudio();
    if (!musicOn) startMusic();
    else stopMusic();
  }

  // =========================================================
  // STATE
  // =========================================================
  let circles = [];
  let particles = [];
  let level = 1;
  let groupSize = groupSlider ? Number(groupSlider.value) : 10;

  let targetTotal = 100;
  let totalSpawned = 0;

  let clickedRemoved = 0;
  let escapedRemoved = 0;
  let removedThisLevel = 0;

  let running = true;
  let shake = 0;

  // =========================================================
  // UTILS
  // =========================================================
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function setStatus(msg) {
    if (statusText) statusText.textContent = msg;
  }

  function speedScaleByLevel() {
    const scale = Math.pow(1.22, (level - 1));
    return Math.min(scale, 6.0);
  }

  function pulseHUD() {
    if (!hudPanel) return;
    hudPanel.classList.remove("hud-pulse");
    void hudPanel.offsetWidth;
    hudPanel.classList.add("hud-pulse");
  }

  // =========================================================
  // CROSSHAIR DRAW
  // =========================================================
  function drawCrosshair() {
    if (!mouseInside) return;

    const x = mouse.x;
    const y = mouse.y;

    // Evita dibujar fuera (por si acaso)
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;

    ctx.save();

    // brillo retro
    ctx.globalAlpha = 0.95;

    // círculos y líneas
    const r1 = 10;
    const r2 = 18;
    const gap = 6;

    // anillo externo
    ctx.beginPath();
    ctx.arc(x, y, r2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(64,247,255,0.75)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // anillo interno
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,75,210,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // cruz (arriba/abajo/izq/der) con hueco central
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;

    // arriba
    ctx.beginPath();
    ctx.moveTo(x, y - r2 - 8);
    ctx.lineTo(x, y - gap);
    ctx.stroke();

    // abajo
    ctx.beginPath();
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + r2 + 8);
    ctx.stroke();

    // izquierda
    ctx.beginPath();
    ctx.moveTo(x - r2 - 8, y);
    ctx.lineTo(x - gap, y);
    ctx.stroke();

    // derecha
    ctx.beginPath();
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + r2 + 8, y);
    ctx.stroke();

    // punto central
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,228,92,0.9)";
    ctx.fill();

    ctx.restore();
  }

  // =========================================================
  // PARTICLES
  // =========================================================
  function spawnExplosion(x, y) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(1.8, 5.2);
      particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: rand(18, 32),
        maxLife: 32,
        r: rand(1.5, 3.4)
      });
    }
    shake = Math.min(shake + SHAKE_STRENGTH, 18);
  }

  function updateParticles() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.life -= 1;
    }
    particles = particles.filter(p => p.life > 0);
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fill();
      ctx.restore();
    }
  }

  // =========================================================
  // CIRCLE CLASS
  // =========================================================
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

      this.spawnScale = 0.15;

      this.baseColor = "rgba(64, 247, 255, 1)";
      this.hoverColor = "rgba(255, 75, 210, 1)";
      this.fadeColor  = "rgba(255, 228, 92, 1)";
    }

    containsPoint(px, py) {
      const dx = px - this.x;
      const dy = py - this.y;
      return (dx * dx + dy * dy) <= this.r * this.r;
    }

    startFade() { this.isFading = true; }

    update(speedScale) {
      this.isHovered = this.containsPoint(mouse.x, mouse.y);

      this.x += this.vx * speedScale;
      this.y += this.vy * speedScale;

      if (this.x - this.r <= 0) {
        this.x = this.r;
        this.vx *= -WALL_RESTITUTION;
      } else if (this.x + this.r >= canvas.width) {
        this.x = canvas.width - this.r;
        this.vx *= -WALL_RESTITUTION;
      }

      if (this.y + this.r >= canvas.height) {
        this.y = canvas.height - this.r;
        this.vy *= -WALL_RESTITUTION;
        if (this.vy > 0) this.vy *= -1;
      }

      if (this.isFading) {
        this.alpha -= FADE_SPEED;
        this.alpha = clamp(this.alpha, 0, 1);
      }

      this.spawnScale = Math.min(1, this.spawnScale + 0.06);
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;

      const rr = this.r * this.spawnScale;

      ctx.beginPath();
      ctx.arc(this.x, this.y, rr, 0, Math.PI * 2);

      if (this.isFading) ctx.fillStyle = this.fadeColor;
      else if (this.isHovered) ctx.fillStyle = this.hoverColor;
      else ctx.fillStyle = this.baseColor;

      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.stroke();

      ctx.restore();
    }

    isOutTop() { return (this.y + this.r) < 0; }
    isFaded() { return this.alpha <= 0; }
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
  // HUD
  // =========================================================
  function updateHUD() {
    if (levelText) levelText.textContent = String(level);
    if (aliveText) aliveText.textContent = String(circles.length);

    if (removedText) removedText.textContent = String(clickedRemoved);
    const removedPct = targetTotal ? (clickedRemoved / targetTotal) * 100 : 0;
    if (percentRemovedText) percentRemovedText.textContent = `${removedPct.toFixed(1)}%`;

    if (levelProgressText) levelProgressText.textContent = `${removedThisLevel}/${groupSize}`;
    if (targetText) targetText.textContent = String(targetTotal);

    if (escapedText) escapedText.textContent = String(escapedRemoved);
    const escapedPct = targetTotal ? (escapedRemoved / targetTotal) * 100 : 0;
    if (percentEscapedText) percentEscapedText.textContent = `${escapedPct.toFixed(1)}%`;
  }

  // =========================================================
  // GAME OVER
  // =========================================================
  function endGameSession() {
    running = false;

    if (gameOverMsg) {
      gameOverMsg.textContent =
        "Terminaste los 10 niveles. Puedes resetear o iniciar otra sesión con grupos desbloqueados.";
    }
    if (finalLevelEl) finalLevelEl.textContent = String(level);
    if (finalClickedEl) finalClickedEl.textContent = String(clickedRemoved);
    if (finalEscapedEl) finalEscapedEl.textContent = String(escapedRemoved);

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
    if (groupSlider) groupSlider.value = String(g);
    groupSize = g;
    if (groupValue) groupValue.textContent = String(g);

    if (gameOver) gameOver.classList.add("hidden");

    resetGame(true);
    running = true;
    requestAnimationFrame(loop);
  }

  function nextLevelIfNeeded() {
    if (removedThisLevel >= groupSize) {
      if (level >= MAX_LEVELS) {
        endGameSession();
        return;
      }
      level++;
      removedThisLevel = 0;
      spawnBatch();
      setStatus(`Nivel ${level}/${MAX_LEVELS} • velocidad x${speedScaleByLevel().toFixed(2)}`);
    }
  }

  function resetGame(fromOverlay = false) {
    circles = [];
    particles = [];

    level = 1;
    removedThisLevel = 0;

    totalSpawned = 0;
    clickedRemoved = 0;
    escapedRemoved = 0;

    groupSize = groupSlider ? Number(groupSlider.value) : groupSize;

    if (fromOverlay && gameOver) gameOver.classList.add("hidden");

    spawnBatch();
    updateHUD();
    setStatus("Reiniciado. ¡A jugar!");
  }

  // =========================================================
  // COLLISIONS
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

        const overlap = rSum - dist;
        const sep = overlap / 2 + SEPARATION_SLOP;
        a.x -= nx * sep;
        a.y -= ny * sep;
        b.x += nx * sep;
        b.y += ny * sep;

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
    mouseInside = true;
  });

  canvas.addEventListener("mouseleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
    mouseInside = false;
  });

  // permitir inicializar audio con gesto
  canvas.addEventListener("pointerdown", () => {
    if (!audioCtx) ensureAudio();
  }, { once: true });

  canvas.addEventListener("click", () => {
    for (let i = circles.length - 1; i >= 0; i--) {
      const c = circles[i];
      if (c.containsPoint(mouse.x, mouse.y)) {
        c.startFade();
        playExplosionSFX();
        spawnExplosion(c.x, c.y);
        pulseHUD();
        break;
      }
    }
  });

  if (audioBtn) audioBtn.addEventListener("click", toggleMusic);

  if (groupSlider) {
    groupSlider.addEventListener("input", () => {
      groupSize = Number(groupSlider.value);
      if (groupValue) groupValue.textContent = String(groupSize);
      updateHUD();
      setStatus(`Grupo por nivel: ${groupSize}`);
    });
  }

  circleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      circleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      targetTotal = Number(btn.dataset.target);
      resetGame();
      running = true;
      requestAnimationFrame(loop);
      setStatus(`Objetivo total: ${targetTotal}`);
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

    // screen shake
    let sx = 0, sy = 0;
    if (shake > 0.2) {
      sx = (Math.random() * 2 - 1) * shake;
      sy = (Math.random() * 2 - 1) * shake;
      shake *= SHAKE_DECAY;
    } else {
      shake = 0;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(sx, sy);

    const speedScale = speedScaleByLevel();

    // update circles
    for (const c of circles) c.update(speedScale);

    // collisions
    resolveCollisions();

    // update particles
    updateParticles();

    // draw
    drawParticles();
    for (const c of circles) c.draw();
    drawParticles();

    // removals
    circles = circles.filter((c) => {
      if (c.isFaded()) {
        clickedRemoved++;
        removedThisLevel++;
        return false;
      }
      if (c.isOutTop()) {
        escapedRemoved++;
        removedThisLevel++;
        return false;
      }
      return true;
    });

    // crosshair on top
    drawCrosshair();

    ctx.restore();

    nextLevelIfNeeded();
    updateHUD();

    if (!running) return;
    requestAnimationFrame(loop);
  }

  // =========================================================
  // START
  // =========================================================
  if (groupValue) groupValue.textContent = String(groupSize);
  spawnBatch();
  updateHUD();
  setStatus(`Listo. Niveles: 1/${MAX_LEVELS}. Tip: SOUND para música 8-bit. Mira = cursor.`);
  requestAnimationFrame(loop);
});
