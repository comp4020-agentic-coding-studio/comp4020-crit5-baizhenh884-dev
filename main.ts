import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MONSTER_MAX_HP,
  PLAYER_MAX_HP,
  createInitialState,
  update,
  type FallingObject,
  type InputState,
  type Monster,
  type Rect,
} from "./game.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("missing #game canvas");

const restartButton = document.querySelector<HTMLButtonElement>("#restart");
if (!restartButton) throw new Error("missing #restart button");

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

// Game logic and all drawing work in a fixed CANVAS_WIDTH x CANVAS_HEIGHT
// coordinate space. CSS decides how big the element is actually displayed,
// which is now much larger than that on desktop, so the backing store is
// matched to the displayed size (times device pixel ratio) and the context is
// scaled by the same factor. Everything downstream still draws in game
// coordinates, so gameplay positions, hitboxes and the pointer mapping in the
// pointermove handler (which divides by CANVAS_WIDTH, not canvas.width) are
// all unaffected — only render sharpness changes.
let backingScale = 0;

function syncBackingStore(): void {
  if (!canvas || !ctx) return;

  const displayWidth = canvas.getBoundingClientRect().width || CANVAS_WIDTH;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const scale = (displayWidth / CANVAS_WIDTH) * dpr;

  if (Math.abs(scale - backingScale) < 0.01) return;
  backingScale = scale;

  canvas.width = Math.round(CANVAS_WIDTH * scale);
  canvas.height = Math.round(CANVAS_HEIGHT * scale);
  // Resizing the backing store resets the context, so re-apply the transform.
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

syncBackingStore();
new ResizeObserver(syncBackingStore).observe(canvas);

let state = createInitialState();

const input: InputState = { pointerX: null, keyDirection: 0 };

// Pointer Events unify mouse and touch in one listener — no separate
// touch-event handling needed for the same horizontal-movement mechanic.
canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  input.pointerX = (event.clientX - rect.left) * scaleX;
});

const KEY_DIRECTIONS: Record<string, -1 | 1> = {
  ArrowLeft: -1,
  a: -1,
  A: -1,
  ArrowRight: 1,
  d: 1,
  D: 1,
};

const heldDirections = new Set<-1 | 1>();

function recomputeKeyDirection(): void {
  if (heldDirections.has(-1) && !heldDirections.has(1)) input.keyDirection = -1;
  else if (heldDirections.has(1) && !heldDirections.has(-1)) input.keyDirection = 1;
  else input.keyDirection = 0;
}

window.addEventListener("keydown", (event) => {
  const direction = KEY_DIRECTIONS[event.key];
  if (direction === undefined) return;
  heldDirections.add(direction);
  recomputeKeyDirection();
});

window.addEventListener("keyup", (event) => {
  const direction = KEY_DIRECTIONS[event.key];
  if (direction === undefined) return;
  heldDirections.delete(direction);
  recomputeKeyDirection();
});

function restartIfEnded(): void {
  if (state.phase !== "active") {
    state = createInitialState();
  }
}

canvas.addEventListener("pointerdown", restartIfEnded);
// Only a fresh key press restarts. A movement key still held at the moment of
// death keeps firing auto-repeat keydown events every few tens of ms, which
// would restart the game before the player ever saw the win or lose screen.
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  restartIfEnded();
});
restartButton.addEventListener("click", restartIfEnded);

// Decorative background stars: generated once at load, not per frame or from
// gameplay state — purely cosmetic, has no effect on collisions or timing.
const STARS = Array.from({ length: 50 }, () => ({
  x: Math.random() * CANVAS_WIDTH,
  y: Math.random() * CANVAS_HEIGHT,
  r: Math.random() * 1.2 + 0.3,
  a: Math.random() * 0.6 + 0.2,
}));

function drawRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function drawBackground(context: CanvasRenderingContext2D): void {
  const gradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#0b1020");
  gradient.addColorStop(1, "#161b33");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  for (const star of STARS) {
    context.globalAlpha = star.a;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawHpBar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  fillColor: string,
): void {
  drawRoundedRectPath(context, x, y, w, h, h / 2);
  context.fillStyle = "#20233a";
  context.fill();

  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped > 0) {
    drawRoundedRectPath(context, x, y, w * clamped, h, h / 2);
    context.fillStyle = fillColor;
    context.fill();
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.25)";
  context.lineWidth = 1;
  drawRoundedRectPath(context, x, y, w, h, h / 2);
  context.stroke();
}

// Draws the monster as a hostile angular boss: a jagged armoured carapace,
// bone horns and crest spikes, slanted glowing eyes, a fanged maw, and an arm
// ending in a clawed fist on each side.
//
// The two fists are pinned to the collision box's left and right edges, which
// are exactly the x-coordinates the alternating throw launches from (the box
// half-width equals OBJECT_SPAWN_SIDE_OFFSET in game.ts), so each projectile
// leaves the hand that actually threw it — no change to the throw logic.
//
// Horns, crest spikes and claws deliberately overhang the box vertically to
// make the silhouette larger and more menacing, but the carapace — the part
// that reads as the monster's body — fills monster.x/y/w/h, and nothing
// overhangs it horizontally. That rect is still the only thing game.ts
// collides against, and horizontal alignment is what decides whether a
// vertically-travelling bullet that looks like a hit registers as one.
function drawMonster(context: CanvasRenderingContext2D, monster: Monster): void {
  const { x, y, w, h } = monster;
  const cx = x + w / 2;
  const cy = y + h / 2;

  context.lineJoin = "miter";
  context.lineCap = "butt";

  // --- Arms and clawed fists, behind the carapace ---
  const handY = y + h * 0.86;
  for (const side of [-1, 1] as const) {
    const handX = cx + (side * w) / 2; // the box edge = this side's throw origin

    context.strokeStyle = "#43108a";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(cx + side * w * 0.2, cy - h * 0.05);
    context.lineTo(cx + side * w * 0.42, cy + h * 0.12);
    context.lineTo(handX, handY);
    context.stroke();

    context.fillStyle = "#6b28c9";
    context.beginPath();
    context.moveTo(handX - 6, handY - 5);
    context.lineTo(handX + 6, handY - 4);
    context.lineTo(handX + 5, handY + 5);
    context.lineTo(handX - 5, handY + 4);
    context.closePath();
    context.fill();

    context.fillStyle = "#efe6ff";
    for (const offset of [-5, 0, 5]) {
      context.beginPath();
      context.moveTo(handX + offset - 2.2, handY + 2);
      context.lineTo(handX + offset + 2.2, handY + 2);
      context.lineTo(handX + offset + side * 1.5, handY + 11);
      context.closePath();
      context.fill();
    }
  }

  // --- Horns and crest spikes, behind the carapace so only the tips show ---
  context.fillStyle = "#e6dcff";
  for (const side of [-1, 1] as const) {
    context.beginPath();
    context.moveTo(cx + side * w * 0.34, cy - h * 0.38);
    context.lineTo(cx + side * w * 0.14, cy - h * 0.48);
    context.lineTo(cx + side * w * 0.46, cy - h * 0.92);
    context.closePath();
    context.fill();
  }
  for (const t of [-0.09, 0.09]) {
    context.beginPath();
    context.moveTo(cx + w * (t - 0.05), cy - h * 0.46);
    context.lineTo(cx + w * (t + 0.05), cy - h * 0.46);
    context.lineTo(cx + w * t, cy - h * 0.72);
    context.closePath();
    context.fill();
  }

  // --- Carapace: angular, fills the collision box ---
  const shell = context.createLinearGradient(0, y, 0, y + h);
  shell.addColorStop(0, "#7c3aed");
  shell.addColorStop(1, "#3b0f70");
  context.fillStyle = shell;
  context.beginPath();
  context.moveTo(cx - w * 0.48, cy - h * 0.04);
  context.lineTo(cx - w * 0.36, cy - h * 0.36);
  context.lineTo(cx - w * 0.14, cy - h * 0.5);
  context.lineTo(cx + w * 0.14, cy - h * 0.5);
  context.lineTo(cx + w * 0.36, cy - h * 0.36);
  context.lineTo(cx + w * 0.48, cy - h * 0.04);
  context.lineTo(cx + w * 0.34, cy + h * 0.36);
  context.lineTo(cx + w * 0.1, cy + h * 0.5);
  context.lineTo(cx - w * 0.1, cy + h * 0.5);
  context.lineTo(cx - w * 0.34, cy + h * 0.36);
  context.closePath();
  context.fill();
  context.strokeStyle = "#1f0838";
  context.lineWidth = 2;
  context.stroke();

  // --- Slanted eyes: outer corner high, inner corner low (a scowl) ---
  for (const side of [-1, 1] as const) {
    context.fillStyle = "#ff2d55";
    context.beginPath();
    context.moveTo(cx + side * w * 0.36, cy - h * 0.34);
    context.lineTo(cx + side * w * 0.1, cy - h * 0.12);
    context.lineTo(cx + side * w * 0.12, cy);
    context.lineTo(cx + side * w * 0.34, cy - h * 0.16);
    context.closePath();
    context.fill();

    context.fillStyle = "#ffd6de";
    context.beginPath();
    context.moveTo(cx + side * w * 0.3, cy - h * 0.26);
    context.lineTo(cx + side * w * 0.17, cy - h * 0.13);
    context.lineTo(cx + side * w * 0.19, cy - h * 0.06);
    context.lineTo(cx + side * w * 0.3, cy - h * 0.19);
    context.closePath();
    context.fill();
  }

  // --- Fanged maw ---
  const mouthTop = cy + h * 0.08;
  const mouthBottom = cy + h * 0.4;
  context.fillStyle = "#150520";
  context.beginPath();
  context.moveTo(cx - w * 0.3, mouthTop);
  context.lineTo(cx + w * 0.3, mouthTop);
  context.lineTo(cx + w * 0.2, cy + h * 0.44);
  context.lineTo(cx - w * 0.2, cy + h * 0.44);
  context.closePath();
  context.fill();

  context.fillStyle = "#f2ecff";
  for (let i = 0; i < 5; i++) {
    const t = -0.28 + (i * 0.56) / 4;
    context.beginPath();
    context.moveTo(cx + w * (t - 0.05), mouthTop);
    context.lineTo(cx + w * (t + 0.05), mouthTop);
    context.lineTo(cx + w * t, mouthTop + h * 0.16);
    context.closePath();
    context.fill();
  }
  for (let i = 0; i < 4; i++) {
    const t = -0.21 + (i * 0.42) / 3;
    context.beginPath();
    context.moveTo(cx + w * (t - 0.05), mouthBottom);
    context.lineTo(cx + w * (t + 0.05), mouthBottom);
    context.lineTo(cx + w * t, mouthBottom - h * 0.14);
    context.closePath();
    context.fill();
  }
}

// Draws the airplane as a simple top-down aircraft (nose pointing up, toward
// the monster and the direction it fires). Wingtips sit exactly at the
// collision box's left/right edges, so the visible silhouette doesn't extend
// past the hitbox used for collisions.
function drawAirplane(context: CanvasRenderingContext2D, plane: Rect): void {
  const cx = plane.x + plane.w / 2;
  const top = plane.y;
  const bottom = plane.y + plane.h;
  const w = plane.w;
  const h = plane.h;

  // Soft glow so the plane stays legible against the darker background at the
  // larger display size. Translucent and tight to the body — it reads as a
  // glow, not as extra aircraft, and the hitbox is unchanged.
  const glow = context.createRadialGradient(cx, top + h * 0.5, 1, cx, top + h * 0.5, w * 0.6);
  glow.addColorStop(0, "rgba(63, 240, 138, 0.28)");
  glow.addColorStop(1, "rgba(63, 240, 138, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(cx, top + h * 0.5, w * 0.6, 0, Math.PI * 2);
  context.fill();

  // Engine exhaust
  context.fillStyle = "rgba(255, 168, 66, 0.85)";
  context.beginPath();
  context.moveTo(cx - w * 0.08, bottom - h * 0.05);
  context.lineTo(cx + w * 0.08, bottom - h * 0.05);
  context.lineTo(cx, bottom + h * 0.28);
  context.closePath();
  context.fill();

  context.fillStyle = "#54ff9d";
  context.strokeStyle = "#0f5f36";
  context.lineWidth = 1.5;

  context.beginPath();
  context.moveTo(cx, top);
  context.lineTo(cx + w * 0.12, top + h * 0.35);
  context.lineTo(cx + w * 0.5, top + h * 0.55);
  context.lineTo(cx + w * 0.18, top + h * 0.62);
  context.lineTo(cx + w * 0.22, bottom);
  context.lineTo(cx, bottom - h * 0.12);
  context.lineTo(cx - w * 0.22, bottom);
  context.lineTo(cx - w * 0.18, top + h * 0.62);
  context.lineTo(cx - w * 0.5, top + h * 0.55);
  context.lineTo(cx - w * 0.12, top + h * 0.35);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#0b3f24";
  context.beginPath();
  context.ellipse(cx, top + h * 0.32, w * 0.075, h * 0.13, 0, 0, Math.PI * 2);
  context.fill();
}

function drawBullet(context: CanvasRenderingContext2D, bullet: Rect): void {
  const cx = bullet.x + bullet.w / 2;
  const cy = bullet.y + bullet.h / 2;

  const halo = context.createRadialGradient(cx, cy, 0, cx, cy, bullet.w * 1.8);
  halo.addColorStop(0, "rgba(255, 236, 150, 0.5)");
  halo.addColorStop(1, "rgba(255, 236, 150, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(cx, cy, bullet.w * 1.8, 0, Math.PI * 2);
  context.fill();

  const core = context.createLinearGradient(bullet.x, bullet.y, bullet.x, bullet.y + bullet.h);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(1, "#f5c542");
  context.fillStyle = core;
  context.beginPath();
  context.ellipse(cx, cy, bullet.w / 2, bullet.h / 2, 0, 0, Math.PI * 2);
  context.fill();
}

function drawProjectile(context: CanvasRenderingContext2D, object: FallingObject): void {
  const cx = object.x + object.w / 2;
  const cy = object.y + object.h / 2;
  const radius = object.w / 2;

  // Short trail along the object's own fixed velocity, so the diagonal line it
  // is actually travelling is easy to read at a glance. Read-only use of
  // vx/vy — nothing here changes the trajectory.
  const speed = Math.hypot(object.vx, object.vy) || 1;
  const tailX = cx - (object.vx / speed) * radius * 2.8;
  const tailY = cy - (object.vy / speed) * radius * 2.8;
  const trail = context.createLinearGradient(cx, cy, tailX, tailY);
  trail.addColorStop(0, "rgba(247, 165, 65, 0.45)");
  trail.addColorStop(1, "rgba(247, 165, 65, 0)");
  context.strokeStyle = trail;
  context.lineWidth = object.w * 0.65;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(cx, cy);
  context.lineTo(tailX, tailY);
  context.stroke();

  const halo = context.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 1.9);
  halo.addColorStop(0, "rgba(247, 120, 40, 0.45)");
  halo.addColorStop(1, "rgba(247, 120, 40, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(cx, cy, radius * 1.9, 0, Math.PI * 2);
  context.fill();

  const core = context.createRadialGradient(
    cx - radius * 0.3,
    cy - radius * 0.3,
    radius * 0.15,
    cx,
    cy,
    radius,
  );
  core.addColorStop(0, "#fff7d6");
  core.addColorStop(0.45, "#ffb03a");
  core.addColorStop(1, "#c2410c");
  context.fillStyle = core;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#7c2d12";
  context.lineWidth = 1;
  context.stroke();
}

function drawEndPanel(context: CanvasRenderingContext2D, text: string, accentColor: string): void {
  context.fillStyle = "rgba(5, 8, 18, 0.6)";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const panelW = 260;
  const panelH = 96;
  const x = CANVAS_WIDTH / 2 - panelW / 2;
  const y = CANVAS_HEIGHT / 2 - panelH / 2;

  drawRoundedRectPath(context, x, y, panelW, panelH, 12);
  context.fillStyle = "rgba(11, 16, 32, 0.85)";
  context.fill();
  context.strokeStyle = accentColor;
  context.lineWidth = 2;
  drawRoundedRectPath(context, x, y, panelW, panelH, 12);
  context.stroke();

  context.fillStyle = "#ffffff";
  context.font = "bold 28px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function render(): void {
  if (!ctx) return;
  if (!restartButton) return;

  drawBackground(ctx);

  const monster = state.monster;
  drawMonster(ctx, monster);
  // Sits clear above the horns, which overhang the top of the collision box.
  drawHpBar(ctx, monster.x, monster.y - 27, monster.w, 7, monster.hp / MONSTER_MAX_HP, "#e05a5a");

  for (const object of state.fallingObjects) {
    drawProjectile(ctx, object);
  }

  for (const bullet of state.bullets) {
    drawBullet(ctx, bullet);
  }

  drawAirplane(ctx, state.airplane);

  drawHpBar(ctx, 12, CANVAS_HEIGHT - 24, 130, 10, state.playerHp / PLAYER_MAX_HP, "#3ff08a");

  if (state.phase === "won") {
    drawEndPanel(ctx, "YOU WIN", "#3ff08a");
  }

  if (state.phase === "lost") {
    drawEndPanel(ctx, "GAME OVER", "#e05a5a");
  }

  restartButton.hidden = state.phase === "active";
}

let lastTime: number | null = null;

function loop(time: number): void {
  const dt = lastTime === null ? 0 : (time - lastTime) / 1000;
  lastTime = time;

  update(state, dt, input);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
