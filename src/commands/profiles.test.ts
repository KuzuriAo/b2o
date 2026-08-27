import type { ProfileSummary } from "../internal/shared/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listProfiles } from "../convertClient.js";
import { runProfiles } from "./profiles.js";

vi.mock("../convertClient.js", () => ({
  listProfiles: vi.fn(),
}));

function makeProfile(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    id: "some-id",
    displayName: "Some Display Name",
    printerId: "snapmaker-u1",
    nozzleDiameter: "0.4",
    layerHeight: 0.2,
    autoSelectable: true,
    tierName: "Standard",
    ...overrides,
  };
}

describe("runProfiles", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.mocked(listProfiles).mockReset();
  });

  it("sorts profiles by id using plain byte-wise comparison, matching the `sort` command", async () => {
    vi.mocked(listProfiles).mockResolvedValue({
      profiles: [
        makeProfile({ id: "snapmaker-u1-default" }),
        makeProfile({ id: "snapmaker-u1-0.4-standard" }),
        makeProfile({ id: "snapmaker-u1-0.2-draft" }),
        makeProfile({ id: "snapmaker-u1-0.4-0.08ef" }),
      ],
    });

    await runProfiles(undefined, "http://localhost:8787");

    const printedLines = logSpy.mock.calls[0][0].split("\n");
    const ids = printedLines.map((line: string) => line.trim().split(/\s+/)[0]);
    const expected = [
      "snapmaker-u1-0.2-draft",
      "snapmaker-u1-0.4-0.08ef",
      "snapmaker-u1-0.4-standard",
      "snapmaker-u1-default",
    ].sort(); // cross-check against JS's own default sort, not a hand-typed expectation
    expect(ids).toEqual(expected);
  });

  it("prints a helpful message instead of an empty table when there are no matches", async () => {
    vi.mocked(listProfiles).mockResolvedValue({ profiles: [] });
    await runProfiles("0.9", "http://localhost:8787");
    expect(logSpy).toHaveBeenCalledWith("No profiles found for nozzle diameter 0.9.");
  });
});
