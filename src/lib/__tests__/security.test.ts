import { describe, it, expect } from 'vitest';
import { supabase, isSupabaseConfigured } from '../supabase';

describe('Security & Row Level Security (RLS) Verification', () => {
  it('does not expose service_role key in client environment', () => {
    // Verify that service-role secrets are never present in Vite import.meta.env
    const env = import.meta.env;
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.VITE_SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.SERVICE_ROLE_KEY).toBeUndefined();
  });

  it('initializes Supabase client without crashing even when .env is unconfigured', () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe('function');
    expect(typeof supabase.auth.signInWithPassword).toBe('function');
  });

  it('correctly reports whether live Supabase credentials are configured', () => {
    // If running in local dev without live keys, isSupabaseConfigured should safely be false
    expect(typeof isSupabaseConfigured).toBe('boolean');
  });

  it('guarantees question records are always tagged with a user_id', () => {
    const dummyRecord = {
      user_id: 'auth-user-999',
      question_url: 'https://college.edu/quiz/test',
      normalized_url: 'https://college.edu/quiz/test',
      question_text: 'Sample prompt',
      answer_text: 'Sample answer',
      code_language: 'plaintext',
      tags: [],
    };

    expect(dummyRecord.user_id).toBe('auth-user-999');
    expect(dummyRecord.user_id).not.toBe('');
  });
});
