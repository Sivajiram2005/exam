-- ====================================================================
-- Exam Answer Lookup - Database Schema & Row Level Security (RLS)
-- ====================================================================
-- This script creates the exam_questions table, indexes, triggers, and
-- strict Row Level Security (RLS) policies guaranteeing that all saved
-- answers remain completely private to each authenticated user account.
-- ====================================================================

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the exam_questions table
CREATE TABLE IF NOT EXISTS public.exam_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    question_url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    title TEXT,
    question_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    code_snippet TEXT,
    code_language TEXT DEFAULT 'plaintext',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Ensure a user does not have duplicate identical URLs (allows easy upserts)
    CONSTRAINT exam_questions_user_url_unique UNIQUE (user_id, question_url)
);

-- 3. Create high-performance indexes for URL lookups & user filtering
CREATE INDEX IF NOT EXISTS idx_exam_questions_user_id 
    ON public.exam_questions (user_id);

CREATE INDEX IF NOT EXISTS idx_exam_questions_exact_url 
    ON public.exam_questions (user_id, question_url);

CREATE INDEX IF NOT EXISTS idx_exam_questions_norm_url 
    ON public.exam_questions (user_id, normalized_url);

CREATE INDEX IF NOT EXISTS idx_exam_questions_created_at 
    ON public.exam_questions (user_id, created_at DESC);

-- 4. Automatically update the updated_at column on row modification
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_exam_questions_updated_at ON public.exam_questions;
CREATE TRIGGER set_exam_questions_updated_at
    BEFORE UPDATE ON public.exam_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- 5. Row Level Security (RLS) Setup
-- ====================================================================
-- Enable RLS to enforce that unauthenticated users have ZERO access,
-- and authenticated users can strictly only view, insert, update, or
-- delete rows where user_id matches their own auth.uid().
-- ====================================================================

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts on re-running script
DROP POLICY IF EXISTS "Users can view their own exam questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Users can insert their own exam questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Users can update their own exam questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Users can delete their own exam questions" ON public.exam_questions;

-- Policy 1: Authenticated users can SELECT only their own rows
CREATE POLICY "Users can view their own exam questions"
    ON public.exam_questions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy 2: Authenticated users can INSERT only rows tied to their own auth.uid()
CREATE POLICY "Users can insert their own exam questions"
    ON public.exam_questions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy 3: Authenticated users can UPDATE only their own rows
CREATE POLICY "Users can update their own exam questions"
    ON public.exam_questions
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy 4: Authenticated users can DELETE only their own rows
CREATE POLICY "Users can delete their own exam questions"
    ON public.exam_questions
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Note on Anon/Unauthenticated:
-- Because RLS is enabled and NO policies grant permissions to the 'anon' role,
-- Supabase automatically rejects any unauthenticated query with an empty set or 401/403.
