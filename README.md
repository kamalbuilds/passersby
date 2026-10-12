# Passersby

Walk past another Seeker. Both phones remember.

Passersby turns your phone into a lamp on a night street. While the app is open it broadcasts a rotating Bluetooth token and listens for other Seekers doing the same. When two phones hear each other inside the same five-minute window, the encounter goes on-chain as proof that two real devices were in the same place at the same time. You can only wave at (send SKR to) people you've actually passed.

Built for CLOCK IN, the Solana Mobile hackathon.

## Why a phone, and why a Seeker

Nothing else in your life sits in your pocket while you walk through a city, so this only works on a phone. The Seeker Genesis Token is what makes it worth recording: one token per device means an encounter between two SGT holders is two distinct humans with two distinct phones, not one person running two wallets. That gives you an in-person social graph that can't be farmed from a laptop.

Nintendo's StreetPass proved people will carry a device around just to collect passing strangers. Passersby brings that loop to the phone Solana users already carry, and makes each crossing an asset you own.

## How it works

1. **Sign in.** The wallet signs a short message through Mobile Wallet Adapter. The server checks the signature and looks up the wallet's Seeker Genesis Token on Solana mainnet (Token-2022, group `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`). Seekers get the `seeker` tier keyed by their SGT mint; any other wallet joins as `wallet` tier, and its encounters carry no Seeker badge.
2. **Broadcast.** The native module `modules/passersby-ble` (Kotlin, Android `BluetoothLeAdvertiser` and `BluetoothLeScanner`) advertises 16 bytes of manufacturer data under the Bluetooth SIG test company id `0xFFFF`. The token is `HMAC-SHA256(secret, identity || epoch)` truncated, and it rotates every 300 seconds, so a token overheard on the street can't be replayed tomorrow or tied back to a wallet by a stranger.
3. **Sight.** Each phone batches the tokens it hears to `POST /sightings` every ten seconds.
4. **Confirm.** One-way sightings don't count. When A has heard B and B has heard A in the same or adjacent epoch, the server signs an Ed25519 attestation and relays `[ed25519 verify, record_encounter]` to the program, paying the fee itself.
5. **Record.** The program checks the attestor key, the sorted identity pair and the day, then creates the `Encounter` account at `["encounter", lo, hi, day]`. One encounter per pair per day; both profiles get their counts and streaks updated.
6. **Wave.** Either party can send SKR to the other with `wave`. The program only lets the two people named on the encounter do it.

## On-chain

| | |
|---|---|
| Program (devnet) | `H15pvqJFh7isY3fMX4oZe2ezZ8xjM4RZmv2uemQhv1g2` |
| Attestor key | `6L8TPUsbP7kVLNZufrXdk9HnyDds9UJpbwRTFFhaRyLR` |
| SKR (devnet) | `3BySLyP6nGFKDfFdfcsuT4ZmcndDsnsiLsHMCToT5i5V` |
| Mainnet SKR (cluster config) | `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` |
| Server | `https://passersby-api.fly.dev` |

## Proof it runs

`server/scripts/e2e.ts` against the live server and devnet: wallet A reported B's token and got no encounter, because one-way sightings don't count. B then reported A's token, the encounter confirmed in about two seconds (signature `3Rx6HyorcqEQYUbsyEeNprLbh3YkvhaN8QAt794WhuXchojfMd3DUsqMvqPY7uDgBxLnkJgLkv6CE8akSKjnZbvh`), and the script read the `Encounter` and both `Profile` accounts straight from devnet.

Tests:

- `program/`: 14 LiteSVM tests. They cover duplicate pairs on one day, streaks across days and gaps, foreign attestors, unsorted pairs, forged tier or wallet or timestamp claims, missing or misdirected Ed25519 instructions, exact wave amounts, and third parties trying to wave. Pulling the attestor check turns two of them red.
- `server/`: 15 tests on beacon rotation, mutual confirmation, stale and self tokens, and retry after a failed relay.
- `app/`: the `wave` instruction layout against the program IDL.

## Run it

```bash
cd program && cargo test
cd server && npm install && npx tsx server.ts        # env names in server/.env.example
cd app && npm install && npx expo prebuild -p android && cd android && ./gradlew assembleRelease
```

The Android release APK is built by `.github/workflows/android.yml` on every push to `main`.

## Layout

```
program/   Anchor 0.32 program: encounters, profiles, streaks, waves
server/    sighting matcher, SGT lookup, attestor and devnet relayer (Fly)
app/       Expo SDK 55 Android app with a native Kotlin BLE module
```
