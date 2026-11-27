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

`EXPO_PUBLIC_API_URL` is the FastAPI origin with no trailing slash.

- Android emulator: `http://10.0.2.2:8000` (that is the emulator's name for your computer's localhost).
- A phone on the same Wi-Fi: `http://YOUR_LAN_IP:8000`.

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
./gradlew assembleDebug
```

`android:build` is `expo prebuild -p android`. It writes the `android/` project, which is gitignored. The debug APK is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

A release APK is `./gradlew assembleRelease`. Sign it before you ship it. Debug is enough for Fake Wallet.

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

## What each screen calls

| Screen | API |
| --- | --- |
| Sign in | `POST /api/auth/login`, `POST /api/auth/google`, then wallet challenge and link |
| Home | `GET /api/learn/modules`, `GET /api/badges/me`, `GET /api/pools` |
| My Courses | `GET /api/learn/modules`, `GET /api/learn/modules/{id}` |
| Lesson | `GET /api/learn/lessons/{id}`, `PUT /api/learn/lessons/{id}/progress` |
| Quizzes | `GET /api/learn/quizzes`, `POST /api/learn/quizzes/{id}/attempts` |
| Leaderboard | `GET /api/leaderboard` |
| Badges | `GET /api/badges/me`, `POST /api/badges/claim` |
| Prize pools | `GET /api/pools` |
