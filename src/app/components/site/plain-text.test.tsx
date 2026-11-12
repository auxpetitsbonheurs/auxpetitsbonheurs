// S-059 AC3: Owner text with HTML is stored and shown as plain text, escaped, with line breaks kept.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PlainText, plainTextParagraphs } from "./plain-text";

describe("PlainText (S-059 AC3)", () => {
  test("HTML such as <script> is shown as text, never interpreted", () => {
    const html = renderToStaticMarkup(<PlainText text={'<script>alert("x")</script>\n<b>Bold?</b> <a href="javascript:x">link</a>'} />);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<a ");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Bold?&lt;/b&gt;");
  });

  test("single line breaks are kept inside a paragraph; a blank line starts a new one", () => {
    expect(plainTextParagraphs("Do you deliver?\nYes, island-wide.\r\n\r\nCan I pay cash?\nNo, Juice only.")).toEqual(["Do you deliver?\nYes, island-wide.", "Can I pay cash?\nNo, Juice only."]);

    const html = renderToStaticMarkup(<PlainText text={"Line one\nLine two\n\nNext"} />);
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("whitespace-pre-line");
    expect(html).toContain("Line one\nLine two");
  });
});
