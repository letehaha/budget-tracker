# Contributing to MoneyMatter

Thanks for your interest in contributing. Bug reports, fixes, and features are
all welcome. This page explains the two things every contribution needs: the
license it lands under, and the one-time agreement you sign.

## License and the CLA (please read before your first PR)

MoneyMatter is distributed to the public under the
[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0; see
[LICENSING.md](./LICENSING.md) for the relicensing history). Your
contributions reach everyone under that same license.

In addition, before your first pull request can be merged, you sign a
**Contributor License Agreement** ([CLA.md](./CLA.md)). In plain terms:

- **You keep the copyright to your work.** You are granting a license, not
  giving away or selling your code. You can still reuse your own contribution
  anywhere else you like.
- The CLA grants the maintainer the right to license the project – including
  your contribution – under terms beyond AGPL-3.0 in the future (for example a
  commercial or dual license). This keeps the project's licensing flexible
  without having to chase down every past contributor for permission.
- The project stays publicly available under AGPL-3.0. The CLA does not change
  what the public receives today.

**Signing is automatic and takes one comment.** When you open a pull request, a
bot (CLA Assistant) checks whether you've signed. If not, it posts a link to the
CLA and asks you to reply on the PR with:

> I have read the CLA Document and I hereby sign the CLA

That's it – you sign once and it covers all your future contributions.

> **Contributing on behalf of an employer?** If you write code as part of your
> job, your employer may own the copyright, not you. In that case the individual
> CLA isn't enough – please have someone authorized at your employer contact the
> maintainer so a corporate agreement can be arranged before you contribute.

## Before you start

- **Bugs**: open a [bug report](https://github.com/letehaha/budget-tracker/issues/new/choose).
  Say whether it happened on moneymatter.app or self-hosted, and how to reproduce it.
- **Feature ideas**: post or vote on the [Featurebase board](https://moneymatter.featurebase.app/).
  Most requests already live there.
- **Anything non-trivial you want to build** (new feature, larger refactor, behavior change): open
  an issue first so we agree on the direction before you spend time on it. Small fixes can go
  straight to a PR.
- **Security issues**: report privately via
  [GitHub security advisories](https://github.com/letehaha/budget-tracker/security/advisories/new),
  never in a public issue.
- **Questions**: [Discussions Q&A](https://github.com/letehaha/budget-tracker/discussions/categories/q-a).

MoneyMatter is maintained by Dmytro Svyrydenko, who decides scope and merges.

## Local setup

- Node version from [`.nvmrc`](./.nvmrc) (nvm, fnm, volta, ...) and Docker.
- Full walkthrough: [docs/application-setup.md](./docs/application-setup.md). The short version:

```bash
npm install
npm run generate-ssl-certs    # dev runs over HTTPS
cp .env.template .env.development   # then fill in what you need
npm run docker:dev            # Postgres, Redis, backend, frontend
npm run docker:dev:migrate    # in a second terminal, first run only
```

## Branches and pull requests

- Fork the repo, branch from `dev`, and open the PR against `dev`. `main` is release-only: the
  maintainer merges `dev` into `main` when cutting a release.
- Commit messages and the PR title follow [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): summary`, for example `fix(transactions): keep refund link on edit`. Types in use:
  `feat`, `fix`, `chore`, `docs`, `test`, `ci`.
- Contributor PRs are squash-merged, so the PR title becomes the commit message. Your own commits do
  not need to be signed.
- One logical change per PR. No unrelated formatting churn or dependency bumps.
- Describe what changed and why, link the issue, and add screenshots for UI changes.
  What to expect on a PR from a fork:

- The CLA bot asks you to sign once (see above).
- CI may wait for the maintainer to approve the run on your first PR.
- Preview deployments are only built for branches inside this repo, so a fork PR does not get one.

## AI-assisted contributions

Using AI tools to write code is fine. Submitting code you do not understand is not. An AI-assisted
PR is welcome when:

- You can explain every change in it and why it is there. Expect review questions and answer them
  yourself, not by pasting them into a model.
- You ran it: the app works, the checks pass, the tests you added actually exercise the change.
- It follows the conventions in this file and in the codebase: no invented abstractions, no
  defensive code for cases that cannot happen, no restating-the-code comments, no unrelated
  rewrites.
- It is scoped like a human PR: one logical change, sized so a person can review it.
- You say in the PR description that AI was involved and which tool you used.

PRs that read as unreviewed model output (generic boilerplate, hallucinated APIs, comments and
docstrings on every line, tests that assert nothing, changes nobody asked for) will be closed
without a detailed review. The maintainer's time goes to contributors who engage with their own
code.

## Checks before opening a PR

```bash
npm run lint
npm run typecheck
npm run format
npm run knip
```

Tests:

```bash
npm -w packages/backend run test:unit
npm -w packages/frontend run test:unit
cd packages/backend && npm run test:e2e -- --testPathPattern='<file-or-folder>'   # needs Docker
```

The backend e2e suite runs against a Docker Postgres, so run it one file or folder at a time. CI
(`.github/workflows/check-source-code.yml`) runs the same checks on every PR.

## Tests you are expected to write

- **New backend endpoint**: an e2e test that goes through the HTTP helpers (never call services
  directly) covering the happy path, the empty state and at least one error case.
- **Bug fix**: a test that reproduces the bug first, then the fix. Backend bugs get an e2e test;
  frontend utils and composables get a unit test.

## Code conventions

The full conventions are written for AI coding agents but apply to everyone:
[backend](./.claude/docs/backend-conventions.md) and
[frontend](./.claude/skills/frontend-rules/SKILL.md). The short list:

- File names are kebab-case.
- Functions take a single object parameter: `fn({ a, b })`, never `fn(a, b)`.
- Money is a `Money` instance on the backend and a decimal in the API and the frontend. Never
  convert cents by hand in frontend code.
- Comments describe the current code, not its history. Most code needs none.
- One migration per PR. Edit it while the PR is open instead of adding a second one.

## Translations

- Add or change strings in `en` only: `packages/frontend/src/i18n/locales/chunks/en/` and
  `packages/backend/src/i18n/locales/en.json`.
- Every other language is translated on [Crowdin](https://crowdin.com/project/moneymatter). Do not
  edit those files in a PR: the next Crowdin download overwrites them.
- To fix or add a translation, do it on Crowdin.

## Documentation

- User docs live in [`packages/docs`](./packages/docs) (a standalone Astro Starlight project,
  published at [docs.moneymatter.app](https://docs.moneymatter.app)).
- Self-hosting docs live in [`self-hosting/docs`](./self-hosting/docs).
