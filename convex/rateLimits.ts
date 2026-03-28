import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  ipSignUps: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
});
