require('dotenv').config({ path: '.env.local' });
const { ConvexHttpClient } = require("convex/browser");
const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL || "https://cheery-chicken-621.eu-west-1.convex.cloud");

async function test() {
  try {
    // Convex Auth v1 API format
    await client.mutation("auth:signIn", {
      provider: "password",
      args: { email: "test291@gmail.com", password: "password123", username: "admin", flow: "signUp" }
    });
    console.log("Success");
  } catch (err) {
    console.error("ERROR CAUGHT:");
    console.error(err);
  }
}
test();
