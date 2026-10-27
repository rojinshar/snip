// The two Workers runtime modules the Worker entry point uses. Declared here instead of
// adding @cloudflare/workers-types, whose globals conflict with the Node types used by the
// rest of the API.

declare module 'cloudflare:workers' {
  /** The Worker's bindings: vars and secrets from wrangler.jsonc and `wrangler secret`. */
  export const env: Readonly<Record<string, unknown>>;
  /** Extends the current request's lifetime until `promise` settles. */
  export function waitUntil(promise: Promise<unknown>): void;
}

declare module 'cloudflare:node' {
  /** Serves requests through a Node.js HTTP server listening on `port` inside the Worker. */
  export function httpServerHandler(options: { port: number }): {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  };
}
