import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";

export const captureUserEvent = mutation({
  args: {
    event: v.union(v.literal("hint_used"), v.literal("game_abandoned")),
    properties: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: args.event,
      properties: args.properties ?? {},
    });
  },
});
