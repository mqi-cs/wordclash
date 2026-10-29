import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "username registry maintenance",
  { hours: 1 },
  internal.usernames.maintainUsernameRegistry,
  {},
);

export default crons;
