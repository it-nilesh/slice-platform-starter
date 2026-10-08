# Slice framework

A **slice** is one business capability, owned end to end by one team:

```
<name>-api      .NET 10 microservice      backend/src/Services/<Pascal>/
mfe-<name>      React microfrontend       frontend/apps/mfe-<name>/
slice: <name>   its own CI/CD pipeline    .github/workflows/slice-<name>.yml
```

The framework gives every slice the same shape, the same pipeline and the same
runtime contract. That is what lets slices be built, released and deployed
**independently**, without touching the shell, the gateway image, or each other.

## The `./slice` CLI

Uses Node built-ins only (Node ≥ 22). Run it from the repo root.

| Command | What it does |
|---|---|
| `./slice create <name> [--label "Text"] [--owner @org/team]` | Generates the API + tests, the MFE, the pipeline, Compose services and dev ports, and adds the projects to the solution. Optionally assigns CODEOWNERS. |
| `./slice register <name> [--route /path] [--order N] [--reload]` | Takes a deployed slice live: adds it to the MFE manifest and the gateway allowlist, validated and rolled back on error. |
| `./slice disable <name>` / `enable <name>` | Kill switch. Hides or shows the MFE on the next page load; no reload needed. |
| `./slice unregister <name> [--reload]` | Takes a slice offline (manifest + allowlist). |
| `./slice ci <name>` / `./slice ci --all` | Regenerates pipelines from the template, e.g. after a framework upgrade. |
| `./slice remove <name> --yes` | Deletes a generated slice and every reference to it. |
| `./slice list` | Shows each slice: code present, pipeline present, allowlisted, live/disabled. |

Names: lowercase letters, digits and single hyphens (`inventory`, `loyalty-points`).
`shell`, `gateway`, `api`, `mfe`, `config`, `assets`, `healthz`, `contracts` and `tools` are reserved.

### Lifecycle of a slice

```bash
./slice create inventory --owner @acme/inventory-team   # 1. scaffold (commit + PR)
#    PR → "slice: inventory" pipeline: test, build, scan (nothing pushed)
#    merge → pushes ghcr.io/<owner>/<repo>/inventory-api:sha-abc1234 (+ :main)
#            and           ghcr.io/<owner>/<repo>/mfe-inventory:sha-abc1234

docker compose up -d --build --no-deps inventory-api mfe-inventory   # 2. deploy (or your CD)
./slice register inventory --reload                                  # 3. go live, no shell redeploy

git tag inventory-v1.0.0 && git push --tags                          # 4. release → :1.0.0 images
```

## CI/CD

```
.github/
├── actions/container-image/       build → Trivy scan → push → SBOM + signed provenance (one policy for every image)
├── workflows/
│   ├── _build-dotnet-service.yml  reusable: dotnet test → container-image
│   ├── _build-mfe.yml             reusable: npm typecheck/test/build → container-image
│   ├── slice-<name>.yml           GENERATED per slice (thin caller of the two above)
│   ├── shell.yml                  platform: the host app
│   └── gateway.yml                platform: NGINX + manifest/allowlist validation
├── dependabot.yml                 React/MF upgraded as one group, so shared singletons never drift
└── CODEOWNERS                     per-slice ownership (managed by ./slice)
```

**Independence.** Each slice's pipeline only runs when that slice's files (or the shared
framework files it depends on) change. Inside the pipeline, `dorny/paths-filter` decides
which half to build: an MFE-only change never rebuilds the API, and vice versa.

| Event | What happens |
|---|---|
| Pull request | Test + build + scan the changed half. Nothing is pushed. |
| Push to `main` | Same, then push `sha-<short>` and `main` tags. |
| Tag `<name>-v1.2.0` | Build both halves and push `1.2.0` tags (a release of that slice only). |
| Manual (`workflow_dispatch`) | Build both halves. |

**Image policy (every image, enforced by the composite action):**
- Fails on any **fixable CRITICAL/HIGH** vulnerability (Trivy). Add accepted exceptions to a `.trivyignore` at the repo root, with a justification comment.
- Never tags `latest`. Deploy immutable `sha-*` or semver tags.
- SBOM + `mode=max` provenance attached to the image, plus a GitHub artifact attestation
  (`gh attestation verify oci://ghcr.io/<owner>/<repo>/<image>:<tag> --owner <owner>`).
- All third-party actions are pinned to commit SHAs; Dependabot keeps them current.
- Least-privilege `GITHUB_TOKEN`: read-only by default; `packages`/`attestations`/`id-token` write only on image jobs.

**Which pipelines does a change trigger?**

| You change | Pipelines that run |
|---|---|
| `frontend/apps/mfe-orders/**` | `slice: orders` (MFE half only) |
| `backend/src/Services/Orders/**` | `slice: orders` (API half only) |
| `backend/src/BuildingBlocks/**` | every slice's API half |
| `frontend/packages/contracts/**` or `package-lock.json` | every slice's MFE half + `shell` |
| `gateway/config/**` (register/unregister) | `gateway` (validation; the image is optional because config is mounted) |
| `frontend/apps/shell/**` | `shell` only |

## Changing the framework

- **Templates** live in [`templates/`](templates/) and mirror the repo layout. Tokens:
  `__NAME__` (kebab), `__PASCAL__`, `__UPPER__` (env-var form), `__LABEL__`, `__API_PORT__`, `__MFE_PORT__`.
  New slices pick up template changes automatically. Existing slices' **code** is theirs to evolve.
- **Pipeline changes** go into the reusable workflows or the composite action, and every slice
  inherits them immediately. Change `templates/.github/workflows/slice-__NAME__.yml.tmpl` only for
  trigger/path changes, then run `./slice ci --all`.
- **Runtime contract** (`@mfe/contracts`, `RemoteAppProps`, manifest schema): additive changes only.
  Every slice deploys on its own schedule, so old and new versions always run side by side.
