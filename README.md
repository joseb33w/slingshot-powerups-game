# SlingBloom

SlingBloom is a rebuilt slingshot arcade game focused on fast, reliable release controls and a polished visual experience.

## What changed

- Rebuilt the whole app from scratch with plain HTML, CSS, and JavaScript.
- Removed the sign-in gate so the game starts immediately and avoids backend/auth latency.
- Reworked the slingshot release system so shots launch on pointer-up, pointer-cancel, lost pointer capture, and window blur.
- Added trajectory preview, responsive canvas scaling, moving bloom targets, particles, round scoring, accuracy, local saved progress, run history, and a power-up shop.
- Designed a bright creative garden/arcade interface with readable cards, colorful controls, and mobile-friendly layout.

## Controls

- Touch or mouse: drag from the sling area, pull back, release.
- New Round: resets the current run.
- Bank Score: saves the current run points to the local wallet.
- Shop: spend points on one-use power-ups.

## Tech

- Static HTML
- Canvas rendering
- LocalStorage persistence
- No build step required

## Preview

Open `index.html` or use the app preview.
