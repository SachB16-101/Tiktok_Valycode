# Blueprint

A habit tracker for health and appearance that grades its own evidence, and
turns the unproven half into trials you can actually run.

Offline, installable, and entirely local. No account, no backend, no network
calls of any kind.

## Run it

```bash
node blueprint/scripts/serve.mjs      # http://localhost:4321
```

There is no build step. It is plain HTML, CSS and ES modules, but a service
worker and module imports both need a real http origin, so opening
`index.html` off the disk will not work.

To use it on your phone, serve it from your machine and open the LAN address
on the same network, or host the folder on any static host. Then use **Add to
Home Screen**. It installs, runs full screen, and works with no signal.

## Why it is built this way

Most habit trackers are a flat list of checkboxes. That quietly lies to you:
ticking *thumbpulling* feels exactly like ticking *eight hours of sleep*, and
after a few weeks the cheap ticks crowd out the expensive ones. A tracker that
cannot tell the difference between a well-evidenced habit and an unproven one
is not neutral. It is endorsing both.

So every habit carries a tier and an evidence grade, and both are visible on
the row.

| Tier | Weight | What it means |
|---|---|---|
| **Foundation** | 2 | Large effect, well evidenced |
| **Compounding** | 1 | Real effect, smaller or slower |
| **Experimental** | 0 | Mechanism disputed or unsupported |

Experimental habits are tracked in full and **never scored**. They get a dashed
tick and their own section headed "Tracked, not scored". You can run every one
of them. They just cannot make a bad week look like a good one.

Open any habit and you get why it earns its place, with the source. Open an
unproven one and you get the claim in its proponent's own framing, the
counter-evidence next to it, and any safety caution that applies.

## Trials

The honest answer to "but he has case studies".

A case study is the weakest evidence there is: self-selected, self-reported,
uncontrolled, and photographed by the person selling the outcome. You cannot
run a controlled trial on yourself, but you can fix the four things that make
a personal result worth something:

1. **A baseline**, recorded before you start and locked afterwards.
2. **An endpoint**, written down in advance. The app refuses to start a trial
   without one, because a trial with no endpoint cannot fail.
3. **A fixed duration**, so it ends whether or not you like the answer.
4. **Adherence reported with the result.** "It did not work" and "I did it
   nine times" are different findings, and below 70 percent the close-out
   screen says so.

Run one at a time. Change five things and you learn nothing about any of them.

## What it tracks

54 habits across sleep and breathing, food, training, skin, face and jaw,
mouth, grooming and recovery. Twelve are on by default; the rest are in the
Library, switchable.

Measurements matter more than ticks, so the Body screen carries waist at navel
(with the 90 cm threshold that applies to Asian men, not the European one),
bodyweight, progress photos, and a blood panel reminder.

Every four weeks the app asks for a review and lets you change **one** thing.

## Your data

Everything is on the device. Structured data in `localStorage`, photos in
IndexedDB, downscaled to 1280px on the long edge before they are stored.

Nothing is uploaded, there is no account, and there is no server copy. Export
writes a single JSON file with the photos inlined; import restores it. Delete
removes all of it permanently.

## Layout

```
index.html          shell, with the icon sprite inlined
styles.css          tokens and every component
js/habits.js        the corpus: 54 habits, tiers, evidence, sources
js/store.js         localStorage and IndexedDB, export and import
js/score.js         adherence, weighting, trial adherence
js/ui.js            hyperscript helper, icons, the sheet
js/views/           today, body, trials, library, settings
sw.js               offline precache
scripts/serve.mjs   local static server
scripts/build-icons.sh  regenerates the Phosphor sprite
```

## Design notes

Space Grotesk and IBM Plex Mono, both self-hosted so the app works with no
network. One accent colour throughout; amber appears only as a data semantic
for a measurement over its threshold or something overdue, never as decoration.
Radii are locked at 14px for surfaces and 10px for controls. Light and dark are
both first-class and follow the system unless you override them.

Mobile first. The desktop layout moves the tab bar to a sidebar and changes
nothing else.

## Not medical advice

Bloods, hair treatments and anything prescription need a GP or a dermatologist
who can examine you. If tracking any of this starts feeling less like a project
and more like a compulsion, that is worth talking to someone about.
