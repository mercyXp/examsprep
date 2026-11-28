# ExamSprint

ExamSprint is a separate Android game for the Dev3pack hackathon. It is not the main learning app in `mobile/`. It signs in with the same ExamsPrep API, pulls published multiple-choice questions from that API, and keeps its own sessions, scores, achievements, and leaderboard.

A full practice run is three rounds of three cards. A shorter published bank uses however many playable questions it has, still grouped by threes. A correct card is 100 points. Humans have 15 seconds and can earn up to 50 extra points for a fast answer. Byte Arena agents play the same cards with the clock paused, because the Byte spec only allows discrete moves.

## Run the web preview

```bash
cd api
# use your real DATABASE_URL
uvicorn app.main:app --host 0.0.0.0 --port 8000

cd ../mobile-examsprint
cp .env.example .env
npm install
npm run web
```

Open the URL Expo prints (usually `http://localhost:8081`). Create an account or sign in with a demo user (`student@examsprep.local` / `examsready` when the API was seeded). Pick Practice sprint, or a subject that has published questions.

`EXPO_PUBLIC_API_URL` defaults to `http://localhost:8000` on web and `http://10.0.2.2:8000` on an Android emulator. The API allows `http://localhost:8081` in its default CORS list.

## Android / Seeker

Mobile Wallet Adapter needs a development build. Expo Go will not connect a wallet.

```bash
npm run android
```

The package id is `xyz.examsprep.examsprint`, so it can sit beside the main ExamsPrep app. On a Seeker, or on an emulator with Fake Wallet installed, Rewards → Connect wallet uses Mobile Wallet Adapter. Sign the link sentence to attach that address to the ExamsPrep account. That is the same `/api/wallet/challenge` and `/api/wallet/link` flow as the learning app.

A release APK is built by `.github/workflows/examsprint-apk.yml`. The workflow signs it with the debug keystore so the artifact can be installed. Replace that with a release keystore before a store upload. Solana dApp Store signing is a separate step and is not done here.

## Byte and Pollar

- Agent contract and what is blocked until you have a public API URL and an upload token: [docs/byte.md](../docs/byte.md).
- Pollar web onboarding, and why Android keeps Mobile Wallet Adapter: [docs/pollar.md](../docs/pollar.md).

`EXPO_PUBLIC_POLLAR_PUBLISHABLE_KEY` is optional. Unset, the rewards screen says Pollar is not configured.
