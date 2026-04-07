import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";

export const captureUserEvent = mutation({
  args: {
    event: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Normalize event name to snake_case
    const normalizedEvent = args.event
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/\s+/g, "_")
      .toLowerCase();

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: normalizedEvent,
      properties: args.properties ?? {},
    });
  },
});
