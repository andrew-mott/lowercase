/**
 * Where the API lives, as a prefix every request and the event stream are built
 * from.
 *
 * Empty in a build, which makes those requests same-origin: the HTTP server
 * serves this build, so the API is wherever the page was loaded from. An
 * absolute default would name a host that is only right when the API runs on
 * this machine on that port.
 *
 * In development the Vite server is a different origin from the API, so it
 * keeps naming one. `VITE_SERVER_URL` overrides either -- a Vite build against
 * an API on another host, or a dev server pointed at a container.
 */
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3000" : "");
