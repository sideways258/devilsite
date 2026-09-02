# Devils in the Details — site + 3D co-op game

A small colourful marketing site **and** a playable 3D side-scroller, served by one
tiny Node server. The game is plain ES modules + [Three.js](https://threejs.org)
(vendored, no build step). Multiplayer is a lightweight WebSocket relay in the
same process.

```
public/                 ← everything served to the browser
  index.html            landing page
  styles.css  script.js
  game.html             the game
  game.css
  js/
    main.js             glue: loop, input, HUD, net wiring
    scene.js            three.js renderer / camera / lights
    level.js            level geometry, themes, enemy roster
    player.js           hero "Details" + remote-player ghosts
    enemies.js          the 5 devil types + Baron Marrow (boss)
    dialog.js           typewriter text box
    story.js            the script (all dialogue lives here)
    net.js              WebSocket client + offline/solo fallback
  vendor/three.module.js
server/
  server.js             static file server + multiplayer relay
  package.json          one dependency: ws
Dockerfile  docker-compose.yml
.github/workflows/docker-publish.yml
```

## The game — "Details Runs the House"

The house swallowed Cora through the living-room floor. You play as **Details**,
crossing three rooms (Living Room → Kitchen → Basement) to get her back from
**Baron Marrow**, who is sitting on a throne of stolen remote controls.

It renders in 3D (perspective camera, real lights, shadows, fog) but plays as a
strict side-scroller — X to run, Y to jump, depth is locked.

**Five devil types**, each with distinct behaviour:

| Devil | Colour | Behaviour |
|-------|--------|-----------|
| The Untier  | flame | paces a stretch of floor |
| The Swapper | pink  | goes intangible, then blinks a step closer |
| The Flicker | gold  | winks in and out on a beat; only solid while visible |
| The Gnawer  | green | hops toward you in arcs |
| The Smudge  | smoke | drifts through the air on a sine wave |

Catch a devil by landing on its head. Bump one any other way and you lose a
heart (they refill over time; no game over — you respawn at the last checkpoint).
Collect misplaced **socks** for score. Baron Marrow takes three stomps, but only
while he stops to gloat.

**Story & dialogue** — a classic typewriter text box. All lines are in
`public/js/story.js`; beats fire as you walk past fixed points in the level and,
in multiplayer, are kept in sync and in order by the server.

### Multiplayer

Everyone who enters the same **room** name lands in the same house and sees each
other move in real time (translucent coloured "ghosts"). Enemy kills, story
progress, stage changes, boss HP and the win state are all synced. Press **T** to
chat. Share a room with `?room=NAME` in the URL.

If there is no server (page opened from a file, relay unreachable) the game
detects it and runs **solo** with the same content — the HUD shows `offline — solo`.

### Controls

| | |
|---|---|
| Move | `←` `→` or `A` `D` |
| Jump | `Space`, `W`, or `↑` |
| Advance dialogue | `Space` / `Enter` |
| Chat (online) | `T` |
| Restart the room | `R` |

On phones/tablets, on-screen buttons appear automatically.

## Run it locally

```bash
cd server
npm install
npm start          # serves http://localhost:8080  (site + game + multiplayer)
```

Open two browser tabs on `http://localhost:8080/game.html`, enter the same room
name in both, and you're playing co-op.

## Docker

The image is now a Node server instead of static nginx.

```bash
docker compose up -d --build      # http://localhost:8088
```

`docker-compose.yml` maps host `8088` → container `8080`. WebSockets run on that
same port, so any reverse proxy in front of it must forward the
`Upgrade` / `Connection` headers (Nginx Proxy Manager: enable "Websockets
Support"; SWAG: the sample proxy confs already do this).

### GitHub Actions → GHCR (unchanged workflow)

`.github/workflows/docker-publish.yml` still builds `linux/amd64` + `linux/arm64`
on every push to `main` and publishes to
`ghcr.io/<user>/<repo>:latest`. Nothing to configure — it uses the automatic
`GITHUB_TOKEN`. Make the package public if your host pulls anonymously.

## Editing content later

- **Dialogue / story beats** — `public/js/story.js`
- **Level shape, enemy placements, room themes** — `public/js/level.js`
- **Landing-page copy** — `public/index.html`

Commit, push, and Actions rebuilds the image; on the host, `docker compose pull &&
docker compose up -d` (or "Force Update" in the Unraid GUI).
