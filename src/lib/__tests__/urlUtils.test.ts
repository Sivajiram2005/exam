import { describe, it, expect } from 'vitest';
import { normalizeUrl, isValidUrl, matchQuestionUrl, findMatchingAnswers } from '../urlUtils';
import type { ExamQuestion } from '../../types/database';

describe('urlUtils', () => {
  describe('normalizeUrl', () => {
    it('removes trailing slashes from pathnames', () => {
      const url1 = 'https://college.edu/quizzes/exam1/q1/';
      const url2 = 'https://college.edu/quizzes/exam1/q1';
      expect(normalizeUrl(url1)).toBe(normalizeUrl(url2));
      expect(normalizeUrl(url1)).toBe('https://college.edu/quizzes/exam1/q1');
    });

    it('lowercases domain name while preserving path casing', () => {
      const url = 'https://College.EDU/Quizzes/Exam1/Q1';
      expect(normalizeUrl(url)).toBe('https://college.edu/Quizzes/Exam1/Q1');
    });

    it('strips url fragment/hash', () => {
      const url = 'https://college.edu/quiz/q1#section-2';
      expect(normalizeUrl(url)).toBe('https://college.edu/quiz/q1');
    });

    it('sorts search params deterministically without losing params', () => {
      const url1 = 'https://college.edu/quiz?b=2&a=1&qid=100';
      const url2 = 'https://college.edu/quiz?qid=100&a=1&b=2';
      expect(normalizeUrl(url1)).toBe(normalizeUrl(url2));
      expect(normalizeUrl(url1)).toContain('qid=100');
    });

    it('handles URLs entered without protocol', () => {
      const url = 'college.edu/quizzes/exam1/q1/';
      expect(normalizeUrl(url)).toBe('https://college.edu/quizzes/exam1/q1');
    });
  });

  describe('isValidUrl', () => {
    it('identifies valid full URLs', () => {
      expect(isValidUrl('https://canvas.harvard.edu/courses/101/quizzes/50')).toBe(true);
      expect(isValidUrl('http://localhost:3000/quiz/1')).toBe(true);
      expect(isValidUrl('college.edu/exam/q1')).toBe(true);
    });

    it('rejects empty and invalid strings', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('   ')).toBe(false);
      expect(isValidUrl('just random text')).toBe(false);
    });
  });

  describe('matchQuestionUrl', () => {
    const question = {
      question_url: 'https://college.edu/quizzes/q1/',
      normalized_url: 'https://college.edu/quizzes/q1',
    };

    it('matches exact string when exactOnly is true', () => {
      expect(matchQuestionUrl(question, 'https://college.edu/quizzes/q1/', true)).toBe(true);
      expect(matchQuestionUrl(question, 'https://college.edu/quizzes/q1', true)).toBe(false);
    });

    it('matches flexibly when exactOnly is false', () => {
      expect(matchQuestionUrl(question, 'https://college.edu/quizzes/q1', false)).toBe(true);
      expect(matchQuestionUrl(question, 'https://College.edu/quizzes/q1/', false)).toBe(true);
      expect(matchQuestionUrl(question, 'https://college.edu/quizzes/q2', false)).toBe(false);
    });
  });

  describe('findMatchingAnswers', () => {
    const questions: ExamQuestion[] = [
      {
        id: '1',
        user_id: 'user1',
        question_url: 'https://college.edu/quiz/q1',
        normalized_url: 'https://college.edu/quiz/q1',
        title: 'Binary Search Worst Case',
        question_text: 'What is runtime of binary search?',
        answer_text: 'O(log n) time complexity.',
        code_snippet: 'def binary_search(): pass',
        code_language: 'python',
        tags: ['Algorithms'],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        user_id: 'user1',
        question_url: 'https://college.edu/quiz/q2/',
        normalized_url: 'https://college.edu/quiz/q2',
        title: 'Merge Sort Stability',
        question_text: 'Is merge sort a stable sorting algorithm?',
        answer_text: 'Yes, merge sort is stable.',
        code_snippet: null,
        code_language: 'plaintext',
        tags: ['Sorting'],
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
      {
        id: '3',
        user_id: 'user1',
        question_url: 'https://college.edu/quiz/q3',
        normalized_url: 'https://college.edu/quiz/q3',
        title: 'QuickSort Stability',
        question_text: 'Is quicksort stable?',
        answer_text: 'Default quicksort is not stable.',
        code_snippet: null,
        code_language: 'plaintext',
        tags: ['Sorting'],
        created_at: '2026-01-03T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
      },
    ];

    it('matches exact URL first', () => {
      const res = findMatchingAnswers(questions, 'https://college.edu/quiz/q1');
      expect(res.matchType).toBe('exact-url');
      expect(res.matches).toHaveLength(1);
      expect(res.matches[0].id).toBe('1');
    });

    it('matches normalized URL when exact string differs by trailing slash', () => {
      const res = findMatchingAnswers(questions, 'https://college.edu/quiz/q2');
      expect(res.matchType).toBe('normalized-url');
      expect(res.matches).toHaveLength(1);
      expect(res.matches[0].id).toBe('2');
    });

    it('falls back to search by title or question text when URL does not match', () => {
      const res = findMatchingAnswers(questions, 'runtime of binary search');
      expect(res.matchType).toBe('text-fallback');
      expect(res.matches).toHaveLength(1);
      expect(res.matches[0].id).toBe('1');
    });

    it('returns multiple records when query matches multiple questions so user can choose', () => {
      const res = findMatchingAnswers(questions, 'Stability');
      expect(res.matchType).toBe('text-fallback');
      expect(res.matches).toHaveLength(2);
      expect(res.matches.map((m) => m.id)).toEqual(['2', '3']);
    });

    it('returns empty when no match is found', () => {
      const res = findMatchingAnswers(questions, 'https://unknown-university.edu/q99');
      expect(res.matchType).toBe('none');
      expect(res.matches).toHaveLength(0);
    });
  });
});
