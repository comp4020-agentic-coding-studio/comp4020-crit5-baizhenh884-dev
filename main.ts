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
// coordinate space. CSS decides how big the element is actually displayed, so
// the backing store is matched to the displayed size (times device pixel
// ratio) and the context is scaled by the same factor. Everything downstream
// still draws in game coordinates, so gameplay positions, hitboxes and the
// pointer mapping in the pointermove handler (which divides by CANVAS_WIDTH,
// not canvas.width) are all unaffected — only render sharpness changes.
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

const input: InputState = { pointerX: null, pointerY: null, keyDirection: 0, keyDirectionY: 0 };

// Pointer Events unify mouse and touch in one listener — no separate
// touch-event handling needed for the same movement mechanic, on either axis.
canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  input.pointerX = (event.clientX - rect.left) * scaleX;
  input.pointerY = (event.clientY - rect.top) * scaleY;
});

const KEY_DIRECTIONS_X: Record<string, -1 | 1> = {
  ArrowLeft: -1,
  a: -1,
  A: -1,
  ArrowRight: 1,
  d: 1,
  D: 1,
};

const KEY_DIRECTIONS_Y: Record<string, -1 | 1> = {
  ArrowUp: -1,
  w: -1,
  W: -1,
  ArrowDown: 1,
  s: 1,
  S: 1,
};

const heldDirections = new Set<-1 | 1>();
const heldDirectionsY = new Set<-1 | 1>();

function recomputeKeyDirection(): void {
  if (heldDirections.has(-1) && !heldDirections.has(1)) input.keyDirection = -1;
  else if (heldDirections.has(1) && !heldDirections.has(-1)) input.keyDirection = 1;
  else input.keyDirection = 0;
}

function recomputeKeyDirectionY(): void {
  if (heldDirectionsY.has(-1) && !heldDirectionsY.has(1)) input.keyDirectionY = -1;
  else if (heldDirectionsY.has(1) && !heldDirectionsY.has(-1)) input.keyDirectionY = 1;
  else input.keyDirectionY = 0;
}

window.addEventListener("keydown", (event) => {
  const directionX = KEY_DIRECTIONS_X[event.key];
  if (directionX !== undefined) {
    heldDirections.add(directionX);
    recomputeKeyDirection();
  }
  const directionY = KEY_DIRECTIONS_Y[event.key];
  if (directionY !== undefined) {
    heldDirectionsY.add(directionY);
    recomputeKeyDirectionY();
  }
});

window.addEventListener("keyup", (event) => {
  const directionX = KEY_DIRECTIONS_X[event.key];
  if (directionX !== undefined) {
    heldDirections.delete(directionX);
    recomputeKeyDirection();
  }
  const directionY = KEY_DIRECTIONS_Y[event.key];
  if (directionY !== undefined) {
    heldDirectionsY.delete(directionY);
    recomputeKeyDirectionY();
  }
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

// ---------------------------------------------------------------------------
// Presentation state. None of this is read by game.ts — it exists only so the
// HUD can animate and hits can flash. It is derived by watching the HP values
// change between frames, so no gameplay state was added to carry it.
// ---------------------------------------------------------------------------

let monsterHpShown = MONSTER_MAX_HP;
let playerHpShown = PLAYER_MAX_HP;
let prevMonsterHp = MONSTER_MAX_HP;
let prevPlayerHp = PLAYER_MAX_HP;
let monsterFlash = 0;
let playerFlash = 0;

function updatePresentation(dt: number): void {
  if (state.monster.hp < prevMonsterHp) monsterFlash = 1;
  if (state.playerHp < prevPlayerHp) playerFlash = 1;
  prevMonsterHp = state.monster.hp;
  prevPlayerHp = state.playerHp;

  monsterFlash = Math.max(0, monsterFlash - dt * 6);
  playerFlash = Math.max(0, playerFlash - dt * 2.2);

  // Health bars chase the real value so a hit reads as a visible drain.
  const k = Math.min(1, dt * 9);
  monsterHpShown += (state.monster.hp - monsterHpShown) * k;
  playerHpShown += (state.playerHp - playerHpShown) * k;
}

// ---------------------------------------------------------------------------
// Static background. Stars and gradients are built once at load, never per
// frame and never from gameplay state.
// ---------------------------------------------------------------------------

function makeStars(count: number, minR: number, maxR: number, alpha: number) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: minR + Math.random() * (maxR - minR),
    a: alpha * (0.55 + Math.random() * 0.45),
  }));
}

const STARS = [
  ...makeStars(90, 0.3, 0.85, 0.3),
  ...makeStars(40, 0.8, 1.4, 0.5),
  ...makeStars(14, 1.4, 2.2, 0.8),
];

const SKY = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
SKY.addColorStop(0, "#0a0f26");
SKY.addColorStop(0.55, "#0b1020");
SKY.addColorStop(1, "#141a33");

const NEBULA_A = ctx.createRadialGradient(230, 180, 20, 230, 180, 380);
NEBULA_A.addColorStop(0, "rgba(96, 62, 190, 0.20)");
NEBULA_A.addColorStop(1, "rgba(96, 62, 190, 0)");

const NEBULA_B = ctx.createRadialGradient(760, 470, 20, 760, 470, 420);
NEBULA_B.addColorStop(0, "rgba(28, 120, 150, 0.16)");
NEBULA_B.addColorStop(1, "rgba(28, 120, 150, 0)");

// A distant planet, mostly off-field in the bottom-right corner.
const PLANET = { x: 1015, y: 820, r: 300 };
const PLANET_FILL = ctx.createRadialGradient(
  PLANET.x - PLANET.r * 0.55,
  PLANET.y - PLANET.r * 0.55,
  PLANET.r * 0.1,
  PLANET.x,
  PLANET.y,
  PLANET.r,
);
PLANET_FILL.addColorStop(0, "#1d2b52");
PLANET_FILL.addColorStop(0.6, "#131c38");
PLANET_FILL.addColorStop(1, "#0a0e1f");

const VIGNETTE = ctx.createRadialGradient(
  CANVAS_WIDTH / 2,
  CANVAS_HEIGHT / 2,
  CANVAS_HEIGHT * 0.32,
  CANVAS_WIDTH / 2,
  CANVAS_HEIGHT / 2,
  CANVAS_WIDTH * 0.72,
);
VIGNETTE.addColorStop(0, "rgba(0, 0, 0, 0)");
VIGNETTE.addColorStop(1, "rgba(0, 0, 0, 0.45)");

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// How much larger than its collision box each entity is *drawn*. These are
// presentation only — game.ts never sees them, and every collision still uses
// the unscaled rects. Each is centred on its box, so the overhang is shared
// evenly on both sides rather than shifting the artwork off the hitbox.
const AIRPLANE_ART_SCALE = 1.18;
const MONSTER_ART_SCALE = 1.12;
const BULLET_ART_SCALE = 1.5;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

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
  context.fillStyle = SKY;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  context.fillStyle = NEBULA_A;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = NEBULA_B;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  context.fillStyle = "#ffffff";
  for (const star of STARS) {
    context.globalAlpha = star.a;
    context.beginPath();
    context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  context.fillStyle = PLANET_FILL;
  context.beginPath();
  context.arc(PLANET.x, PLANET.y, PLANET.r, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(150, 185, 255, 0.16)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(PLANET.x, PLANET.y, PLANET.r, Math.PI * 0.85, Math.PI * 1.62);
  context.stroke();

  context.fillStyle = VIGNETTE;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Arcade corner brackets, so the field reads as a bounded cabinet screen.
function drawFieldFrame(context: CanvasRenderingContext2D): void {
  const inset = 9;
  const len = 30;
  context.strokeStyle = "rgba(130, 175, 255, 0.3)";
  context.lineWidth = 2;
  context.lineCap = "butt";
  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [CANVAS_WIDTH - inset, inset, -1, 1],
    [inset, CANVAS_HEIGHT - inset, 1, -1],
    [CANVAS_WIDTH - inset, CANVAS_HEIGHT - inset, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    context.beginPath();
    context.moveTo(x + sx * len, y);
    context.lineTo(x, y);
    context.lineTo(x, y + sy * len);
    context.stroke();
  }
}

// A framed meter with a pale "ghost" that lags behind the real value, so a
// hit reads as a visible drain rather than an instant jump.
function drawMeter(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  ghostRatio: number,
  from: string,
  to: string,
  ghost: string,
  frame: string,
  segments: number,
): void {
  drawRoundedRectPath(context, x - 3, y - 3, w + 6, h + 6, 5);
  context.fillStyle = "rgba(6, 10, 22, 0.8)";
  context.fill();
  context.strokeStyle = frame;
  context.lineWidth = 1.5;
  context.stroke();

  drawRoundedRectPath(context, x, y, w, h, 3);
  context.fillStyle = "#141026";
  context.fill();

  context.save();
  drawRoundedRectPath(context, x, y, w, h, 3);
  context.clip();

  const g = clamp01(ghostRatio);
  if (g > 0) {
    context.fillStyle = ghost;
    context.fillRect(x, y, w * g, h);
  }

  const r = clamp01(ratio);
  if (r > 0) {
    const fill = context.createLinearGradient(x, y, x, y + h);
    fill.addColorStop(0, from);
    fill.addColorStop(1, to);
    context.fillStyle = fill;
    context.fillRect(x, y, w * r, h);
  }

  context.fillStyle = "rgba(0, 0, 0, 0.4)";
  for (let i = 1; i < segments; i++) {
    context.fillRect(x + (w * i) / segments - 1, y, 2, h);
  }
  context.restore();
}

function drawBossBar(context: CanvasRenderingContext2D, monster: Monster): void {
  const w = 460;
  const h = 16;
  const x = (CANVAS_WIDTH - w) / 2;
  const y = 22;
  drawMeter(
    context,
    x,
    y,
    w,
    h,
    monster.hp / MONSTER_MAX_HP,
    monsterHpShown / MONSTER_MAX_HP,
    "#ff8f63",
    "#c8163a",
    "rgba(255, 170, 170, 0.35)",
    "rgba(255, 96, 120, 0.5)",
    10,
  );
}

// Player health as a small HUD panel: an airplane glyph plus one pip per HP.
// Panel width is derived from PLAYER_MAX_HP so the frame always wraps the
// pips snugly instead of leaving dead space when the HP count changes.
function drawPlayerHud(context: CanvasRenderingContext2D): void {
  const pipW = 14;
  const pipH = 9;
  const gap = 3;
  const iconInset = 44; // space reserved for the airplane glyph before the pips
  const rightPadding = 15;

  const panelW = iconInset + PLAYER_MAX_HP * pipW + (PLAYER_MAX_HP - 1) * gap + rightPadding;
  const panelH = 38;
  const x = 20;
  const y = CANVAS_HEIGHT - panelH - 20;

  drawRoundedRectPath(context, x, y, panelW, panelH, 8);
  context.fillStyle = "rgba(7, 12, 24, 0.74)";
  context.fill();
  context.strokeStyle =
    playerFlash > 0
      ? `rgba(255, 90, 90, ${(0.3 + 0.6 * playerFlash).toFixed(3)})`
      : "rgba(120, 210, 165, 0.3)";
  context.lineWidth = 1.5;
  context.stroke();

  context.fillStyle = "#54ff9d";
  airplanePath(context, x + 22, y + 9, 22, 21);
  context.fill();

  const startX = x + iconInset;
  const pipY = y + (panelH - pipH) / 2;
  for (let i = 0; i < PLAYER_MAX_HP; i++) {
    const px = startX + i * (pipW + gap);
    drawRoundedRectPath(context, px, pipY, pipW, pipH, 2);
    if (i < state.playerHp) {
      const g = context.createLinearGradient(px, pipY, px, pipY + pipH);
      g.addColorStop(0, "#7dffbe");
      g.addColorStop(1, "#23c471");
      context.fillStyle = g;
    } else {
      context.fillStyle = "rgba(255, 255, 255, 0.08)";
    }
    context.fill();
  }
}

// Draws the monster as a hostile angular boss: a jagged armoured carapace,
// bone horns and crest spikes, slanted glowing eyes, a fanged maw, and an arm
// ending in a clawed fist on each side.
//
// The whole creature is drawn at MONSTER_ART_SCALE around the centre of its
// collision box, so it reads as the boss without game.ts knowing. Each fist
// sits at the scaled half-width, a few px outside the box edge the matching
// throw launches from — well inside the fireball's own radius, so the ball
// still appears to leave the hand that threw it.
//
// Horns, crest spikes and claws overhang the box the most; the carapace stays
// close to it. monster.x/y/w/h is still the only rect anything collides
// against, and horizontal alignment is what decides whether a
// vertically-travelling bullet that looks like a hit registers as one.
function drawMonster(context: CanvasRenderingContext2D, monster: Monster): void {
  const cx = monster.x + monster.w / 2;
  const cy = monster.y + monster.h / 2;
  const w = monster.w * MONSTER_ART_SCALE;
  const h = monster.h * MONSTER_ART_SCALE;
  const top = cy - h / 2;

  context.lineJoin = "miter";
  context.lineCap = "butt";

  // --- Arms and clawed fists, behind the carapace ---
  const handY = top + h * 0.86;
  const armWidth = Math.max(5, w * 0.055);
  for (const side of [-1, 1] as const) {
    const handX = cx + (side * w) / 2; // the box edge = this side's throw origin

    context.strokeStyle = "#43108a";
    context.lineWidth = armWidth;
    context.beginPath();
    context.moveTo(cx + side * w * 0.2, cy - h * 0.05);
    context.lineTo(cx + side * w * 0.42, cy + h * 0.12);
    context.lineTo(handX, handY);
    context.stroke();

    const fist = w * 0.065;
    context.fillStyle = "#6b28c9";
    context.beginPath();
    context.moveTo(handX - fist, handY - fist * 0.85);
    context.lineTo(handX + fist, handY - fist * 0.7);
    context.lineTo(handX + fist * 0.85, handY + fist * 0.85);
    context.lineTo(handX - fist * 0.85, handY + fist * 0.7);
    context.closePath();
    context.fill();

    context.fillStyle = "#efe6ff";
    for (const offset of [-1, 0, 1]) {
      const ox = offset * w * 0.052;
      context.beginPath();
      context.moveTo(handX + ox - w * 0.023, handY + h * 0.04);
      context.lineTo(handX + ox + w * 0.023, handY + h * 0.04);
      context.lineTo(handX + ox + side * w * 0.016, handY + h * 0.23);
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
  const shell = context.createLinearGradient(0, top, 0, top + h);
  shell.addColorStop(0, "#8b46f5");
  shell.addColorStop(1, "#360d66");
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

  if (monsterFlash > 0) {
    const hit = context.createRadialGradient(cx, cy, 0, cx, cy, w * 0.72);
    hit.addColorStop(0, `rgba(255, 255, 255, ${(0.5 * monsterFlash).toFixed(3)})`);
    hit.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = hit;
    context.beginPath();
    context.arc(cx, cy, w * 0.72, 0, Math.PI * 2);
    context.fill();
  }
}

// Right half of a top-down aircraft, as fractions of (width, height) measured
// from the nose. Mirrored to build the full silhouette. Thick trapezoidal
// wings and a separate tailplane are what make it read as an aircraft rather
// than a star: the wings have real chord, and the tail is a second, smaller
// horizontal surface.
const AIRPLANE_PROFILE: [number, number][] = [
  [0.09, 0.2],
  [0.1, 0.4],
  [0.5, 0.54],
  [0.5, 0.645],
  [0.13, 0.66],
  [0.115, 0.85],
  [0.29, 0.895],
  [0.29, 0.965],
  [0.085, 0.965],
  [0.07, 1],
];

function airplanePath(
  context: CanvasRenderingContext2D,
  cx: number,
  top: number,
  w: number,
  h: number,
): void {
  context.beginPath();
  context.moveTo(cx, top);
  for (const [dx, dy] of AIRPLANE_PROFILE) {
    context.lineTo(cx + dx * w, top + dy * h);
  }
  for (let i = AIRPLANE_PROFILE.length - 1; i >= 0; i--) {
    const [dx, dy] = AIRPLANE_PROFILE[i];
    context.lineTo(cx - dx * w, top + dy * h);
  }
  context.closePath();
}

// Drawn at AIRPLANE_ART_SCALE around the centre of the collision box, so the
// wingtips overhang slightly while the fuselage — the part that reads as the
// aircraft's body — stays inside plane.x/y/w/h. A fireball clipping a wingtip
// therefore still misses, which errs in the player's favour.
function drawAirplane(context: CanvasRenderingContext2D, plane: Rect): void {
  const cx = plane.x + plane.w / 2;
  const w = plane.w * AIRPLANE_ART_SCALE;
  const h = plane.h * AIRPLANE_ART_SCALE;
  const top = plane.y + (plane.h - h) / 2;

  // Soft glow, translucent and tight to the body — reads as a glow, not as
  // extra aircraft. The hitbox is unchanged.
  const glow = context.createRadialGradient(cx, top + h * 0.5, 1, cx, top + h * 0.5, w * 0.62);
  glow.addColorStop(0, "rgba(63, 240, 138, 0.3)");
  glow.addColorStop(1, "rgba(63, 240, 138, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(cx, top + h * 0.5, w * 0.62, 0, Math.PI * 2);
  context.fill();

  // Twin engine exhaust
  context.fillStyle = "rgba(255, 168, 66, 0.9)";
  for (const side of [-1, 1] as const) {
    const ex = cx + side * w * 0.075;
    context.beginPath();
    context.moveTo(ex - w * 0.035, top + h * 0.97);
    context.lineTo(ex + w * 0.035, top + h * 0.97);
    context.lineTo(ex, top + h * 1.28);
    context.closePath();
    context.fill();
  }

  context.lineJoin = "round";
  airplanePath(context, cx, top, w, h);
  const body = context.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  body.addColorStop(0, "#2fd47f");
  body.addColorStop(0.5, "#6dffb4");
  body.addColorStop(1, "#2fd47f");
  context.fillStyle = body;
  context.fill();
  context.strokeStyle = "#0d5a34";
  context.lineWidth = 1.5;
  context.stroke();

  // Canopy
  context.fillStyle = "#0b3f24";
  context.beginPath();
  context.ellipse(cx, top + h * 0.29, w * 0.055, h * 0.14, 0, 0, Math.PI * 2);
  context.fill();

  if (playerFlash > 0) {
    airplanePath(context, cx, top, w, h);
    context.fillStyle = `rgba(255, 70, 70, ${(0.6 * playerFlash).toFixed(3)})`;
    context.fill();
  }
}

function drawBullet(context: CanvasRenderingContext2D, bullet: Rect): void {
  const cx = bullet.x + bullet.w / 2;
  const cy = bullet.y + bullet.h / 2;

  // Core drawn a little larger than the collision box so the shot stays
  // trackable against the starfield. BULLET_ART_SCALE is presentation only.
  const rx = (bullet.w * BULLET_ART_SCALE) / 2;
  const ry = (bullet.h * BULLET_ART_SCALE) / 2;

  // Trail behind (below) the bullet, which always travels straight up.
  const tail = cy + bullet.h * 3.2;
  const trail = context.createLinearGradient(cx, cy, cx, tail);
  trail.addColorStop(0, "rgba(255, 231, 138, 0.75)");
  trail.addColorStop(1, "rgba(255, 231, 138, 0)");
  context.strokeStyle = trail;
  context.lineWidth = rx * 1.7;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(cx, cy);
  context.lineTo(cx, tail);
  context.stroke();

  const halo = context.createRadialGradient(cx, cy, 0, cx, cy, bullet.w * 2.8);
  halo.addColorStop(0, "rgba(255, 246, 200, 0.85)");
  halo.addColorStop(0.45, "rgba(255, 205, 90, 0.4)");
  halo.addColorStop(1, "rgba(255, 205, 90, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(cx, cy, bullet.w * 2.8, 0, Math.PI * 2);
  context.fill();

  const core = context.createLinearGradient(cx, cy - ry, cx, cy + ry);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.55, "#fff2b0");
  core.addColorStop(1, "#ffb020");
  context.fillStyle = core;
  context.beginPath();
  context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  context.fill();
}

function drawProjectile(context: CanvasRenderingContext2D, object: FallingObject): void {
  const cx = object.x + object.w / 2;
  const cy = object.y + object.h / 2;
  const radius = object.w / 2;

  // Trail along the object's own fixed velocity, so the diagonal line it is
  // actually travelling is easy to read. Read-only use of vx/vy.
  const speed = Math.hypot(object.vx, object.vy) || 1;
  const tailX = cx - (object.vx / speed) * radius * 3;
  const tailY = cy - (object.vy / speed) * radius * 3;
  const trail = context.createLinearGradient(cx, cy, tailX, tailY);
  trail.addColorStop(0, "rgba(247, 165, 65, 0.5)");
  trail.addColorStop(1, "rgba(247, 165, 65, 0)");
  context.strokeStyle = trail;
  context.lineWidth = object.w * 0.68;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(cx, cy);
  context.lineTo(tailX, tailY);
  context.stroke();

  const halo = context.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 2.1);
  halo.addColorStop(0, "rgba(247, 120, 40, 0.5)");
  halo.addColorStop(1, "rgba(247, 120, 40, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(cx, cy, radius * 2.1, 0, Math.PI * 2);
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

function drawHitVignette(context: CanvasRenderingContext2D): void {
  if (playerFlash <= 0) return;
  const g = context.createRadialGradient(
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    CANVAS_HEIGHT * 0.3,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    CANVAS_WIDTH * 0.68,
  );
  g.addColorStop(0, "rgba(255, 40, 60, 0)");
  g.addColorStop(1, `rgba(255, 40, 60, ${(0.5 * playerFlash).toFixed(3)})`);
  context.fillStyle = g;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawEndPanel(context: CanvasRenderingContext2D, text: string, accent: string): void {
  context.fillStyle = "rgba(5, 8, 18, 0.66)";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const panelW = 380;
  const panelH = 124;
  const x = CANVAS_WIDTH / 2 - panelW / 2;
  const y = CANVAS_HEIGHT / 2 - panelH / 2;

  drawRoundedRectPath(context, x, y, panelW, panelH, 14);
  context.fillStyle = "rgba(9, 13, 28, 0.94)";
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 2;
  context.stroke();

  // Corner brackets, matching the field frame.
  context.lineWidth = 3;
  const len = 26;
  const pad = 10;
  const corners: [number, number, number, number][] = [
    [x + pad, y + pad, 1, 1],
    [x + panelW - pad, y + pad, -1, 1],
    [x + pad, y + panelH - pad, 1, -1],
    [x + panelW - pad, y + panelH - pad, -1, -1],
  ];
  for (const [px, py, sx, sy] of corners) {
    context.beginPath();
    context.moveTo(px + sx * len, py);
    context.lineTo(px, py);
    context.lineTo(px, py + sy * len);
    context.stroke();
  }

  context.fillStyle = "#ffffff";
  context.font = "bold 40px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function render(): void {
  if (!ctx) return;
  if (!restartButton) return;

  drawBackground(ctx);

  drawMonster(ctx, state.monster);

  for (const object of state.fallingObjects) {
    drawProjectile(ctx, object);
  }

  for (const bullet of state.bullets) {
    drawBullet(ctx, bullet);
  }

  drawAirplane(ctx, state.airplane);

  drawHitVignette(ctx);
  drawFieldFrame(ctx);
  drawBossBar(ctx, state.monster);
  drawPlayerHud(ctx);

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
  updatePresentation(dt);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
