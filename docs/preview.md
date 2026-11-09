# Digest preview

Issue [#7](https://github.com/Alinro/mega-s01e04-before-i-looked/issues/7) prepares a
public review copy; [#8](https://github.com/Alinro/mega-s01e04-before-i-looked/issues/8)
removes its marker after review (ADR 0003). Publication still requires explicit approval.
Never commit the HTML or marker, or attach the HTML to issues or chat. Markers are public
review labels, never secrets.

Install Node 22+ and pnpm 11, then run from the checkout:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
mkdir -p /tmp/rig-preview
node scripts/save-preview.mjs marked /tmp/rig-preview/index.html
```

Set `LANE_MARKER` in the environment or ignored `.env` before the last command. Do not
paste a real marker into a shared terminal transcript. The helper serves rig's actual app
and configuration on an ephemeral `127.0.0.1` port, requests `GET /digest/2026-10-28`,
and saves its self-contained HTML response. It stops the server and refuses output inside
the checkout. The output parent directory must already exist. No heartbeat is needed for
this snapshot. The command prints only the output path, never the HTML or marker.

The intended public URL is <https://alinro.github.io/mega-s01e04-before-i-looked/>.
The manual `Digest preview` Actions workflow builds from committed template sample data,
accepts a public marker string, and deploys only the temporary `index.html` through GitHub
Pages. It never takes an HTML body as an input. Pushing commits does not publish anything.
The workflow must first be pushed with a token allowed to update workflows, and Pages
must use GitHub Actions as its source. Both setup and a marked deployment need approval
before they are performed. Once approved, run the workflow manually on `main`, select
`marked`, and provide the marker. Never supply a secret: workflow inputs remain in run
history. The uploaded deployment artifact is deleted after deployment finishes (also on
failure); its expiry is one day if cleanup is interrupted. Check the cleanup step succeeded.

After review, obtain distinct approval to overwrite that same public URL with a clean copy.
Generate the local clean copy with:

```sh
node scripts/save-preview.mjs clean /tmp/rig-preview/index.html
```

Clean mode explicitly sets an empty `LANE_MARKER` before loading `.env`; rig normalizes
that value to no marker, so even a marked `.env` renders `no marker set`. After cleanup
approval, manually run the same Pages workflow with mode `clean` and leave the marker
input empty. Verify the public banner reads `no marker set`, then complete issue #8.
Issue #7 stays open until the approved public link and plan issues reach the reviewer.
