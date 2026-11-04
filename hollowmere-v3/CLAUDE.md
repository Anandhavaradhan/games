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

## Dressing (looks only)
The DRESSING block in index.html (search `DRESSING: the house's second pass`) adds trim, beams, rafters, sconces, rugs, doors ajar,
clutter, webs, window shafts, cellar puddles and mist after the house is built. None of it joins the walking graph or blocks a cell.
- Wall-fixed instances go in `TRIMIDX` (wall key -> instance list) and wall groups go through `addDecor`, so `breachWall` hides them.
- It is seeded from `HOUSE.seed`, so co-op players see the same dressing. `DRESS.fx` (shafts, mist) is hidden on LOW quality.
- Wall props use `decorFaceOK` / `decorPlace` (the same rules as the paintings: clear of hiding places, stairs and windows).

## The Hollow (one ghost) and skins
Everyone plays one ghost, THE HOLLOW. The 41 legends in ROSTER are now its SKILLS: learning, equipping (`save.main`),
combining and upgrading work exactly as before, only the vault's words changed. The ghost model never follows the skill:
`myChar()` / `heroChar(skinId)` build it from `SKINS` (search `THE HOLLOW — the one ghost you play`).
- Skins are bought with ether in the vault's SKINS tab. Each changes the look and adds a fixed stat bonus (`b`, [MIGHT,GRACE,WITS,SPIRIT]); `wearSt(c)` = `effSt(c)` + the worn skin's bonus, capped at 100, and is what `computePS` and the vault use. Never for the GOD legend. `save.skins` (owned) and `save.skin` (worn) live in
  the account inside stats; `stats.skins` is only ever added to (arrayUnion in cloud.js). `save.skinPend` keeps a purchase
  on the device until the account has it, like `cmbPend`.
- Co-op state and the watch page send the skin as `sk` next to `lg`; an unknown or missing `sk` draws the default Hollow.
- Skins are collected in order: a skin is for sale only once every skin before it in `SKINS` is owned (`renderSkins`).
- The vault opens on SKINS; SKILLS is the second tab, with the roles and COMBINE as its subtopics.
- Trinket skins (`TSKINS`, near the trinkets): look (`tBody`), flight (`trinketFly`, `thr`) and landing (`trinketLand`, `land`), and power (`pw`: throw range, extra linger, slow, close-range freeze), each skin stronger than the one before (KP). Owned ids share `save.skins` (they start `t_`, listed in `TSKIN_IDS`, which cleanSave needs before TSKINS exists); the one in use is `save.tskin` (stats.tskin). Bought in order too.
- A new skin goes at the end of `SKINS` with a new id; never rename or reuse an id (players own them by id).

## Lending GOD
Admins can lend the GOD skill to any player for a while from admin.html (player drawer, GOD skill: 1 hour, 1 day or 7 days, or take it back).
It is stored in `godPass/{uid}` (`until`), which only admins can write and only that player can read. `godCheck` watches it
(`cloud.watchGodPass`): GOD joins their vault until `until`, then `godPass` drops it and they are back on `save.main`. Never in the news.
