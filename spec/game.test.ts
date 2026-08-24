import { describe, expect, it } from "vitest";
import {
  OBJECT_DAMAGE,
  PLAYER_MAX_HP,
  createInitialState,
  update,
  type InputState,
} from "../game.ts";

const noInput: InputState = { pointerX: null, keyDirection: 0 };

// The one rule with a dedicated test, per spec/README.md and the Crit 5 plan:
// falling object hits player -> HP decreases -> object is removed -> player
// loses at HP 0. This is the rule that makes the game losable at all.
describe("falling object vs player", () => {
  it("decrements player HP by exactly OBJECT_DAMAGE and removes the object on overlap", () => {
    const state = createInitialState();
    state.fallingObjects = [{ ...state.airplane, vx: 0, vy: 0 }];

    update(state, 0, noInput);

    expect(state.playerHp).toBe(PLAYER_MAX_HP - OBJECT_DAMAGE);
    expect(state.fallingObjects).toHaveLength(0);
  });

  it("cannot damage the player again once removed, even across further frames", () => {
    const state = createInitialState();
    state.fallingObjects = [{ ...state.airplane, vx: 0, vy: 0 }];

    update(state, 0, noInput); // consumes the object on the first hit
    const hpAfterFirstHit = state.playerHp;

    update(state, 0, noInput);
    update(state, 0, noInput);

    expect(state.playerHp).toBe(hpAfterFirstHit);
  });

  it("stays active above 0 HP, and transitions to lost exactly at 0 HP", () => {
    const survivesHit = createInitialState();
    survivesHit.playerHp = 2;
    survivesHit.fallingObjects = [{ ...survivesHit.airplane, vx: 0, vy: 0 }];
    update(survivesHit, 0, noInput);
    expect(survivesHit.playerHp).toBe(1);
    expect(survivesHit.phase).toBe("active");

    const dies = createInitialState();
    dies.playerHp = OBJECT_DAMAGE;
    dies.fallingObjects = [{ ...dies.airplane, vx: 0, vy: 0 }];
    update(dies, 0, noInput);
    expect(dies.playerHp).toBe(0);
    expect(dies.phase).toBe("lost");
  });

  it("never drops player HP below 0, even with multiple simultaneous hits", () => {
    const state = createInitialState();
    state.playerHp = OBJECT_DAMAGE;
    state.fallingObjects = [{ ...state.airplane, vx: 0, vy: 0 }, { ...state.airplane, vx: 0, vy: 0 }];

    update(state, 0, noInput);

    expect(state.playerHp).toBe(0);
    expect(state.phase).toBe("lost");
  });
});
