# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest preview

The digest routes use the same server-rendered HTML and inline stylesheet as the status board.
To capture the review page as one HTML file, keep the course-provided marker in the ignored
`.env` and run:

```sh
bash scripts/capture-preview.sh marked
```

The default output is `/tmp/opencode/s01e04-preview/marked.html`, outside this repository.
The script checks the fixture content, marker, and absence of client scripts or external assets.
Do not commit or attach preview files. The `Deploy digest preview` GitHub Actions workflow builds
the selected copy into a Pages artifact; it does not commit the HTML. After review, the unmarked
version can be deployed to the same public URL once cleanup is approved.
