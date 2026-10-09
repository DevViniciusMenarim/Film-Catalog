import { expect, test, vi } from "vitest";
import { localToday } from "../src/shared/localDate";

test("limite da data usa o dia civil local quando UTC já está no dia seguinte", () => {
  vi.stubEnv("TZ", "America/Sao_Paulo");
  try {
    const instant = new Date("2026-10-04T00:30:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-10-04");
    expect(localToday(instant)).toBe("2026-10-03");
  } finally {
    vi.unstubAllEnvs();
  }
});
