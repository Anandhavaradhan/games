/* =========================================================
   HOLLOWMERE — NEWS INBOX
   What players read under NEWS on the title screen. Only things meant for players go here:
   new legends, new features, changes they will notice, fixes they asked for. Internal work
   (admin tools, the keeper's own legend, refactors, rules, logging) never does.

   Every commit that ships something public adds an entry here in the same commit, at the TOP
   of the list (newest first). Rules:
     id     unique and never changed or reused — it is what remembers "read" for each player.
            Use the date plus a short slug: '2026-10-15-psychopomp'.
     date   'YYYY-MM-DD', the day it reached players.
     tag    one of: 'NEW LEGEND', 'NEW', 'CHANGE', 'FIX'.
     title  a few words.
     body   plain text, a short paragraph or two (blank line between paragraphs). No HTML.
   ========================================================= */
export const NEWS = [
  {
    id: '2026-10-16-news-inbox',
    date: '2026-10-16',
    tag: 'NEW',
    title: 'News from the manor',
    body: 'Every update to Hollowmere now lands here, under NEWS on the title screen. ' +
      'A glowing count shows how many you have not read yet.\n\n' +
      'Open a notice to mark it read, or use the tabs to see only what is unread (or only what you have read). ' +
      'Signed-in players keep their read list on every device.'
  },
  {
    id: '2026-10-15-five-legend-combos',
    date: '2026-10-15',
    tag: 'NEW',
    title: 'Fuse up to five legends',
    body: 'The vault can now fuse up to five legends into one, not just two. ' +
      'A fused legend carries every one of their powers, each with its own essence and cooldown, and the best of each stat.\n\n' +
      'Two cost 10,000 ether, and the price doubles for each one more, so five cost 80,000. ' +
      'Keys 1 to 5 fire each power on their own; on touch screens the power icons sit on an arc by the bottom-right buttons.'
  },
  {
    id: '2026-10-15-psychopomp',
    date: '2026-10-15',
    tag: 'NEW LEGEND',
    title: 'The Psychopomp',
    body: '"She has walked ten thousand souls to the door. None of them looked back."\n\n' +
      'A new tier IV ESCAPE legend is waiting in the vault. Her power, Last Ferry, carries you straight out of the house ' +
      'the moment the seal is broken. Until every ember is gathered it reads SEALED, shows how many embers are left, ' +
      'and pressing it costs nothing.'
  },
  {
    id: '2026-10-14-smooth-spectating',
    date: '2026-10-14',
    tag: 'CHANGE',
    title: 'Smoother spectating',
    body: 'Watching a teammate after you are taken, or a friend’s night live, is now much smoother. ' +
      'Their position goes straight between your browsers, and the camera follows them without waiting for each update.'
  },
  {
    id: '2026-10-14-leaderboard-views',
    date: '2026-10-14',
    tag: 'NEW',
    title: 'Best per player on the leaderboard',
    body: 'The fastest-escape board has two views. BEST PER PLAYER shows everyone once, at their fastest escape, ' +
      'and is where the board opens. ALL ENTRIES shows every escape. A co-op escape counts for everyone in it.'
  },
  {
    id: '2026-10-14-combine-legends',
    date: '2026-10-14',
    tag: 'NEW',
    title: 'Combine legends in the vault',
    body: 'Fuse legends you own into one combined legend that carries all of their powers. ' +
      'Fire one power at a time, or all of the chosen ones together. Co-op partners and the leaderboard see the first legend you picked.'
  },
  {
    id: '2026-10-14-fixes',
    date: '2026-10-14',
    tag: 'FIX',
    title: 'Co-op escapes and blocked storage',
    body: 'Co-op escapes now reach the leaderboard. Sign-in and co-op also work in browsers that block this site’s storage ' +
      '(the sign-in then lasts until you close the page). After a username change, your co-op entries show the new name too.\n\n' +
      'New ways back: leave a co-op team or return to the title screen from the settings.'
  },
  {
    id: '2026-10-13-coop-invites',
    date: '2026-10-13',
    tag: 'NEW',
    title: 'Invite friends into your room',
    body: 'Press INVITE next to a friend to make a co-op room and ask them in, no code needed. ' +
      'In co-op, the night ends when the last player is out, and anyone who got out first can watch the others.'
  },
  {
    id: '2026-10-13-v2',
    date: '2026-10-13',
    tag: 'NEW',
    title: 'Difficulty, friends and voice chat',
    body: 'Four difficulty levels, from Easy to Nightmare, each with its own leaderboard. ' +
      'Add friends by username, see when they are online, and watch their nights live. ' +
      'Co-op rooms now have voice chat.\n\n' +
      'Guests are temporary: a guest’s progress lasts until the game is closed, and moves into a new account the first time you sign in.'
  }
];
