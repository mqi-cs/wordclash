import { describe, expect, it } from "vitest";
import { getConvexHttpActionBaseUrl } from "./AuthContext";

describe("getConvexHttpActionBaseUrl", () => {
  it("prefers an explicit Convex site URL for HTTP actions", () => {
    expect(
      getConvexHttpActionBaseUrl(
        "https://auth.wordclash.co",
        "https://example-123.convex.cloud",
      ),
    ).toBe("https://auth.wordclash.co");
  });

  it("derives the Convex site URL from the deployment URL", () => {
    expect(
      getConvexHttpActionBaseUrl(undefined, "https://example-123.convex.cloud"),
    ).toBe("https://example-123.convex.site");
  });

  it("keeps non-Convex custom hosts unchanged when deriving the origin", () => {
    expect(
      getConvexHttpActionBaseUrl(undefined, "https://backend.wordclash.co"),
    ).toBe("https://backend.wordclash.co");
  });
});
