# Passersby build spec

Passersby turns walking past another Seeker owner into a verified on-chain encounter. Phones broadcast a rotating 16-byte token over Bluetooth LE (manufacturer id 0xFFFF, "PB" magic) and scan for others. When two phones see each other inside the same 5-minute window, the server confirms a mutual sighting and the encounter is written on-chain. You can only wave at (send SKR to) people you have actually passed.

## Identity tiers

- `seeker`: wallet holds a Seeker Genesis Token (mainnet lookup, Token-2022, group `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`). Identity key = SGT mint.
- `wallet`: no SGT. Identity key = wallet address. Encounters are recorded and shown as unverified.

## Layout

```
program/   Anchor 0.32.1, program `passersby`, devnet
server/    Node 24 TypeScript HTTP server on Fly (node:http, no framework)
app/       Expo SDK 55 app, local module modules/passersby-ble (done)
```

## Program `passersby`

- `Config` PDA `["config"]`: admin, attestor, bump. `init_config(attestor)`, `set_attestor` (admin only).
- `Profile` PDA `["profile", identity]`: identity (32), wallet, tier u8, encounters u32, verified_encounters u32, streak u16, last_day u32, waves_received u32, bump. Created lazily by `record_encounter`.
- `Encounter` PDA `["encounter", lo_identity, hi_identity, day.to_le_bytes()]` (lo/hi = byte-wise sorted identities, day = unix_seconds / 86400 as u32): lo, hi, lo_wallet, hi_wallet, day, verified (both tiers seeker), first_seen i64, bump. One per pair per day.
- `record_encounter(lo, hi, lo_wallet, hi_wallet, lo_tier, hi_tier, day, seen_at)`: previous instruction must be an Ed25519 verify by `config.attestor` over `b"passersby:v1" || lo || hi || lo_wallet || hi_wallet || lo_tier || hi_tier || day(u32 LE) || seen_at(i64 LE)`; all Ed25519 offset instruction indexes = u16::MAX; `lo < hi` byte-wise; `day == seen_at / 86400`; `seen_at` within 1 day of clock. Init Encounter (duplicate same pair same day fails). Init-if-needed both Profiles, increment counters, update streak (consecutive days with at least one encounter). Payer = any signer (server relays and pays).
- `wave(amount)` on an Encounter: signer must be lo_wallet or hi_wallet; transfers `amount` of the configured SKR mint (stored in Config as `skr_mint`, set in init_config) from signer to the other party's ATA (init_if_needed), increments the receiver Profile `waves_received`. amount >= 1.

Checked math, no unwrap on user input, named error enum. LiteSVM tests each able to fail: happy path, duplicate same day fails, next day succeeds and streak = 2, wrong attestor fails, unsorted pair fails, wave by a third party fails, wave transfers exact amount. Mutation proof: remove attestor check, show red, restore.

## Server

Env: `ATTESTOR_SECRET_KEY` (base58 64-byte), `RELAYER_SECRET_KEY` (base58, pays fees), `TOKEN_SECRET` (random), `DEVNET_RPC_URL`, `MAINNET_RPC_URL`.

- `POST /session` `{wallet, message, signature}`: message `passersby sign-in\nwallet: <w>\nissued: <unix>` (300 s skew), verify ed25519, SGT lookup on mainnet (copy logic from ../headcount/api/lib/sgt.ts). Returns `{ sessionToken (HMAC-signed wallet|identity|tier|exp, 24 h), identity, tier }`.
- `GET /beacon` (bearer session): returns `{ token, epoch, expiresAt }` where token = first 16 bytes of HMAC-SHA256(TOKEN_SECRET, identity || epoch), epoch = floor(now/300). Server keeps a map token -> {identity, wallet, tier, epoch} for current and previous epoch.
- `POST /sightings` (bearer) `{ sightings: [{token, rssi, at}] }`: resolve each token; ignore self, unknown or stale (epoch older than previous). Store directed sighting (observer -> observed, epoch). If the reverse direction exists within the same or adjacent epoch, confirm: build attestation, sign, send `[ed25519, record_encounter]` to devnet from the relayer, wait for confirmation, return the encounter in the response `{ confirmed: [{ other: {identity, wallet, tier}, signature, encounter }] }`.
- `GET /encounters?identity=` returns on-chain Encounter accounts for that identity (getProgramAccounts with memcmp on lo or hi), newest first, plus the Profile.
- `GET /health`.

In-memory sighting store with 15-minute expiry is fine (state of record is on-chain).

## App screens

- Radar (home): pulsing ring, "N phones nearby now" from live sightings, your streak, today's encounters. Bluetooth permission flow inline. Broadcasting starts after session; token refreshes every epoch; sightings batched to `/sightings` every 10 s.
- Encounter card: other party (.skr name if resolvable, else short address), Verified Seeker badge, time, wave button (1/5/10 SKR) via MWA signAndSend of `wave`.
- Passport (profile): total encounters, verified encounters, streak, waves received.
