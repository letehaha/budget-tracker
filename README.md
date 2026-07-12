# Budget Tracker (MoneyMatter)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A personal budget tracking application. Track your balances and transactions with bank connections or manual entry, categorize and analyze expenses and income, and many more.

## Local Application setup

To set up the application locally, please refer to the [instructions here](./docs/application-setup.md).

## Self-hosting

Run Budget Tracker (MoneyMatter) on your own server: the stack pulls published multi-arch Docker images and exposes the whole app on a single port, so you front it with whatever reverse proxy you already run (Nginx Proxy Manager, Caddy, Traefik, …) – or use the optional bundled Traefik + Let's Encrypt overlay. See the [self-hosting guide](./self-hosting/README.md).

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

- ✅ Free to use, study, modify, and self-host
- ✅ Free to redistribute under the same license
- ✅ Commercial use permitted (sell hosting, support, custom builds, etc.)
- 🔄 Modifications must be released under AGPL-3.0
- 🌐 If you run a modified version as a network service, you must publish your modifications

See [LICENSE](LICENSE) for full details. The project was previously licensed under CC BY-NC-SA 4.0; that license still applies to versions of the codebase prior to the AGPL-3.0 relicensing commit.
