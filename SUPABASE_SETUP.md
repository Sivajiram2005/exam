# Supabase & Vercel Setup Guide

This guide walks you through setting up your private Supabase PostgreSQL database, applying strict Row Level Security (RLS) policies, and deploying the application to Vercel.

---

## 1. Setting Up Supabase

### Step 1: Create a Supabase Project
1. Log in or sign up at [https://supabase.com](https://supabase.com).
2. Click **New project**.
3. Choose an organization, enter a project name (e.g., `exam-vault`), set a strong database password, and choose your region.
4. Click **Create new project** and wait ~1-2 minutes for provisioning.

---

### Step 2: Run the Database Schema & RLS Policies
1. In your Supabase project dashboard, click on the **SQL Editor** tab (the `>_` icon in the left sidebar).
2. Click **New query**.
3. Copy the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) and paste it into the editor.
4. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).

**What this creates:**
- The `public.exam_questions` table with fields for URL, normalized URL, title, question prompt, answer text, code snippet, code language, tags, and timestamps.
- A unique constraint on `(user_id, question_url)` to prevent accidental duplicate entries and support clean bulk CSV imports.
- High-performance B-tree indexes for fast URL lookups.
- An automatic trigger to refresh `updated_at` timestamps on row edits.
- **Row Level Security (RLS) enabled** with 4 strict policies:
  - `SELECT`: Only users where `auth.uid() = user_id` can read.
  - `INSERT`: Only authenticated users inserting with their own `auth.uid()` can add rows.
  - `UPDATE`: Only the owner can edit their rows.
  - `DELETE`: Only the owner can remove their rows.
  - **Zero policies for the `anon` role**, guaranteeing that unauthenticated visitors receive an empty set or access denied.

---

### Step 3: Create Your Private Account & Restrict Signups
To make sure only **you** can access the database:
1. In your local development app (or deployed Vercel app), open the login screen and click **Create Account**.
2. Enter your personal email and a strong password.
3. Once your account is created, go back to your **Supabase Dashboard**.
4. In the left sidebar, navigate to **Authentication → Providers → Email**.
5. Toggle **OFF** the setting: **"Enable Signups"** (or "Allow new users to sign up").
6. Click **Save**.

> [!NOTE]
> Now, no other person on the internet can create an account in your Supabase project. Only your pre-created account will be permitted to authenticate.

---

### Step 4: Configure Local Environment Variables
1. In your Supabase dashboard, go to **Project Settings → API** (or **Settings → Data API**).
2. Under **Project URL**, copy the URL.
3. Under **Project API keys**, copy the `anon` / `public` key.
   *(DO NOT use the `service_role` secret key! The `anon` key is the only key intended for frontend code.)*
4. Create a `.env` file in the root of this project:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

5. Restart your local Vite dev server (`npm run dev`). The status badge in the navbar will display **Supabase Live** with a green shield.

---

## 2. Deploying to Vercel

1. Push this repository to your GitHub, GitLab, or Bitbucket account.
2. Log in to [https://vercel.com](https://vercel.com).
3. Click **Add New... → Project**.
4. Select your repository and click **Import**.
5. Vercel automatically detects Vite:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Expand the **Environment Variables** section and add:
   - Name: `VITE_SUPABASE_URL` | Value: *Your Supabase Project URL*
   - Name: `VITE_SUPABASE_ANON_KEY` | Value: *Your Supabase Anon Key*
7. Click **Deploy**.

> [!TIP]
> The included `vercel.json` automatically configures client-side SPA routing (`/(.*) -> /index.html`) so refreshing on any route will not return a 404 error, and adds strict security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).

---

## 3. Row Level Security (RLS) Verification

You can test and verify RLS enforcement directly in the Supabase SQL Editor:

```sql
-- 1. Verify RLS is enabled on the table
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'exam_questions';
-- Expected result: relrowsecurity = true

-- 2. Verify an unauthenticated request returns zero rows
SET ROLE anon;
SELECT * FROM public.exam_questions;
-- Expected result: 0 rows returned (Zero access for anon role)

-- 3. Reset role
RESET ROLE;
```
