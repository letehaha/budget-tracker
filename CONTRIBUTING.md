# Contributing to MoneyMatter

Thanks for your interest in contributing. Bug reports, fixes, and features are
all welcome. This page explains the two things every contribution needs: the
license it lands under, and the one-time agreement you sign.

## License and the CLA (please read before your first PR)

MoneyMatter is distributed to the public under the
[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0). Your
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

## How to contribute

1. **Open an issue first** for anything non-trivial (new feature, larger
   refactor, behavior change). It saves you building something that doesn't fit
   the project's direction. Small fixes can go straight to a PR.
2. **Fork the repo** and create a branch for your change.
3. **Make your change**, following the conventions already in the codebase.
4. **Run the checks** before opening the PR:
   - Lint / type-check and tests should pass locally.
   - The CI workflow (`.github/workflows/check-source-code.yml`) runs the same
     checks on your PR.
5. **Open a pull request** against the default branch. Describe what changed and
   why, and link the related issue.
6. **Sign the CLA** when the bot asks (see above).

## Commit and PR conventions

- Keep pull requests focused – one logical change per PR is easier to review.
- Write clear commit messages describing what changed and why.
- Don't include unrelated formatting churn or dependency bumps in a feature PR.

## Reporting bugs and requesting features

- Use GitHub Issues. Include steps to reproduce, what you expected, and what
  actually happened. For UI issues, a screenshot or short recording helps a lot.

## Questions

Open an issue or start a discussion. Thanks for helping make MoneyMatter better.
