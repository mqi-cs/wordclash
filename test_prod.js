const { ConvexHttpClient } = require("convex/browser");
const client = new ConvexHttpClient("https://cheery-chicken-621.eu-west-1.convex.cloud");

async function run() {
  try {
    await client.mutation("auth:signIn", {
      args: { email: "qasimimran291@gmail.com", password: "password123", username: "admin", flow: "signUp" },
      provider: "password"
    });
    console.log("Success!");
  } catch (err) {
    console.error("CONVEX ERROR:");
    console.error(err);
  }
}
run();
