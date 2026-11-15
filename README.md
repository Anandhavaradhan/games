# Games

Play in the browser: https://anandhavaradhan.github.io/games/

| Game | Folder |
|---|---|
| Hollowmere V3 (current), V2 and V1 | `hollowmere-v3/`, `hollowmere-v2/`, `HOLLOWMERE/` |
| Blockhaven | `blockhaven/` |
| Gravity Drift | `gravity-drift/` |
| Vanguard | `vanguard/` |

## Apps

One app carries the hub page and every game:

- **Android**: [AnandhGames.apk](https://github.com/Anandhavaradhan/games/raw/downloads/AnandhGames.apk)
- **Windows**: [AnandhGames.exe](https://github.com/Anandhavaradhan/games/raw/downloads/AnandhGames.exe) (portable, no installation)

They are built by `.github/workflows/games-apps.yml` from `apps/android` and `apps/desktop` on every change to `main`.
New game folders (any folder with an `index.html`) are included automatically.

Games that load libraries from the internet (three.js, Firebase) still need a connection inside the apps.
In the apps, sign in to Hollowmere with email; Google sign-in works on the website and in the separate
Hollowmere V3 Android app (`hollowmere-v3-android/`, built by `.github/workflows/hollowmere-android.yml`).
