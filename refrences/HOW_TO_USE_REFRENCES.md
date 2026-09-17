# How to use `refrences/` when building the Setu gateway frontend

This folder is **design reference material**, not a spec to copy-paste.
Use it to guide the look, tone, and structure of the real Setu gateway
frontend (the citizen-facing dashboard that talks to the three actual
department sites) — aim to match it roughly 90%, then adapt the last
10% to fit what the real backend actually does. Do not lift text or
markup verbatim unless it's clearly just placeholder copy.

## What's in here and how to treat each piece

- **`hero1.txt`, `hero2.txt`** — Two candidate versions of the hero
  section copy (headline + subtext). Read both, pick whichever fits
  the real project better, or blend them. These describe *intent and
  tone*, not final wording — reword anything that references a
  department, document, or flow that doesn't match the real system
  (Digital Tax Records / National Identity Registry / Driving Licence
  & Jan Aadhaar Portal).

- **`button1.txt`, `button2.txt`, `butten.jpeg`, `2butten.jpeg`** —
  Button copy and visual reference for primary/secondary CTAs. Use
  these for wording and visual style (shape, weight, hierarchy) of
  buttons across the app — not literal pixel values unless the image
  makes a specific choice obvious (e.g. pill vs. rounded-rect).

- **`feature1.txt`, `feature_examples.jpeg`** — Feature-section content
  and layout reference. Use this to decide what capabilities get
  surfaced on the dashboard/landing area and how they're grouped.

- **`lock screen 1.txt`** — Reference for the locked/auth-gated state
  (what a user sees before logging in, or a session-expired state).
  Match the tone and structure; adapt any copy referencing services
  Setu doesn't actually have.

- **`signin.txt`, `signup.txt`** — Reference copy/flow for the
  authentication screens. Use as the backbone for the real login/
  register flow, adjusted to whatever auth method the gateway actually
  uses (this is the one area where you should double check against the
  actual gateway auth implementation before matching the reference
  exactly — don't let stale reference copy imply an auth flow that
  doesn't exist yet).

- **`background.txt`** — General background/context notes. Treat as
  supporting context, not a literal content block to insert anywhere.

- **`dashboard.png`, `scrolanimation.png`** — Full-screen visual
  references. Use these as the primary look-and-feel target for the
  dashboard layout and any scroll-triggered motion/animation — closer
  to spec than the `.txt` files, since these are direct screenshots
  rather than notes.

- **`setu_sih26129_demo.html`** — A structural/interaction reference
  already updated to reference the real three department sites
  (Digital Tax Records, National Identity Registry, Driving Licence &
  Jan Aadhaar Portal). Use this for page structure, view-switching
  pattern (tabs → sections), the consent-modal flow, and the chat
  assistant pattern. It's the closest thing in this folder to "close
  to final" — but it's still a static mock with fake data, not wired
  to the real gateway backend.

## The 90/10 rule

- **90%**: Match tone, structure, section order, and visual language
  across all of the above.
- **10%**: Reconcile against reality — real department names, real
  auth method, real data shapes, real endpoints. If a reference file
  implies something the actual gateway doesn't do yet, flag it back
  instead of building fake functionality to match the mock.

## What NOT to do

- Don't treat these as final copy to insert unedited.
- Don't invent backend behavior just to make the frontend match a
  reference image — if the reference shows something the gateway
  can't do yet, say so instead of stubbing it silently.
- Don't discard files that seem redundant (e.g. `hero1.txt` vs
  `hero2.txt`) without saying which one you picked and why.
