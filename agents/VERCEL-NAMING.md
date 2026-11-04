# Vercel deployment naming (LearnGeo)

How preview and production deployments are labeled, what you can change,
and how to make future deploys easier to find. Project: **learngeo** on
team **jerky-boys**. Production domain: **www.learngeo.app**.

## Hard rules

- Production = merges to `main` only.
- Never `vercel --prod`, never `vercel promote`, never promote a Preview in
  the dashboard. (See `CLOUD-MASTER.md`.)
- Do not try to rename an existing `*.vercel.app` deployment hostname. The
  unique hash URL is **immutable** for that deployment.

## What each URL means

| Kind | Pattern | Purpose | Mutable? |
| --- | --- | --- | --- |
| Unique deployment | `learngeo-<hash>-jerky-boys.vercel.app` | Pin one exact build (commit). | No — hash is permanent. |
| Git branch preview | `learngeo-git-<branch-slug>-jerky-boys.vercel.app` | Latest deploy for that branch; updates on push. | Slug follows the branch name. Rename the **branch** before first deploy if you want a clearer URL. |
| Project / production alias | `learngeo-jerky-boys.vercel.app`, custom domains | Current production (and project aliases). | Domains/aliases can be reassigned; do not touch Production aliases from agents. |
| Custom alias | any domain you own, or an allowed `*.vercel.app` alias | Human-readable label for an important Preview. | Yes — assign with `vercel alias` / API after auth. |

Dashboard titles for Git deployments come from the **commit message** (and
branch). Prefer first-line subjects like `Add Pets marketplace (LEA-16)` so
the Vercel list is scannable.

## Conventions for clearer previews

1. **Branch names are preview labels.** Use
   `cursor/<short-topic>-<4hex>` (already the Cursor cloud pattern). That
   yields shareable URLs such as
   `https://learngeo-git-cursor-pets-mutations-marketplace-050c-jerky-boys.vercel.app`.
2. **Prefer the git-branch URL** when sharing a PR for review. Prefer the
   hash URL only when you need a frozen build.
3. **Commit subjects:** lead with the user-facing change and the task id
   (`LEA-N`). Avoid bare `wip` / `fix` on commits that will deploy.
4. **Important long-lived previews:** after team auth, assign a readable
   alias (e.g. a subdomain under a LearnGeo-owned domain) instead of
   circulating the hash. Do not alias anything onto Production domains.
5. **`vercel.json`** only configures rewrites/headers/build behavior. It
   cannot rename deployments or change generated URL hashes.

## How to find a deployment without the dashboard

GitHub Deployment statuses (creator `vercel[bot]`) expose the unique
Preview/Production URL as `environment_url` / `target_url` on each
deployment status. Commit status context `Vercel` points at the dashboard
page under `https://vercel.com/jerky-boys/learngeo/...`.

## Agent checklist

- [ ] Branch name readable (`cursor/<topic>-xxxx`)
- [ ] Commit / PR title includes `LEA-N` when applicable
- [ ] Share **git-branch** preview URL, not only the random hash
- [ ] Never promote; only merge to `main` for Production
- [ ] Passkeys work only on `www.learngeo.app` — Preview URLs will not
      exercise real passkey sign-in
