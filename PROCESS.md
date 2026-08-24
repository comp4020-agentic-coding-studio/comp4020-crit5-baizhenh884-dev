# Process overview

## What I built

**Sky Defender**: a browser arcade game where an airplane that only moves
sideways fires automatically at a monster patrolling the top, which hurls
aimed fireballs back. My first concept was a plain
catch game. I revised it before building anything: I wanted a clearer goal and
a win/lose loop that meant something, while keeping the player to one
controlled action. The airplane version gave it something to defeat and
something to lose to, with movement still the only input.

## The moments that mattered

**Green checks said the controls worked. Playing said they didn't.**
Stage 2 passed `pnpm check`, and the agent had confirmed movement by calling
the update function directly. In my own browser the mouse moved the plane and
ArrowLeft/Right and A/D did nothing: pointer input was never cleared, so it
overwrote the keyboard every frame. The obvious move was to take the fix and
carry on. Instead I made a foreground-browser playtest the gate on every later
stage, because the agent's tab runs backgrounded, which throttles
`requestAnimationFrame` — it structurally could not catch this class of bug.
[`110f7b8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-baizhenh884-dev/commit/110f7b8)

**Camping the centre won the game for free.**
Stage 3 was finished, green, and dull: a centred, untouched plane won almost
unattended. Reading the code would never have surfaced it. Three rounds of
play each rejected the previous fix — a
patrolling monster (my own bullets still shielded me), fixed aimed throws
(still too close to vertical), then alternating left/right throw origins.
After these changes I could no longer win by leaving the airplane in the
centre: movement became genuinely necessary to survive and to land shots.
[`77a4185`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-baizhenh884-dev/commit/77a4185)

The rule that makes losing possible is the one under a focused automated
test, written in the same commit that introduced it.
[`611ba48`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-baizhenh884-dev/commit/611ba48)
