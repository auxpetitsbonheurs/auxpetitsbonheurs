// CSV cells and rows for Excel (S-179 AC1..AC3).
import { describe, expect, test } from "vitest";
import { CSV_BOM, csvCell, csvRow } from "./csv";

describe("formula injection (S-179 AC1)", () => {
  test("text starting with = + - @ (and tab or CR) gets an apostrophe", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+230 5712 3456")).toBe("'+230 5712 3456");
    expect(csvCell("-Anna")).toBe("'-Anna");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tTab")).toBe("'\tTab");
  });

  test("numbers stay numbers, negative ones included; ordinary text is unchanged", () => {
    expect(csvCell(1250)).toBe("1250");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("Anna")).toBe("Anna");
    expect(csvCell(true)).toBe("yes");
    expect(csvCell(false)).toBe("no");
    expect(csvCell(null)).toBe("");
  });
});

describe("RFC 4180 quoting (S-179 AC3)", () => {
  test("comma, quote and newline are quoted with doubled quotes", () => {
    expect(csvCell("Rault, Anna")).toBe("\"Rault, Anna\"");
    expect(csvCell("Le \"Petit\"")).toBe("\"Le \"\"Petit\"\"\"");
    expect(csvCell("two\nlines")).toBe("\"two\nlines\"");
  });
});

describe("rows and encoding (S-179 AC2)", () => {
  test("comma-separated, CRLF-terminated, accents kept", () => {
    expect(csvRow(["Hélène", "François", 3])).toBe("Hélène,François,3\r\n");
  });

  test("the file starts with the UTF-8 BOM", () => {
    expect(new TextEncoder().encode(CSV_BOM)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
  });
});
