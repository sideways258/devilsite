# Devils in the Details — landing page + playable demo

A one-page, colorful landing site plus a browser side-scroller demo. Plain HTML/CSS/JS served by nginx — no build step, no dependencies.

```
index.html          landing page
styles.css
script.js            hero "spot the devil" widget
game.html           playable side-scroller ("Details Runs the House")
game.css
game.js             canvas game: hero Details + 5 devil types
Dockerfile
docker-compose.yml
.github/workflows/docker-publish.yml
```

## The game

`game.html` is a self-contained canvas side-scroller reachable from the landing
page's **Play the demo** buttons. You play as **Details** and cross the house,
landing on devils to catch them before you reach the far door. Five devil types,
each with its own behaviour:

| Devil | Behaviour |
|-------|-----------|
| The Untier | paces a stretch of floor back and forth |
| The Swapper | blinks out, then reappears a step closer to you |
| The Flicker | winks in and out on a beat; only solid while visible |
| The Gnawer | hops in arcs toward you |
| The Smudge | drifts through the air on a sine wave |

Controls: arrows / WASD to move, Space / Up / W to jump, P to pause, R to
restart. On touch devices, on-screen buttons appear.

## 1. Push this to GitHub

```bash
cd devils-site
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

(Create the empty repo on GitHub first — github.com → New repository — then use its URL above.)

## 2. Let GitHub build the Docker image for you

This repo includes `.github/workflows/docker-publish.yml`, a GitHub Actions workflow that automatically:

- builds the Docker image on every push to `main`
- publishes it to GitHub Container Registry (GHCR) as `ghcr.io/YOUR-GITHUB-USERNAME/YOUR-REPO-NAME:latest`
- builds for both `amd64` and `arm64`, so it runs on Unraid regardless of CPU

No extra setup needed — it uses the automatic `GITHUB_TOKEN`, nothing to configure. After your first push, check the **Actions** tab on GitHub to watch it build (~1 minute).

By default, GHCR packages are private. Make it public so Unraid can pull it without logging in:
`github.com/YOUR-GITHUB-USERNAME?tab=packages` → click the package → **Package settings** → **Change visibility** → **Public**.

## 3. Run it on Unraid — no local build required

Edit `docker-compose.yml` and replace `YOUR-GITHUB-USERNAME/YOUR-REPO-NAME` with your actual repo, then:

### Option A — Compose Manager plugin
1. Install **Compose Manager** from Community Apps if you don't have it.
2. Copy `docker-compose.yml` to `/mnt/user/appdata/devils-site/` on Unraid (this file alone is enough — Unraid just pulls the pre-built image).
3. Compose Manager → add stack pointing at that folder → **Compose Up**.
4. Visit `http://<your-unraid-ip>:8088`.

### Option B — Unraid's "Add Container" GUI
1. **Docker → Add Container**.
2. Repository: `ghcr.io/YOUR-GITHUB-USERNAME/YOUR-REPO-NAME:latest`
3. Port mapping: Container Port `80` → Host Port `8088` (or any free port).
4. Apply. Unraid pulls the image straight from GHCR — nothing to build.

### Option C — plain `docker` commands over SSH
```bash
docker pull ghcr.io/YOUR-GITHUB-USERNAME/YOUR-REPO-NAME:latest
docker run -d \
  --name devils-in-the-details \
  --restart unless-stopped \
  -p 8088:80 \
  ghcr.io/YOUR-GITHUB-USERNAME/YOUR-REPO-NAME:latest
```

## Updating the content later

Edit `index.html` / `styles.css` / `script.js`, then:

```bash
git add .
git commit -m "Update copy"
git push
```

GitHub Actions rebuilds and republishes the image automatically. On Unraid, just re-pull and restart the container:

```bash
docker compose pull && docker compose up -d
```

(or in the GUI: click the container → **Force Update**).

## No internet access from Unraid to GHCR?

Uncomment the `build: .` line in `docker-compose.yml` (and comment out `image:`), then clone the repo onto Unraid directly and run `docker compose up -d --build` — this builds locally from source instead of pulling a pre-built image.

## Putting it behind a domain name

If you're already running **Nginx Proxy Manager** or **SWAG** on Unraid, point a proxy host at `http://<unraid-ip>:8088` and it'll pick up SSL/your domain the same way your other containers do.
