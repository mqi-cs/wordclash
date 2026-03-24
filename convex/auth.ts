import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        // Enforce password strength server-side (defense in depth)
        const pw = params.password as string;
        if (!pw || pw.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }
        
        return {
          email: params.email as string,
          name: params.username as string,
        };
      },
    }),
  ],
});
