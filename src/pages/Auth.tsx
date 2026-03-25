import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const GoogleIcon = () => (
  <svg
    aria-hidden="true"
    className="mr-2 h-4 w-4"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M21.805 10.023H12v3.955h5.617c-.242 1.272-.967 2.35-2.06 3.076v2.557h3.338c1.955-1.8 3.082-4.454 3.082-7.611 0-.664-.06-1.302-.172-1.977Z"
      fill="#4285F4"
    />
    <path
      d="M12 22c2.79 0 5.13-.925 6.84-2.509l-3.338-2.557c-.926.62-2.11.986-3.502.986-2.692 0-4.972-1.817-5.787-4.26H2.762v2.638A10 10 0 0 0 12 22Z"
      fill="#34A853"
    />
    <path
      d="M6.213 13.66A5.997 5.997 0 0 1 5.89 12c0-.576.099-1.136.323-1.66V7.702H2.762A10 10 0 0 0 2 12c0 1.61.386 3.134 1.07 4.298Z"
      fill="#FBBC05"
    />
    <path
      d="M12 6.08c1.517 0 2.88.523 3.952 1.549l2.964-2.964C17.125 2.992 14.785 2 12 2a10 10 0 0 0-9.238 5.702l3.45 2.638C7.028 7.897 9.308 6.08 12 6.08Z"
      fill="#EA4335"
    />
  </svg>
);

const signUpSchema = z.object({
  username: z.string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required")
});

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp, signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
  const [showPasswordAuth, setShowPasswordAuth] = useState(!googleAuthEnabled);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log(`[AUTH DEBUG] Attempting to ${isSignUp ? 'Sign Up' : 'Sign In'}...`);

    try {
      if (isSignUp) {
        console.log("[AUTH DEBUG] Validating signup inputs...", { username, email, passwordLength: password.length });
        const validationResult = signUpSchema.safeParse({ username, email, password });
        
        if (!validationResult.success) {
          console.error("[AUTH DEBUG] Zod validation failed:", validationResult.error.errors);
          const errorMessage = validationResult.error.errors[0].message;
          toast({
            variant: "destructive",
            title: "Validation Error",
            description: errorMessage,
          });
          setLoading(false);
          return;
        }
        
        console.log("[AUTH DEBUG] Validation passed. Calling signUp from AuthContext...");
        const response = await signUp(email, password, username);
        console.log("[AUTH DEBUG] signUp returned:", response);
        
        if (response?.error) {
          console.error("[AUTH DEBUG] signUp returned an error object:", response.error);
          throw response.error;
        }
        
        console.log("[AUTH DEBUG] Signup completely successful.");
        toast({
          title: "Account created!",
          description: "You can now sign in.",
        });
        setIsSignUp(false);
      } else {
        console.log("[AUTH DEBUG] Validating signin inputs...");
        const validationResult = signInSchema.safeParse({ email, password });
        
        if (!validationResult.success) {
          console.error("[AUTH DEBUG] Zod validation failed:", validationResult.error.errors);
          const errorMessage = validationResult.error.errors[0].message;
          toast({
            variant: "destructive",
            title: "Validation Error",
            description: errorMessage,
          });
          setLoading(false);
          return;
        }
        
        console.log("[AUTH DEBUG] Validation passed. Calling signIn from AuthContext...");
        const response = await signIn(email, password);
        console.log("[AUTH DEBUG] signIn returned:", response);
        
        if (response?.error) {
          console.error("[AUTH DEBUG] signIn returned an error object:", response.error);
          throw response.error;
        }
        
        console.log("[AUTH DEBUG] Signin completely successful.");
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate("/");
      }
    } catch (error: unknown) {
      console.error("[AUTH DEBUG] Caught an exception in handleSubmit:");
      console.error("[AUTH DEBUG] Error type:", typeof error);
      console.error("[AUTH DEBUG] Error object/string:", error);

      // Extract detailed error message if it's a ConvexError or an object with a message
      let errorMsg = "An unexpected error occurred";
      if (typeof error === "string") {
        errorMsg = error;
      } else if (error instanceof Error) {
        errorMsg = error.message;
        console.error("[AUTH DEBUG] Stack trace:", error.stack);
      } else if (error && typeof error === "object" && "message" in error) {
        errorMsg = String((error as any).message);
      }

      console.error("[AUTH DEBUG] Final parsed error message for toast:", errorMsg);

      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      console.log("[AUTH DEBUG] Flow finished. Setting loading=false.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const response = await signInWithGoogle();
      if (response?.error) {
        throw response.error;
      }
    } catch (error: unknown) {
      const errorMsg =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to sign in with Google";

      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isSignUp ? "Create Account" : "Sign In"}</CardTitle>
          <CardDescription>
            {isSignUp
              ? "Enter your details to create a new account"
              : "Enter your credentials to access your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {googleAuthEnabled && (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <GoogleIcon />
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowPasswordAuth((prev) => !prev)}
                disabled={loading}
              >
                {showPasswordAuth ? "Hide email and password" : "Use email and password instead"}
              </Button>

              {!showPasswordAuth && (
                <p className="text-center text-sm text-muted-foreground">
                  Use Google for the fastest sign in, or open the email form if you already signed up with a password.
                </p>
              )}
            </div>
          )}

          {showPasswordAuth && (
            <div className={googleAuthEnabled ? "mt-6 space-y-4" : "space-y-4"}>
              {googleAuthEnabled && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Email and password</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      minLength={3}
                      maxLength={20}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={loading}
                  onClick={() => setIsSignUp(!isSignUp)}
                >
                  {isSignUp
                    ? "Already have an account? Sign In"
                    : "Don't have an account? Sign Up"}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
