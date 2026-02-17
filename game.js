/*************************************************************
 * Juego Canvas: Hover cambia color + Click fade out
 * - Circulos salen desde abajo (fuera del canvas)
 * - Se mueven de abajo hacia arriba lentamente
 * - Rebotan en laterales
 * - Se eliminan al pasar por arriba
 * - Niveles: grupos de 10 eliminados = sube nivel y velocidad
 *************************************************************/

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// HUD
const levelText = document.getElementById("levelText");
const removedText = document.getElementById("removedText");
const percentText = document.getElementById("percentText");
const levelProgressText = document.getElementById("levelProgressText");
const aliveText = document.getElementById("aliveText");

// Estado de mouse
const mouse = { x: -9999, y: -9999, down: false };

// Config juego
const LEVEL_SIZE = 10;

// Velocidades base (se escalan por nivel)
const BASE_SPEED_UP_MIN = 0.55;
const BASE_SPEED_UP_MAX = 1.05;
const BASE_SPEED_SIDE_MIN = 0.25;
const BASE_SPEED_SIDE_MAX = 0.95;

// Fade out (clic)
const FADE_SPEED = 0.02; // más alto = desaparece más rápido

// Estado del juego
let circles = [];
let level = 1;

let totalSpawned = 0;
let removedTotal = 0;

let removedThisLevel = 0;

// Util
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Clase Circulo
class Circle {
  constructor() {
    this.r = rand(16, 30);
    this.x = rand(this.r + 4, canvas.width - this.r - 4);

    // Nace estrictamente desde abajo, fuera del canvas (y > height)
    this.y = canvas.height + this.r + rand(10, 120);

    // Movimiento aleatorio: vx puede ser izq/der; vy siempre hacia arriba
    this.vx = rand(BASE_SPEED_SIDE_MIN, BASE_SPEED_SIDE_MAX) * (Math.random() < 0.5 ? -1 : 1);
    this.vy = -rand(BASE_SPEED_UP_MIN, BASE_SPEED_UP_MAX);

    // Estado visual
    this.baseColor = "rgba(90, 160, 255, 1)";
    this.hoverColor = "rgba(255, 120, 180, 1)";
    this.alpha = 1;

    this.isFading = false;
    this.isHovered = false;
  }

  containsPoint(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    return (dx * dx + dy * dy) <= this.r * this.r;
  }

  startFade() {
    // Solo inicia fade si aún no está fading
    if (!this.isFading) this.isFading = true;
  }

  update(speedScale) {
    // Hover: SOLO cambia color (no afecta física)
    this.isHovered = this.containsPoint(mouse.x, mouse.y);

    // Movimiento (se escala con nivel)
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

    ctx.fillStyle = this.isHovered ? this.hoverColor : this.baseColor;
    ctx.fill();

    // Borde suave
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.stroke();

    ctx.restore();
  }

  // Se elimina si:
  // 1) Ya desapareció por fade
  // 2) Salió por arriba completamente (estricto)
  shouldRemove() {
    const outTop = (this.y + this.r) < 0;
    const faded = this.alpha <= 0;
    return outTop || faded;
  }
}

function spawnLevelBatch() {
  // Genera un grupo de 10 para el nivel actual
  for (let i = 0; i < LEVEL_SIZE; i++) {
    circles.push(new Circle());
    totalSpawned++;
  }
}

function updateHUD() {
  levelText.textContent = String(level);
  removedText.textContent = String(removedTotal);

  const percent = totalSpawned === 0 ? 0 : (removedTotal / totalSpawned) * 100;
  percentText.textContent = `${percent.toFixed(1)}%`;

  levelProgressText.textContent = `${removedThisLevel}/${LEVEL_SIZE}`;
  aliveText.textContent = String(circles.length);
}

function nextLevelIfNeeded() {
  if (removedThisLevel >= LEVEL_SIZE) {
    // Subimos nivel y generamos otros 10
    level++;
    removedThisLevel = 0;
    spawnLevelBatch();
  }
}

function speedScaleByLevel() {
  // Cada nivel incrementa un poco la velocidad
  // Nivel 1 = 1.00, Nivel 2 = 1.12, Nivel 3 = 1.24, etc.
  return 1 + (level - 1) * 0.12;
}

// Eventos mouse
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
  // Al clic: si está sobre un círculo, empieza fade lentamente
  // (Tomamos el círculo "más arriba" en la lista para evitar doble clic raro)
  for (let i = circles.length - 1; i >= 0; i--) {
    if (circles[i].containsPoint(mouse.x, mouse.y)) {
      circles[i].startFade();
      break;
    }
  }
});

// Loop principal
function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const speedScale = speedScaleByLevel();

  // Actualiza y dibuja
  for (const c of circles) {
    c.update(speedScale);
    c.draw();
  }

  // Remoción estricta (por arriba o por fade)
  // Contabiliza eliminados
  let removedNow = 0;
  circles = circles.filter((c) => {
    if (c.shouldRemove()) {
      removedNow++;
      return false;
    }
    return true;
  });

  if (removedNow > 0) {
    removedTotal += removedNow;
    removedThisLevel += removedNow;
    nextLevelIfNeeded();
  }

  updateHUD();
  requestAnimationFrame(loop);
}

// Inicio
spawnLevelBatch(); // Nivel 1: 10 elementos
updateHUD();
loop();
