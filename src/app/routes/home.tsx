import { env } from "cloudflare:workers";

import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Aux petits bonheurs" },
    { name: "description", content: "Home bakery in Mauritius" },
  ];
}

export function loader() {
  return { message: `Aux petits bonheurs (${env.APP_ENV})` };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <Welcome message={loaderData.message} />;
}
