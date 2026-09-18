import { describe, expect, it } from "vitest";
import { formatBytes } from "@/components/workbench/shared/format-bytes";

describe("formatBytes", () => {
  it("shows a whole-number byte count under 1024", () => {
    expect(formatBytes(0)).toBe("0 bytes");
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(1023)).toBe("1023 bytes");
  });

  it("switches to KB at 1024, with one decimal place", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("switches to MB and GB at the next thresholds", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("caps at GB rather than continuing to a further unit", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1024.0 GB");
  });
});
