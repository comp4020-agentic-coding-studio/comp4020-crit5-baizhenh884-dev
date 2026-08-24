import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MONSTER_MAX_HP,
  createInitialState,
  update,
  type InputState,
} from "./game.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("missing #game canvas");

const restartButton = document.querySelector<HTMLButtonElement>("#restart");
if (!restartButton) throw new Error("missing #restart button");

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

function restartIfEnded(): void {
  if (state.phase !== "active") {
    state = createInitialState();
  }
}

canvas.addEventListener("pointerdown", restartIfEnded);
window.addEventListener("keydown", restartIfEnded);
restartButton.addEventListener("click", restartIfEnded);

function render(): void {
  if (!ctx) return;
  if (!restartButton) return;

  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const monster = state.monster;
  ctx.fillStyle = "#7a3ff0";
  ctx.fillRect(monster.x, monster.y, monster.w, monster.h);

  const barWidth = monster.w;
  const barX = monster.x;
  const barY = monster.y - 10;
  ctx.fillStyle = "#2a2a3a";
  ctx.fillRect(barX, barY, barWidth, 5);
  ctx.fillStyle = "#e05a5a";
  ctx.fillRect(barX, barY, barWidth * (monster.hp / MONSTER_MAX_HP), 5);

  ctx.fillStyle = "#f5f57a";
  for (const bullet of state.bullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
  }

  ctx.fillStyle = "#3ff08a";
  ctx.fillRect(state.airplane.x, state.airplane.y, state.airplane.w, state.airplane.h);

  if (state.phase === "won") {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("YOU WIN", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
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
