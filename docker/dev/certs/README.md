# SSL Certificates for Local HTTPS Development

This directory contains SSL certificates for local HTTPS development.

## Setup

The certificates are automatically generated when needed, but you can also regenerate them manually:

```bash
npm run generate-ssl-certs
```

## What's Generated

- `cert.pem` - SSL certificate
- `key.pem` - Private key

These certificates are valid for:

- `localhost`
- `127.0.0.1`
- `::1`

## Requirements

You need [mkcert](https://github.com/FiloSottile/mkcert) installed:

```bash
# macOS
brew install mkcert

# Linux
# See: https://github.com/FiloSottile/mkcert#linux

# Windows
# See: https://github.com/FiloSottile/mkcert#windows
```

## Why HTTPS Locally?

HTTPS in local development provides:

- OAuth testing (many providers require HTTPS redirects)
- Service Workers (require HTTPS)
- Secure cookies and security headers
- Production-like environment

## Note

These certificates are **locally-trusted** via mkcert's local Certificate Authority, so your browser won't show security warnings.

The certificates and this entire directory are gitignored for security.
