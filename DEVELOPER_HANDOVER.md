# WordClash Developer Handover & Sync Guide

This document is the master reference for synchronizing development across multiple devices. It contains everything you need to know about how WordClash is architected, how to run it locally, and critical security/deployment nuances.

---

## 1. Syncing & Running on a New Device

When you pull this project on a new device, follow these exact steps to ensure your local environment matches production:

```bash
# 1. Install dependencies
npm install

# 2. Start the Vite frontend server
npm run dev

# 3. Start the Convex backend synchronization (in a separate terminal)
npx convex dev
```

**Important:** You do NOT need a local `.env` file for Convex to work. When you run `npx convex dev`, it will automatically prompt you to log into your Convex account (if you aren't already) and securely sync the dev database to your machine. 

---

## 2. Technical Architecture & Tech Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, shadcn/ui.
- **Backend/Database:** [Convex](https://convex.dev/) (Fully replaced Supabase).
- **Authentication:** `@convex-dev/auth` (Password provider).

### Why Convex?
We migrated entirely away from Supabase to Convex. Convex provides real-time WebSocket syncing out of the box. All "serverless functions" and database schema definitions live natively inside the `/convex` folder.
- **No Supabase code remains.** Do not try to import `@supabase/supabase-js`. 
- **Shared Logic:** The folder `/convex/shared/gameLogic.ts` contains the core WordClash evaluation logic. This file is executed by *both* the React frontend (for immediate UI optimism) and the Convex backend (as the ultimate source of truth).

---

## 3. Security & Anti-Cheat Mechanisms

During the migration, 13 critical vulnerabilities were patched. **Do not undo these patterns on your new device.**

1. **Server-Side Authority:** The true "Daily Word" and "Multiplayer Target Word" are NEVER sent to the client. The client submits a string guess to a Convex mutation (`games.ts`), and the server evaluates it returning only the colors (correct/present/absent).
2. **Query Bounds:** All public queries like `getLeaderboard` or user searches have hard `.take(100)` limits attached to them in `stats.ts` and `friends.ts`. This prevents DDOS attacks from pulling the entire database into browser memory.
3. **Data Leaks:** The `viewer` query in `users.ts` explicitly strips out sensitive token data, returning only `_id`, `name`, and `email`.
4. **Rate Limiting:** Friend requests and Game Creation mutations have strict time-based rate limiters to prevent bot spamming.

---

## 4. Authentication (Crucial Nuance)

**The `JWT_PRIVATE_KEY` Dilemma:**
Convex Auth uses secure cryptographic keys to mint user sessions. 
- When working locally (`npx convex dev`), these keys are stored inside your *Development* Convex dashboard.
- When you deploy to Vercel, the site points to the *Production* Convex dashboard. 
- **If you ever reset your Convex project**, you must ensure `JWT_PRIVATE_KEY` and `JWKS` are pushed to Production, or the Vercel site will throw a fatal 500 Server Error upon clicking "Sign Up".
- *To sync environment variables from Dev to Prod, run:*
  ```bash
  npx convex env list > .env.tmp
  npx convex env set --prod --from-file .env.tmp
  rm .env.tmp
  ```

---

## 5. UI Layout & Game Mechanics Memory Bank

If you edit the UI on the new device, bear these specific mechanic choices in mind:
- **Responsive Game Grid:** The `GameGrid` has a responsive maximum width (`300px` mobile, `400px` desktop) and is aligned `items-start` with top padding to keep it physically separated from the Keyboard.
- **Scrolling Grid:** For "Hard" and "Timed" modes where players have 10 to 999 guesses, the grid is wrapped in an overflow container. It is mathematically locked to display exactly **6 rows** at a time, auto-scrolling down as new guesses are entered.
- **Hints:** Hints are intentionally ephemeral. When a user clicks the lightbulb, the revealed letter injects into the *current* active row. The moment the user hits `Enter`, the board is wiped of hints. They do not persist to the next row; the user must spend another hint explicitly.
- **Multiplayer Restrictions:** Multiplayer modes are gated. Unauthenticated users who click the "Multiplayer Mode" card on `GameMenu.tsx` are intercepted by a toast error requiring them to sign in.

---

## 6. Vercel Deployment

Deployment is fully automated via GitHub. When you push a commit from your new device to the `main` branch, Vercel will automatically build the frontend.

**SPA Routing:**
Because React Router handles pages internally (e.g., `/auth`), Vercel needs to know not to look for an actual `auth.html` file on the server. This project includes a `vercel.json` file in the root directory containing routing rewrite rules:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
**Do not delete `vercel.json`**, or refreshing the page on any route other than `/` will result in a 404 error in production.

---

## 7. AI Instructions (For Future Agents)

If an AI agent is reading this document on a new device, understand that your primary directive is to maintain the strict boundary between the Convex backend and the React frontend. 
- Always review `convex/_generated/ai/guidelines.md` before writing backend queries.
- Before adding new features, add corresponding checklists to this file or the `task.md` artifact.
- Do not trust client-side state for game evaluation; mutations must verify game ownership and guess validity independently on the server.
