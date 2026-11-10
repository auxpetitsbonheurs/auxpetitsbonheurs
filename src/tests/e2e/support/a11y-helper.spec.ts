import { expectNoA11yViolations } from "./a11y";
import { expect, test } from "./fixtures";

const page = (body: string) =>
  `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title></head><body><main><h1>Fixture</h1>${body}</main></body></html>`;

test.describe("expectNoA11yViolations", () => {
  test("AC2: fails on an unlabelled input and prints the rule and element", async ({ page: p }) => {
    await p.setContent(page(`<input id="unlabelled-field" type="text">`));

    const error = await expectNoA11yViolations(p).then(
      () => undefined,
      (e: Error) => e,
    );

    expect(error?.message).toMatch(/\[critical\] label:/);
    expect(error?.message).toContain("#unlabelled-field");
  });

  test("AC2: passes on a clean page", async ({ page: p }) => {
    await p.setContent(page(`<label for="name">Name</label><input id="name" type="text">`));

    await expectNoA11yViolations(p);
  });

  test("AC3: zoom restores the original viewport afterwards", async ({ page: p }) => {
    await p.setContent(page(`<p>Short text.</p>`));
    const before = p.viewportSize();

    await expectNoA11yViolations(p, { zoom: 2 });

    expect(p.viewportSize()).toEqual(before);
  });

  test("AC3: zoom 2 fails when content scrolls sideways at 200%", async ({ page: p }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 1280;
    // Fits at 100% but not once the CSS viewport is halved.
    await p.setContent(page(`<div style="width:${Math.floor(width * 0.9)}px">Wide block</div>`));

    await expectNoA11yViolations(p);
    await expect(expectNoA11yViolations(p, { zoom: 2 })).rejects.toThrow(/horizontal scroll/);
  });

  test("AC3: zoom 2 passes when content reflows", async ({ page: p }) => {
    await p.setContent(page(`<p style="max-width:100%">Text that wraps to any width.</p>`));

    await expectNoA11yViolations(p, { zoom: 2 });
  });
});
