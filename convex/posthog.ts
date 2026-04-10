"use node";

import { PostHog } from "posthog-node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const normalizeEventName = (event: string) =>
  event
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();

function getClient(): PostHog {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST;
  if (!apiKey) {
    throw new Error("POSTHOG_API_KEY environment variable is not set");
  }
  if (!host) {
    throw new Error("POSTHOG_HOST environment variable is not set");
  }
  const client = new PostHog(apiKey, {
    host,
    enableExceptionAutocapture: true,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export const captureEvent = internalAction({
  args: {
    distinctId: v.string(),
    event: v.string(),
    properties: v.optional(v.any()),
    personProperties: v.optional(v.any()),
    setOnce: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const client = getClient();
    client.capture({
      distinctId: args.distinctId,
      event: normalizeEventName(args.event),
      properties: args.properties ?? {},
    });
    if (args.personProperties || args.setOnce) {
      client.identify({
        distinctId: args.distinctId,
        properties: {
          ...(args.personProperties ?? {}),
          ...(args.setOnce ? { $set_once: args.setOnce } : {}),
        },
      });
    }
    await client.shutdown();
  },
});

export const identifyUser = internalAction({
  args: {
    distinctId: v.string(),
    properties: v.optional(v.any()),
    setOnce: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const client = getClient();
    client.identify({
      distinctId: args.distinctId,
      properties: {
        ...(args.properties ?? {}),
        ...(args.setOnce ? { $set_once: args.setOnce } : {}),
      },
    });
    await client.shutdown();
  },
});

export const captureException = internalAction({
  args: {
    distinctId: v.optional(v.string()),
    message: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const client = getClient();
    client.captureException(
      new Error(args.message),
      args.distinctId,
      args.properties ?? {},
    );
    await client.shutdown();
  },
});
