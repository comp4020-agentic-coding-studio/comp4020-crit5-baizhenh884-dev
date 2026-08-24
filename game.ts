// Pure game logic: no DOM/canvas dependency, so it's unit-testable directly
// (see spec/game.test.ts, added in stage 3). main.ts owns rendering and input.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Phase = "active" | "won" | "lost";

export interface GameState {
  phase: Phase;
  airplane: Rect;
  monster: Rect;
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
    },
  };
}

function clampToCanvas(x: number, width: number): number {
  return Math.max(0, Math.min(CANVAS_WIDTH - width, x));
}

// Advances the airplane's x by one frame's worth of input. Pointer input is
// an absolute position (the plane tracks the cursor/finger directly);
// keyboard input is a velocity nudge. Both funnel into the same
// state.airplane.x, so whichever the player used most recently simply wins.
export function update(state: GameState, dt: number, input: InputState): void {
  if (state.phase !== "active") return;

  const plane = state.airplane;

  if (input.pointerX !== null) {
    plane.x = clampToCanvas(input.pointerX - plane.w / 2, plane.w);
  }

  if (input.keyDirection !== 0) {
    plane.x = clampToCanvas(plane.x + input.keyDirection * AIRPLANE_MOVE_SPEED * dt, plane.w);
  }
}
