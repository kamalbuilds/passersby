# Passersby design system: Sodium night

Hallmark · genre: atmospheric · theme: custom tuned (vibe: "city at night, sodium streetlights, strangers passing") · paper dark / grotesk-sans / warm accent

Passersby is a walk through a city after dark. The only light comes from sodium-vapor streetlamps: warm amber pools on blue-black. Other phones are people you pass under those lamps. Encounters are transit-ticket stubs you keep.

## Tokens (constants/theme.ts is the only place these values live)

```
color.night        #0B0E14   ground
color.night2       #121722   raised surfaces (ticket stubs, sheets)
color.night3       #1B2230   pressed / inset
color.line         #263042   hairlines, dashed perforations
color.text         #F2EBDD   primary text (warm white, never pure #fff)
color.text2        #A9A293   secondary
color.text3        #6B6759   captions, disabled
color.sodium       #FFB547   the one accent: lamp light, blips, primary action, streak
color.sodiumDim    #FFB547 at 14% alpha   lamp pool glow
color.sodiumInk    #1A1206   text on sodium
color.seeker       #7FE3C4   Verified Seeker badge only (a cool counter-light, used sparingly)
color.warn         #FF7A59   errors (Bluetooth off, permission denied)

font.display       Space Grotesk (500, 700). Headlines, counts
font.mono          JetBrains Mono (400, 600). Addresses, times, labels, buttons

text.hero          Space Grotesk 700, 40/42, letterSpacing -0.5
text.title         Space Grotesk 700, 24/28
text.body          Space Grotesk 500, 16/22
text.label         JetBrains Mono 600, 11, letterSpacing 1.5, UPPERCASE
text.mono          JetBrains Mono 400, 13
text.count         Space Grotesk 700, 64/64, tabular

space              4 8 12 16 24 32 48 64
radius             ticket 6, button 999 (pill), badge 4
```

Fonts via `@expo-google-fonts/space-grotesk` and `@expo-google-fonts/jetbrains-mono`, loaded before the splash hides.

## Signature moves

1. **The street (Radar)**: not a sci-fi radar. A top-down street at night: your phone is a lamp at center drawn as a soft sodium pool (radial gradient circle from sodiumDim to transparent, built with react-native-svg). Each nearby phone is a small warm dot whose distance from center maps to RSSI (-40 close, -95 far) and whose angle is stable per token (hash). Dots fade in over 300ms when first seen and fade out after 60s unseen. One slow breathing scale (1.0 to 1.04, 4s) on your own lamp only, disabled under reduced motion. No sweeping beam.
2. **Count**: under the street, `text.count` number + `text.body` "phones within reach". When zero: "Quiet street. Keep Passersby open while you walk."
3. **Encounter arrival**: a new confirmed encounter slides up from the bottom as a ticket stub (night2, dashed perforated left edge drawn as a column of small circles cut in line color), with mono `PASSED · 21:04`, the other party's short address, and the Verified Seeker badge if verified. Haptic: notificationSuccess. The stub then files into the list.
4. **Ticket stubs (Encounters)**: each encounter is a stub: left section mono time + date stacked, perforation, right section address + badge + `WAVE` action. Waving opens an inline row of three pill amounts `1 · 5 · 10 SKR`; choosing one turns the stub's right section sodium for the send, then shows `WAVED 5 SKR` in mono.
5. **Passport**: your night log. Big count of encounters, a row of 14 small lamp dots showing the last 14 days (lit = had an encounter, unlit = line color), verified count, waves received. Tier badge: `SEEKER VERIFIED` (seeker color) or `WALLET ONLY` (text3) with one line on what a Seeker Genesis Token is.

## States

Every pressable: default · pressed (night3 ground, or sodium darkened 12%) · focus (2px sodium ring, instant) · disabled (text3, no fill) · loading (three sodium dots pulsing in sequence) · error (warn text with the fix action) · success (mono confirmation line plus haptic).

Bluetooth off: the street draws with no lamp light (all line color) and one action `TURN ON BLUETOOTH`. Permission denied: same treatment with `ALLOW NEARBY DEVICES` opening settings.

## First 60 seconds

Before connecting: the street renders with your lamp unlit and the line "Walk past another Seeker. Both phones remember." Primary pill `CONNECT WALLET`. No signup, no tutorial carousel.

## Motion

Only: dot fade in/out (300ms), lamp breathing (4s, own lamp only), stub slide-up (260ms ease-out), amount reveal (180ms). Reduced motion: no breathing, instant fades.

## Copy voice

Quiet, nocturnal, specific. "Passed", "within reach", "wave". Never "Oops", never "No data", never "Web3". Errors say what is off and how to fix it.

## Bans

No neon gradients, no purple, no glassmorphism, no sweeping radar beams, no grid of stat tiles, no italics in headings, no emoji, no em dashes, no Inter, no pure white or pure black.
