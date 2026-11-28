# ExamsPrep for Android

Native Expo / React Native app, scaffolded with:

```bash
npx solana-mobile@latest create mobile --template expo-kit-wallet --skip-git
```

That template is the Solana Mobile Expo app (Mobile Wallet Adapter already wired). The screens on top of it are ExamsPrep: email and Google sign-in, courses, the lesson player, quizzes, the leaderboard, badges, and prize pools. They call the FastAPI API. They are React Native views, not a webview of the website.

Mobile Wallet Adapter does not run inside Expo Go. Use a development build or the APK below, and install a wallet on the same emulator.

## Configure

```bash
cd mobile
cp .env.example .env
```

`EXPO_PUBLIC_API_URL` is the FastAPI origin with no trailing slash. If it is unset, the app calls `https://examsprep-api.onrender.com`.

- Android emulator, local API: `http://10.0.2.2:8000` (that is the emulator's name for your computer's localhost).
- A phone on the same Wi-Fi: `http://YOUR_LAN_IP:8000`.
- The hosted API: `https://examsprep-api.onrender.com`.

`EXPO_PUBLIC_GOOGLE_CLIENT_ID` is optional. Use the same Web client id as the website and the API. Without it, email sign-in still works.

Start the API first (`docs/SETUP.md`), including `alembic upgrade head`.

## Run on an emulator

```bash
npm install
npx expo start --dev-client
```

Or install straight onto a running emulator:

```bash
npm run android
```

`npm run android` is `expo run:android`. It compiles the native app and installs it. You need Android Studio, an emulator (API 33 or newer), and a JDK.

Typecheck only, which does not need an emulator:

```bash
npx tsc --noEmit
```

## Build an APK

```bash
npm run android:build
cd android
./gradlew assembleRelease
```

`android:build` is `expo prebuild -p android`. It writes the `android/` project, which is gitignored. The installable APK embeds the JavaScript and is signed with the debug keystore that prebuild generates:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Install it:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`./gradlew assembleDebug` is the Expo dev client. It expects `npx expo start` on the same network. Use the release APK when you want the screens without Metro. Replace the debug keystore before a store upload.

## Fake Wallet on the emulator

Fake Wallet is the reference Mobile Wallet Adapter wallet. The ExamsPrep app has nothing to connect to until a wallet app is on the same emulator.

1. Create an Android emulator in Android Studio (API 33+, Google APIs). Start it.
2. Install Fake Wallet on that emulator. Build it from [solana-mobile/mobile-wallet-adapter](https://github.com/solana-mobile/mobile-wallet-adapter) (`android/fakewallet`) or install a debug APK from that repo's releases. The app name on the device is Fake Wallet.
3. Install the ExamsPrep debug APK on the same emulator (`adb install` above, or `npm run android`).
4. Open ExamsPrep. Sign in with a student email, for example the local demo `student@examsprep.local` / `examsready` when the API was seeded.
5. Tap **Connect wallet**. Android opens Fake Wallet. Approve the connection. That is the Mobile Wallet Adapter association.
6. Tap **Sign and link this wallet**. Fake Wallet asks you to sign a sentence. Approve it. The API checks the signature and stores the address.
7. Study a lesson or open **Badges**. Claiming a badge calls the API, which signs the on-chain award with the authority key. The phone does not hold that key.

If Connect wallet does nothing, Fake Wallet is not installed, or the app was opened in Expo Go. Use the development build or the APK.

## What was added on top of the template

The Solana Mobile Expo template (Mobile Wallet Adapter, devnet cluster, wallet tools) is unchanged as the base. Screens are React Native views. This is not a WebView of the website, and it is not a Kotlin rewrite. Native camera, microphone, audio, notifications, the keystore, and SQLite are Expo modules, so they need a development build or the APK. Expo Go cannot load them.

Run `alembic upgrade head` on the API before using push-token registration, notification preferences, offline sync keys, or the Seeker check. That migration is `20261128_0019`.

### Screens

Bottom navigation: Home, Courses, Study, AI, Me. The other screens open from those tabs.

| Screen | What it calls |
| --- | --- |
| Sign in / register | `POST /api/auth/login`, `POST /api/auth/signup`, `POST /api/auth/google`. The access token is stored with `expo-secure-store` (Android keystore). |
| Home, My Courses, Course (chapters) | `GET /api/learn/modules`, `GET /api/learn/modules/{id}` |
| Lesson | `GET /api/learn/lessons/{id}` renders text, lists, code, images, callouts, tables, math, flashcards, checks, direct video files, and a system link for YouTube. Progress is `PUT /api/learn/lessons/{id}/progress`. |
| Quizzes and mock exams | `GET /api/learn/quizzes`, `GET/POST /api/learn/quizzes/{id}`. Mocks with `timeLimitSeconds` count down and submit at zero. |
| Snap a question | Camera permission, capture, rotate, crop, upload `POST /api/ai/snap`, follow-up `POST /api/ai/snap/{id}/follow-up`, save `POST /api/ai/snap/{id}/save`. |
| AI tutor | Microphone permission indicator, records with `expo-audio`, `POST /api/ai/tutor/turns`, plays `audioUrl` when the server returns one. |
| Audio learning | `POST /api/ai/lessons/{id}/speech`, then seek, speed, and background playback. “Read on this phone” uses the device voice and is labeled as that. |
| Revision planner | `GET /api/auth/me`, `GET /api/learn/exam-schedule`, and `GET /api/ai/planner` when that route exists. |
| Achievements | `GET /api/badges/me` and `POST /api/mobile/seeker/verify`. |
| Leaderboard | `GET /api/leaderboard` |
| Wallet and rewards | Mobile Wallet Adapter connect, sign message, sign and send a devnet memo, then `POST /api/badges/claim`. |
| Profile and settings | `PATCH /api/auth/me`, notification preferences, sync now. |

AI routes that are still being built answer as unavailable (HTTP 404, 405, 501, or 503). The screen shows that message. It does not fill in a fake explanation, score, or plan.

### Offline

Lessons, notes, and quizzes can be saved in SQLite (`examsprep-study.db`). A banner shows when the phone is offline. Progress and quiz attempts are written to an outbox with an `Idempotency-Key` before the request. On reconnect the same key is sent again.

- A repeated quiz key returns the original attempt (`replayed: true`) and does not insert another row.
- A repeated progress key returns the stored response.
- A guarded progress sync will not move the slide backwards or clear a completion that is already stored. The response includes `conflict` when the server kept its copy.
- A 4xx that is not a retry stays in the outbox as a conflict and is listed in Settings.

### Seeker

The official check is the Seeker Genesis Token on mainnet (`@solana-mobile/skr-genesis-token`, group mint `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`). The phone does not grant the achievement. `POST /api/mobile/seeker/verify` uses the wallet the student already signed for, reads Token-2022 accounts from `SOLANA_MAINNET_RPC_URL`, and stores the mint once. An RPC failure is HTTP 503, not “you do not own a Seeker”. A wallet with no token gets `verified: false`. The app still runs on any Android phone. An emulator cannot hold a Genesis Token, so this achievement cannot be completed there.

`award_badge` is signed by the API authority. The student account on that instruction does not sign. The devnet transaction the phone signs and sends is a memo that names the claim. Both signatures are shown. “Claim with the authority key” skips the memo when the wallet has no devnet SOL.

### Push notifications

Local reminders do not need a paid service or Firebase:

- Daily study reminder at the hour saved in settings.
- Streak warning at 20:00.
- Exam reminders from the dates on the student profile, the evening before and the morning of, when those times are still in the future.

New lessons, achievements, rewards, and leaderboard pushes are preferences stored by `PUT /api/mobile/notification-preferences`. The phone registers an Expo push token with `POST /api/mobile/push-tokens` when Firebase is configured and the device can issue one. This API does not send the push. Sending needs a worker and an Expo access token, which must not be committed.

Firebase setup for server push on Android:

1. Create a Firebase project and add an Android app with package `xyz.examsprep.app`.
2. Download `google-services.json` into `mobile/`. It is gitignored. Do not commit it.
3. In `mobile/app.json`, under `expo.android`, add `"googleServicesFile": "./google-services.json"`.
4. Rebuild the dev client or the APK (`npx expo prebuild -p android` then `./gradlew assembleDebug`). Expo Go will not do this.
5. On the API host, keep a process that reads `push_tokens` and sends through the Expo push API with `EXPO_ACCESS_TOKEN`. Respect the preference flags. Do not put that token in the app.

Without `google-services.json`, local reminders still schedule. `getExpoPushTokenAsync` fails, and Settings says so.

### Owner setup

1. API: set `DATABASE_URL`, run `alembic upgrade head`. Optional: `SOLANA_MAINNET_RPC_URL` (defaults to public mainnet) and the existing devnet authority key if badges should be written on-chain.
2. App: `cd mobile && cp .env.example .env` and set `EXPO_PUBLIC_API_URL` if you are not using the hosted API. `EXPO_PUBLIC_GOOGLE_CLIENT_ID` stays optional.
3. Install a wallet on the same emulator (Fake Wallet) before Connect wallet. The cluster switcher defaults to devnet.
4. Build: `npm install`, `npx expo prebuild -p android`, `cd android && ./gradlew assembleRelease`. The installable APK is `android/app/build/outputs/apk/release/app-release.apk`. Expo’s generated project signs that release build with the debug keystore, so it installs for a demo and is not a Play Store upload. `assembleDebug` is a dev client: it loads JavaScript from `npx expo start` and does not contain the screens by itself. GitHub Actions (`.github/workflows/android-apk.yml`) runs `assembleRelease` on every push to `main` and uploads `examsprep-release-apk`.

The screen table above is the list of routes the phone calls.
