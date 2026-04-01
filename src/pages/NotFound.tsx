import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--background-alt)))]" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="rounded-[1.75rem] border border-border/80 bg-card/75 px-8 py-10 text-center backdrop-blur-xl">
        <h1 className="mb-3 bg-gradient-to-r from-foreground to-primary/75 bg-clip-text text-5xl font-black tracking-[-0.08em] text-transparent">
          404
        </h1>
        <p className="mb-6 text-lg text-muted-foreground">Oops! Page not found.</p>
        <Button asChild>
          <Link to="/">Return to Home</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
