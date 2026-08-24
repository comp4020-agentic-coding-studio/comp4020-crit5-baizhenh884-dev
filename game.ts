// Pure game logic: no DOM/canvas dependency, so it's unit-testable directly
// (see spec/game.test.ts). main.ts owns rendering and input.

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
  fallingObjects: Rect[];
  spawnTimerMs: number;
  playerHp: number;
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

const OBJECT_WIDTH = 24;
const OBJECT_HEIGHT = 24;

export const PLAYER_MAX_HP = 10;
export const OBJECT_DAMAGE = 1;
export const OBJECT_FALL_SPEED = 100; // px/s — forgiving, and never ramps up
export const OBJECT_SPAWN_INTERVAL_MS = 1500;
export const MAX_CONCURRENT_OBJECTS = 2;

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
    // One object already en route at a forgiving fall speed, passing near the
    // airplane's own default (centered) x — so the very first thing a player
    // sees is "something falls toward roughly where I am," with several
    // seconds to notice and react, not an unavoidable first hit.
    fallingObjects: [
      {
        x: CANVAS_WIDTH / 2 - OBJECT_WIDTH / 2,
        y: MONSTER_Y + MONSTER_HEIGHT,
        w: OBJECT_WIDTH,
        h: OBJECT_HEIGHT,
      },
    ],
    spawnTimerMs: 0,
    playerHp: PLAYER_MAX_HP,
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

// Spawns a new falling object once the interval elapses, up to the
// concurrent cap. While at the cap, the timer is clamped rather than left to
// accumulate, so freeing up a slot later can't trigger a burst of spawns —
// the forgiving, non-ramping spawn rate holds regardless of recent history.
function spawnFallingObjects(state: GameState, dt: number): void {
  if (state.fallingObjects.length >= MAX_CONCURRENT_OBJECTS) {
    state.spawnTimerMs = Math.min(state.spawnTimerMs, OBJECT_SPAWN_INTERVAL_MS);
    return;
  }

  state.spawnTimerMs += dt * 1000;

  if (state.spawnTimerMs >= OBJECT_SPAWN_INTERVAL_MS) {
    state.spawnTimerMs -= OBJECT_SPAWN_INTERVAL_MS;
    state.fallingObjects.push({
      x: clampToCanvas(Math.random() * CANVAS_WIDTH, OBJECT_WIDTH),
      y: state.monster.y + state.monster.h,
      w: OBJECT_WIDTH,
      h: OBJECT_HEIGHT,
    });
  }
}

// Advances bullets, resolving bullet↔falling-object and bullet↔monster
// collisions, and transitions to "won" at 0 monster HP. A bullet that
// destroys a falling object deals no monster damage — objects and the
// monster's HP are unrelated per the locked design. Bullets that hit nothing
// simply fly off the top.
function updateBullets(state: GameState, dt: number): void {
  const surviving: Rect[] = [];

  for (const bullet of state.bullets) {
    bullet.y -= BULLET_SPEED * dt;

    if (bullet.y + bullet.h < 0) continue; // off the top, gone

    if (state.phase === "active") {
      const hitObjectIndex = state.fallingObjects.findIndex((object) =>
        aabbOverlap(bullet, object),
      );
      if (hitObjectIndex !== -1) {
        state.fallingObjects.splice(hitObjectIndex, 1);
        continue; // bullet and object both consumed, no monster HP change
      }

      if (aabbOverlap(bullet, state.monster)) {
        state.monster.hp = Math.max(0, state.monster.hp - BULLET_DAMAGE);
        if (state.monster.hp === 0) state.phase = "won";
        continue; // bullet consumed on hit
      }
    }

    surviving.push(bullet);
  }

  state.bullets = surviving;
}

// Advances falling objects, resolves object↔player collisions, and
// transitions to "lost" at 0 player HP. An object that passes the player
// without hitting them simply falls off the bottom, gone. A single overlap
// removes the object immediately, so it can never damage the player twice.
function updateFallingObjects(state: GameState, dt: number): void {
  const surviving: Rect[] = [];

  for (const object of state.fallingObjects) {
    object.y += OBJECT_FALL_SPEED * dt;

    if (object.y > CANVAS_HEIGHT) continue; // off the bottom, gone

    if (state.phase === "active" && aabbOverlap(object, state.airplane)) {
      state.playerHp = Math.max(0, state.playerHp - OBJECT_DAMAGE);
      if (state.playerHp === 0) state.phase = "lost";
      continue; // object consumed on hit
    }

    surviving.push(object);
  }

  state.fallingObjects = surviving;
}

// Advances the airplane's x by one frame's worth of input. Pointer input is
// an absolute position (the plane tracks the cursor/finger directly);
// keyboard input is a velocity nudge. Both funnel into the same
// state.airplane.x, so whichever the player used most recently simply wins.
export function update(state: GameState, dt: number, input: InputState): void {
  if (state.phase !== "active") return;

  moveAirplane(state, dt, input);
  fireBullets(state, dt);
  spawnFallingObjects(state, dt);
  updateBullets(state, dt);
  updateFallingObjects(state, dt);
}
