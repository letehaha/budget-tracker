# Reverse Proxies

A reverse proxy is the piece that sits between the internet and the app: it
owns your domain, handles HTTPS, and passes requests through. The whole app
lives on a single HTTP port (`http://<host>:8080` by default), so the setup is
always the same regardless of which proxy you use: forward your domain to that
one port and you're done – the app and its API come through together, there is
no second port to configure.

## Requirements (any proxy)

- **Don't buffer live updates.** The app keeps a long-lived connection open to
  stream live updates (Server-Sent Events). Most proxies handle this fine with
  default settings; if a setting like "buffering" or "websocket support"
  exists, make sure streaming isn't blocked, or live sync updates in the UI
  will freeze.
- **Pass the standard forwarding headers** (`Host`, `X-Forwarded-Proto`).
  Nearly every proxy does this out of the box; only check this if you built a
  config by hand.
- **Close the direct port.** Your proxy serves the app over HTTPS, but the
  plain-HTTP port `8080` is still open to anyone until you close it –
  see [setup-guide.md](setup-guide.md#3-behind-your-own-reverse-proxy), step 3.

And on the app side: `BETTER_AUTH_URL` and `AUTH_ORIGIN` in `.env` must be
set to the URL people type in the browser (e.g. `https://budget.example.com`)
– see [setup-guide.md](setup-guide.md#3-behind-your-own-reverse-proxy),
step 2.

## Nginx Proxy Manager

Add a **Proxy Host**: forward to `http://<host>:8080`, and enable
**Websockets Support** in the details tab. Request a Let's Encrypt cert on the
SSL tab. Nothing else to configure – the app and API share the origin.

## Caddy

```caddy
budget.example.com {
    reverse_proxy <host>:8080
}
```

Caddy needs nothing else – it gets the HTTPS certificate automatically and
its defaults handle streaming and headers correctly.

No reverse proxy yet? The stack can handle HTTPS itself with a bundled
Traefik – see [traefik-overlay.md](traefik-overlay.md).
