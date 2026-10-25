import type { ExamQuestion } from '../types/database';

/**
 * URL utility functions for Exam Answer Lookup
 */

export function normalizeUrl(url: string): string {
  if (!url) return '';
  
  const trimmed = url.trim();
  
  // If user pasted without protocol, temporarily add https:// for parsing
  const hasProtocol = /^[a-zA-Z]+:\/\//.test(trimmed);
  const parseTarget = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(parseTarget);
    
    // Normalize hostname to lowercase
    const host = parsed.hostname.toLowerCase();
    
    // Strip trailing slash from pathname if length > 1
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Preserve search params sorted for deterministic matching without losing question IDs
    const searchParams = new URLSearchParams(parsed.search);
    searchParams.sort();
    const searchString = searchParams.toString() ? `?${searchParams.toString()}` : '';

    // Ignore hash/fragment for exam question lookup matching
    return `${parsed.protocol}//${host}${parsed.port ? `:${parsed.port}` : ''}${pathname}${searchString}`;
  } catch {
    // Fallback: simple string cleanup if not a valid URL
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

export function isValidUrl(input: string): boolean {
  if (!input || !input.trim()) return false;
  const trimmed = input.trim();
  
  try {
    const hasProtocol = /^[a-zA-Z]+:\/\//.test(trimmed);
    const url = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    return url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function matchQuestionUrl(
  question: { question_url: string; normalized_url: string },
  query: string,
  exactOnly: boolean = false
): boolean {
  if (!query) return false;
  const cleanQuery = query.trim();

  // Exact match check (case-sensitive or trimmed match)
  if (question.question_url.trim() === cleanQuery) {
    return true;
  }

  // If user does not require strict character-for-character exact match, try normalized
  if (!exactOnly) {
    const normQuery = normalizeUrl(cleanQuery);
    return question.normalized_url === normQuery || 
           question.question_url.toLowerCase().trim() === cleanQuery.toLowerCase();
  }

  return false;
}

export interface SearchMatchResult {
  matches: ExamQuestion[];
  matchType: 'exact-url' | 'normalized-url' | 'text-fallback' | 'none';
}

/**
 * Searches questions with exact URL priority, followed by normalized URL,
 * and falls back to question title, prompt, or answer text.
 * Allows user to choose between multiple matches if more than one record matches.
 */
export function findMatchingAnswers(questions: ExamQuestion[], query: string): SearchMatchResult {
  const clean = query.trim();
  if (!clean) {
    return { matches: [], matchType: 'none' };
  }

  // 1. Exact URL Match Priority
  const exactMatches = questions.filter((q) => q.question_url.trim() === clean);
  if (exactMatches.length > 0) {
    return { matches: exactMatches, matchType: 'exact-url' };
  }

  // 2. Normalized URL Match
  const normQuery = normalizeUrl(clean);
  const normMatches = questions.filter(
    (q) =>
      q.normalized_url === normQuery ||
      q.question_url.toLowerCase().trim() === clean.toLowerCase()
  );
  if (normMatches.length > 0) {
    return { matches: normMatches, matchType: 'normalized-url' };
  }

  // 3. Fallback: Search in question title or text or answer content
  const lower = clean.toLowerCase();
  const textMatches = questions.filter(
    (q) =>
      (q.title && q.title.toLowerCase().includes(lower)) ||
      (q.question_text && q.question_text.toLowerCase().includes(lower)) ||
      (q.tags && q.tags.some((t) => t.toLowerCase().includes(lower))) ||
      q.answer_text.toLowerCase().includes(lower)
  );

  if (textMatches.length > 0) {
    return { matches: textMatches, matchType: 'text-fallback' };
  }

  return { matches: [], matchType: 'none' };
}
