# Hollowmere V3 (hollowmere-v3)

A standalone copy of Hollowmere with every update through PR #32 (new house every night, a hunter per floor, reachable embers and memories, the new difficulty ladder, faint first-person camera shake). `hollowmere-v2/` was rolled back to its state before PR #30.

## News inbox
Every change that players will notice (a new legend, a feature, a balance change, a fix they would care about)
adds a notice at the top of `news.js` in the same commit. Players see it under NEWS on the title screen.
Internal work never goes there: admin tools, the keeper's GOD legend, refactors, rules, logging, tests.
Follow the format and id rules at the top of `news.js`; never change or reuse an existing id.

## Difficulty, houses and hunters
- EASY is the classic night: the fixed house (HOUSE_SEED 0) and one hunter that roams every floor (co-op: one per player).
- NORMAL / HARD / NIGHTMARE are PER_FLOOR: a new house each night and one hunter bound to each floor (`M.home`).
  See ONE HUNTER PER FLOOR in index.html: stairs are held by one hunter at a time (STAIRHOLD), the other keeps clear of its landing.
- Solo pages are built for one side of that line; switching across it reloads the page (`diffNeedsNewPage`).
- Embers and memories spawn only on cells reachable from the Heart and outside FURN_CELLS. If you move or add furniture
  or hiding places, update FURN_CELLS as well as `houseKeep`.

## Kept apart from V2
V2 and V3 share one Firebase project. Accounts, usernames, players/, friends and time played are shared.
- Fastest escapes: V3 posts to and reads `escapes_v3/` (`BOARD` in cloud.js and admin.html). Username renames touch both boards.
- Co-op: multiplayer.js maps `rooms`, `live`, `presence`, `watch` and `invites` to `*_v3` paths, so V2 and V3 players never meet in a room.
- Both rules files (firestore.rules, database.rules.json) are kept identical in hollowmere-v2/ and hollowmere-v3/ and hold the rules for both games. Publish either copy.
