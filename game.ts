// Pure game logic: no DOM/canvas dependency, so it's unit-testable directly
// (see spec/game.test.ts, added in stage 3). main.ts owns rendering and input.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Monster extends Rect {
  hp: number;
}

export type Phase = "active" | "won" | "lost";

export interface GameState {
  phase: Phase;
  airplane: Rect;
  monster: Monster;
  bullets: Rect[];
  fireTimerMs: number;
}

export interface InputState {
  // Latest known pointer x (canvas-relative), or null if the pointer hasn't
  // moved over the canvas yet this session.
  pointerX: number | null;
  // Keyboard direction: -1 (left), 0 (none), 1 (right). Independent of the
  // pointer path — both write to the same airplane.x each frame.
  keyDirection: -1 | 0 | 1;
}

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 640;

const AIRPLANE_WIDTH = 36;
const AIRPLANE_HEIGHT = 20;
const AIRPLANE_Y = CANVAS_HEIGHT - 60;
const AIRPLANE_MOVE_SPEED = 260; // px/s, keyboard movement

const MONSTER_WIDTH = 64;
const MONSTER_HEIGHT = 32;
const MONSTER_Y = 40;

export const MONSTER_MAX_HP = 40;

const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 10;

export const BULLET_SPEED = 400; // px/s
export const BULLET_FIRE_INTERVAL_MS = 350;
export const BULLET_DAMAGE = 1;

export function createInitialState(): GameState {
  return {
    phase: "active",
    airplane: {
      x: CANVAS_WIDTH / 2 - AIRPLANE_WIDTH / 2,
      y: AIRPLANE_Y,
      w: AIRPLANE_WIDTH,
      h: AIRPLANE_HEIGHT,
    },
    monster: {
      x: CANVAS_WIDTH / 2 - MONSTER_WIDTH / 2,
      y: MONSTER_Y,
      w: MONSTER_WIDTH,
      h: MONSTER_HEIGHT,
      hp: MONSTER_MAX_HP,
    },
    bullets: [],
    fireTimerMs: 0,
  };
}

function clampToCanvas(x: number, width: number): number {
  return Math.max(0, Math.min(CANVAS_WIDTH - width, x));
}

function aabbOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Pointer position is a one-shot signal, consumed and cleared the frame it's
// applied — otherwise a pointerX set once would keep snapping the plane back
// every subsequent frame, permanently overriding keyboard input the instant
// the mouse ever touched the canvas. Clearing it lets whichever input the
// player used most recently (a fresh pointermove, or a still-held key) win.
function moveAirplane(state: GameState, dt: number, input: InputState): void {
  const plane = state.airplane;

  if (input.pointerX !== null) {
    plane.x = clampToCanvas(input.pointerX - plane.w / 2, plane.w);
    input.pointerX = null;
  }

  if (input.keyDirection !== 0) {
    plane.x = clampToCanvas(plane.x + input.keyDirection * AIRPLANE_MOVE_SPEED * dt, plane.w);
  }
}

function fireBullets(state: GameState, dt: number): void {
  state.fireTimerMs += dt * 1000;

  while (state.fireTimerMs >= BULLET_FIRE_INTERVAL_MS) {
    state.fireTimerMs -= BULLET_FIRE_INTERVAL_MS;
    const plane = state.airplane;
    state.bullets.push({
      x: plane.x + plane.w / 2 - BULLET_WIDTH / 2,
      y: plane.y - BULLET_HEIGHT,
      w: BULLET_WIDTH,
      h: BULLET_HEIGHT,
    });
  }
}

// Advances bullets, resolves bullet↔monster collisions, and transitions to
// "won" at 0 monster HP. Bullets that hit nothing simply fly off the top.
function updateBullets(state: GameState, dt: number): void {
  const surviving: Rect[] = [];

  for (const bullet of state.bullets) {
    bullet.y -= BULLET_SPEED * dt;

    if (bullet.y + bullet.h < 0) continue; // off the top, gone

    if (state.phase === "active" && aabbOverlap(bullet, state.monster)) {
      state.monster.hp = Math.max(0, state.monster.hp - BULLET_DAMAGE);
      if (state.monster.hp === 0) state.phase = "won";
      continue; // bullet consumed on hit
    }

    surviving.push(bullet);
  }

  state.bullets = surviving;
}

// Advances the airplane's x by one frame's worth of input. Pointer input is
// an absolute position (the plane tracks the cursor/finger directly);
// keyboard input is a velocity nudge. Both funnel into the same
// state.airplane.x, so whichever the player used most recently simply wins.
export function update(state: GameState, dt: number, input: InputState): void {
  if (state.phase !== "active") return;

  moveAirplane(state, dt, input);
  fireBullets(state, dt);
  updateBullets(state, dt);
}
