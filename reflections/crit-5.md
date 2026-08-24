# Crit 5 — Sky Defender

## What was the breakthrough that moved the work forward?

Realising that a green check suite and a careful code review could both be
fully satisfied by a game that wasn't worth playing. Stage 3 passed every test
I had, including the focused one on the lose rule, and was still broken as a
game: I could park the plane in the centre and win without touching the
keyboard. Only playing revealed it.

That habit was bought by an earlier failure. At Stage 2 the checks were green
and the agent had verified movement its own way, so the keyboard looked fine;
when I opened the game myself, ArrowLeft/Right and A/D moved nothing. After
that I stopped treating "checks pass" as the end of a stage and made playing
it myself, in a real foreground browser, the gate on every later stage.

That gate surfaced everything after it: the centre-camping strategy, then my
own auto-fire shooting down the fireballs before they could threaten me, then
throws that were still too close to vertical. Three consecutive fixes, each
rejected by play rather than by reading.

## What did this work change about who I want to be as a software developer?

I came in assuming the valuable skill would be describing what I wanted
precisely enough. It turned out to be deciding what "working" means and
refusing to move until it was met. The agent wrote correct code far faster
than I could — and also verified its own work in a backgrounded tab that
couldn't animate, confidently and wrongly.

So the part I want to keep is the judgement, not the typing: to own the
definition of done and the feedback loop that proves it, and delegate
everything downstream.
