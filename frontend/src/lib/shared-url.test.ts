import { describe, expect, it } from "vitest";
import { parseSharedUrl } from "./shared-url";

describe("parseSharedUrl", () => {
  it("accepts http and https addresses and drops the fragment", () => {
    expect(parseSharedUrl(" https://example.com/pancakes?a=1&b=2#top ")).toBe("https://example.com/pancakes?a=1&b=2");
    expect(parseSharedUrl("http://example.com/")).toBe("http://example.com/");
  });
  it.each([
    "",
    "   ",
    "example.com/pancakes",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "https://user:pw@example.com/",
    "https://",
    "//example.com/x",
  ])("refuses %j", (raw) => {
    expect(parseSharedUrl(raw)).toBeNull();
  });
  it("refuses an address over 2048 characters", () => {
    expect(parseSharedUrl(`https://example.com/${"a".repeat(2100)}`)).toBeNull();
  });
  it("refuses a missing value", () => {
    expect(parseSharedUrl(undefined)).toBeNull();
    expect(parseSharedUrl(null)).toBeNull();
  });
});
