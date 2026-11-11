import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // The whole route manifest (a few dozen routes) ships in the first HTML, so links never
  // trigger /__manifest requests: each was a Worker invocation and a round trip on a phone.
  routeDiscovery: { mode: "initial" },
} satisfies Config;
