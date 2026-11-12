import { redirect } from "react-router";
import { localeFromPathname, localePath } from "~/lib/locale";
import type { Route } from "./+types/about-redirect";

/** The old About URL (E-04 S-070) is Our story now: 301 in the same language (E-13 S-248 AC7). */
export function loader({ url }: Route.LoaderArgs) {
  throw redirect(localePath(localeFromPathname(url.pathname), "/our-story"), 301);
}
