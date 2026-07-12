// Placeholder served in dev so the /config.js script tag resolves (no 404).
// In the production Docker image the container entrypoint overwrites this file
// with the effective runtime config. An empty object means every key falls
// back to the build-time import.meta.env value.
window.__APP_CONFIG__ = {};
