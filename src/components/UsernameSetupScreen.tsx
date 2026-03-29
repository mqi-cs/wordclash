import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "@/hooks/use-toast";

interface UsernameSetupScreenProps {
  email?: string;
  googleName?: string;
}

export const UsernameSetupScreen = ({ email, googleName }: UsernameSetupScreenProps) => {
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const completeProfile = useMutation(api.users.completeProfile);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setUsernameError(null);

    try {
      await completeProfile({ username });
      toast({
        title: "Username saved",
        description: "Your profile is ready.",
      });
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to save username";
      if (errorMessage === "Username is already taken") {
        setUsernameError("That username is already in use. Please choose another one.");
        return;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,hsl(var(--menu-classic)/0.12),transparent_18%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--background-alt)))]" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md border-border/70 bg-card/75">
        <CardHeader>
          <CardTitle className="text-3xl tracking-tight">Choose a Username</CardTitle>
          <CardDescription className="leading-6">
            {googleName ? `${googleName}, finish setting up your profile. ` : ""}
            {email ? `Signed in as ${email}. ` : ""}
            Choose a username to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="complete-username">Username</Label>
              <Input
                id="complete-username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (usernameError) {
                    setUsernameError(null);
                  }
                }}
                required
                minLength={3}
                maxLength={20}
                placeholder="Enter your username"
                aria-invalid={Boolean(usernameError)}
                className={usernameError ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {usernameError && (
                <p className="text-sm text-destructive" role="alert">
                  {usernameError}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Saving..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
