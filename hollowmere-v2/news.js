/* ==================================================  },
  {
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
    id: '2026-10-17-gift-ash',
    date: '2026-10-17',
    tag: 'NEW',
    title: 'Gift ash to other players',
    body: 'Ash can now be gifted, just like ether and legends. Open FRIENDS, press GIFT on a friend or SEND A GIFT, and choose ASH. ' +
      'If you gift it, you lose it: the ash leaves your vault and lands in theirs the next time they play.'
  },
  {
    id: '2026-10-17-friends-offline',
    date: '2026-10-17',
    tag: 'FIX',
    title: 'Friends no longer stuck "playing"',
    body: 'A friend who lost their connection or closed the game could stay shown as playing a night for ever. ' +
      'Friends now show as Offline within a few minutes of leaving, and come back online properly after their connection drops.'
  },
  {
    id: '2026-10-17-backstory-voice',
    date: '2026-10-17',
    tag: 'NEW',
    title: 'The backstory has a narrator',
    body: 'A voice now tells the story of Hollowmere as the backstory plays, and the music settles back while it speaks. ' +
      'Watch it again any time with THE BACKSTORY on the title screen.'
  },
  {
    id: '2026-10-17-upgrade-combined',
    date: '2026-10-17',
    tag: 'NEW',
    title: 'Upgrade a combined legend at once',
    body: 'A combined legend now has an UPGRADE THE WHOLE COMBINATION button in the vault. One press takes every legend it was fused from up a level, ' +
      'for the same ash those upgrades cost one by one. Legends already at the top level are skipped.'
  },
  {
    id: '2026-10-17-upgrade-levels-kept',
    date: '2026-10-17',
    tag: 'FIX',
    title: 'Legend upgrade levels now stay saved',
    body: 'Upgrade levels bought in the vault could be lost: when the game was closed right after an upgrade, ' +
      'or when the game was open on another tab or device. Every upgrade now goes to your account the moment you buy it, ' +
      'and an older tab or device can no longer take a level back down.'
  },
  {
    id: '2026-10-17-sound-on-phones',
    date: '2026-10-17',
    tag: 'FIX',
    title: 'Sound on phones and tablets',
    body: 'On Android phones and tablets the house could stay silent: the first touch did not count as the tap the browser waits for, ' +
      'and once the phone muted the game (another app, a locked screen, switching tabs) the sound never came back.\n\n' +
      'Now any tap wakes the sound again, and so does coming back to the game.'
  },
  {
    id: '2026-10-17-grow-combined',
    date: '2026-10-17',
    tag: 'NEW',
    title: 'Grow a combined legend',
    body: 'A combined legend can now take one more legend you own, up to five in all, and you only pay the difference in price: ' +
      '10,000 ether to go from two legends to three, 20,000 from three to four, and 40,000 from four to five.\n\n' +
      'Open the combined legend in the vault and look under ADD A LEGEND. It gains the new power, keeps the higher of each stat, ' +
      'and keeps the nights it has already played. Your originals stay yours.'
  },
  {
    id: '2026-10-17-todays-bounties',
    date: '2026-10-17',
    tag: 'NEW',
    title: "Today's bounties",
    body: "There are now three bounties for the whole day, alongside the three you get each night. Everyone who plays that day gets the same three, and new ones arrive at midnight.\n\n" +
      "Every night you play counts towards them, even the ones you do not survive, and each pays a large share of ether once it is done. " +
      "See them under TODAY'S BOUNTIES on the title screen, and under tonight's bounties while you play."
  },
  {
    id: '2026-10-17-combined-legends-kept',
    date: '2026-10-17',
    tag: 'FIX',
    title: 'Combined legends stay put',
    body: 'Playing the original Hollowmere could take The Psychopomp out of your vault, and with it any combined legend it was fused into. ' +
      'That no longer happens: the original now leaves legends it does not know alone, and a combined legend keeps every legend it was made from.\n\n' +
      'Having the game open in two tabs or on two devices can no longer wipe a combined legend you just made, either.'
  },
  {
    id: '2026-10-17-trinkets-fix',
    date: '2026-10-17',
    tag: 'FIX',
    title: 'Trinkets you can find, and throws that work',
    body: 'The bottles are bigger now, glow green so you can spot them across a room, and chime the first time you come near one.\n\n' +
      'A thrown bottle now draws the thing from anywhere in the house, even another floor, and a line at the foot of the screen tells you what it did.'
  },
  {
    id: '2026-10-17-backstory-freeze',
    date: '2026-10-17',
    tag: 'FIX',
    title: 'Backstory no longer freezes',
    body: 'The backstory could stop on its first picture while the sound carried on. It now plays through. ' +
      'It also follows your Camera motion setting: with it set to reduced, the camera holds still.'
  },
  {
    id: '2026-10-16-dread',
    date: '2026-10-16',
    tag: 'NEW',
    title: 'The house is awake',
    body: 'The thing hunts with burning red eyes now, and it shrieks as it comes. A sting plays the first time your light lands on its face.\n\n' +
      'The house plays with you too. Something stands at the edge of your light and is gone when you look, or breathes right behind you. ' +
      'Doors slam, something knocks inside the walls, a music box plays, someone runs across the floor above, and sometimes your light dies. ' +
      'With PHOTOSENSITIVITY on, your light fades instead of flickering, and with JUMPSCARES off the shape at the edge of your light never comes.'
  },
  {
    id: '2026-10-16-trinkets-bounties',
    date: '2026-10-16',
    tag: 'NEW',
    title: 'Trinkets, close calls and bounties',
    body: 'Old bottles lie two to a floor. Walk over one to pocket it (you carry two), then press T or tap THROW to lob it. ' +
      'It shatters, and the thing goes to look, even mid-hunt once it has lost sight of you.\n\n' +
      'Let it pass within arm\'s reach while you hide or creep, and slip away unseen, for a close call worth 6 ether. ' +
      'Every night also brings three bounties, shown at the top of the screen, each paid in ether the moment you finish it.'
  },
  {
    id: '2026-10-16-ash-upgrades',
    date: '2026-10-16',
    tag: 'NEW',
    title: 'Ash and legend upgrades',
    body: 'A new currency, ASH, gathers as you play: from embers, memories, surviving a hunt and escaping (more if it never saw you). ' +
      'It settles into the vault when the night ends; it cannot be bought with ether.\n\n' +
      'Spend it in the vault to upgrade any legend you own, up to level 10. Every level adds 3 to all four stats (up to 100) ' +
      'and brings its power back 3% sooner. A combined legend grows with the legends it was fused from. ' +
      'A legend you gift away leaves its upgrades behind.'
  },
  {
    id: '2026-10-16-gifts',
    date: '2026-10-16',
    tag: 'NEW',
    title: 'Send gifts to other players',
    body: 'You can now give ether or a legend to any player with a username. Open FRIENDS and press GIFT next to a friend, ' +
      'or SEND A GIFT to find anyone by their username.\n\n' +
      'What you give leaves your vault. You can gift any legend you bought, but not the free five, a combined legend, ' +
      'or a legend fused into one of your combined legends. If they already own the legend, they get its price in ether instead. ' +
      'Gifts need an account; guests cannot send or receive them.'
  },
  {
    id: '2026-10-16-backstory',
    date: '2026-10-16',
    tag: 'NEW',
    title: 'The backstory',
    body: 'A painted, animated cinematic with narration and score now tells how you came to be caught in the house. ' +
      'It plays as you wake for your first night, and THE BACKSTORY on the title screen replays it any time. ' +
      'Press ESC or SKIP, or hold a tap, to skip it. With PHOTOSENSITIVITY on it plays without flashes.'
  },
  {
    id: '2026-10-16-version-switch',
    date: '2026-10-16',
    tag: 'NEW',
    title: 'Play the original Hollowmere',
    body: 'SWITCH VERSION on the title screen takes you to the original Hollowmere, and back again from its own title screen.'
  },
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
