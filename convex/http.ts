import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { passwordSignup, SIGNUP_ROUTE } from "./passwordSignup";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({
  path: SIGNUP_ROUTE,
  method: "POST",
  handler: passwordSignup,
});
http.route({
  path: SIGNUP_ROUTE,
  method: "OPTIONS",
  handler: passwordSignup,
});

export default http;
