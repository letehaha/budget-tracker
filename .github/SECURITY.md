# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately through GitHub's advisory form:
https://github.com/letehaha/budget-tracker/security/advisories/new

Please include:

- What the issue is and its impact
- Where it happened: `moneymatter.app` or a self-hosted instance (with the image
  tag or the "App version" shown in the sidebar)
- Steps to reproduce, or a proof of concept

You will get an acknowledgement within 7 days. MoneyMatter is maintained by one
person, so fixes are best effort, but confirmed issues are treated as top
priority. You will be credited in the advisory unless you ask otherwise.

If you used an AI tool to find the issue, say so and make sure you have
reproduced it yourself against a real instance before reporting.

## Scope

- The hosted service at `moneymatter.app`
- The published Docker images `letehaha/budget-tracker-be` and
  `letehaha/budget-tracker-fe`
- This repository's source code

Out of scope:

- Misconfiguration of a self-hosted deployment (exposed database or Redis
  ports, weak `.env` secrets, reverse-proxy setup)
- Vulnerabilities in third-party services the app connects to (bank data
  providers, AI providers, Crowdin)
- Denial of service, rate limiting, or missing security headers without a
  demonstrated impact

## Supported versions

Only the latest release and the `latest` Docker images receive security fixes.
Self-hosters should stay on a recent release.
