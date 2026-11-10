import { data } from "react-router";
import { NotFoundContent } from "~/components/shell/not-found-content";

/** Any unknown customer path: a 404 inside the page shell, so the language switch stays usable. */
export function loader() {
  return data(null, { status: 404 });
}

export function meta() {
  return [{ name: "robots", content: "noindex" }];
}

export default function NotFound() {
  return <NotFoundContent />;
}
