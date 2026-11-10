import { clockContext } from "~/server/clock.server";
import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Aux petits bonheurs" },
    { name: "description", content: "Home bakery in Mauritius" },
  ];
}

const YEAR_MU = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Indian/Mauritius" });

export function loader({ context }: Route.LoaderArgs) {
  return { year: YEAR_MU.format(context.get(clockContext).now()) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <main className="p-4">
        <h1>Aux petits bonheurs</h1>
      </main>
      <footer className="p-4">
        <p>© {loaderData.year} Aux petits bonheurs</p>
      </footer>
    </>
  );
}
