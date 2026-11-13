// The document stream keeps a finished Suspense boundary inline in the HTML, however much came
// before it: React otherwise moves it out into a hidden <div> that only a script reveals,
// so a browser without JavaScript would never see it (the product page's ordering area).
import { Suspense } from "react";
import { renderToReadableStream } from "react-dom/server";
import { expect, test } from "vitest";
import { DOCUMENT_STREAM_OPTIONS } from "./entry.server";

test("a finished Suspense boundary after 12.8 kB of earlier boundaries is sent inline, not hidden for a script", async () => {
  const page = (
    <main>
      <Suspense fallback={null}>
        <p>{"Long page text. ".repeat(2000)}</p>
      </Suspense>
      <Suspense fallback={null}>
        <form method="post">
          <button type="submit">Add to basket</button>
        </form>
      </Suspense>
    </main>
  );

  const stream = await renderToReadableStream(page, DOCUMENT_STREAM_OPTIONS);
  const html = await new Response(stream).text();

  expect(html).not.toContain("<div hidden");
  expect(html).not.toContain("<template");
  expect(html).toMatch(/<!--\$--><form method="post"><button type="submit">Add to basket/);
});
