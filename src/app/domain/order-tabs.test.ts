// S-111 AC1: each order appears in exactly one tab.
import { describe, expect, test } from "vitest";
import { ORDER_TABS, TAB_STATUSES, tabOf } from "./order-tabs";
import { ORDER_STATUSES } from "./status";

describe("order tabs (S-111 AC1, AC3)", () => {
  test.each(ORDER_STATUSES)("%s is in exactly one tab", (status) => {
    expect(ORDER_TABS.filter((tab) => TAB_STATUSES[tab].includes(status))).toHaveLength(1);
  });

  test("the spec grouping, with awaiting payment in the Payment tab", () => {
    expect(tabOf("pending_approval")).toBe("review");
    expect(tabOf("quote_needed")).toBe("review");
    expect(tabOf("awaiting_payment")).toBe("payment");
    expect(tabOf("quote_sent")).toBe("upcoming");
    expect(tabOf("out_for_delivery")).toBe("upcoming");
    expect(tabOf("completed")).toBe("completed");
    expect(tabOf("declined")).toBe("closed");
  });
});
