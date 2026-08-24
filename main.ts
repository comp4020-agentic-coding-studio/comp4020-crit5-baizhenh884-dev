import { CANVAS_HEIGHT, CANVAS_WIDTH, createInitialState, update, type InputState } from "./game.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("missing #game canvas");

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

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

function render(): void {
  if (!ctx) return;

  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = "#7a3ff0";
  ctx.fillRect(state.monster.x, state.monster.y, state.monster.w, state.monster.h);

  ctx.fillStyle = "#3ff08a";
  ctx.fillRect(state.airplane.x, state.airplane.y, state.airplane.w, state.airplane.h);
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
