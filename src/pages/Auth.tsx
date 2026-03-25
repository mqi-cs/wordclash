import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Chrome } from "lucide-react";
import { z } from "zod";

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

          {googleAuthEnabled && (
            <div className="mt-6 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <Chrome className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
