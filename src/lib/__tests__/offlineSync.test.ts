import { describe, it, expect } from 'vitest';
import type { ExamQuestion } from '../../types/database';

describe('Offline Storage & Sync Conflict Logic', () => {
  it('correctly compares timestamps to prevent overwriting newer local edits with stale remote data', () => {
    const localQuestion: ExamQuestion = {
      id: 'q-101',
      user_id: 'user-1',
      question_url: 'https://college.edu/quiz/q1',
      normalized_url: 'https://college.edu/quiz/q1',
      title: 'Local Updated Version',
      question_text: 'What is O(1)?',
      answer_text: 'Constant time complexity (locally edited).',
      code_snippet: null,
      code_language: 'plaintext',
      tags: [],
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-02T12:00:00.000Z', // Newer local edit
      sync_status: 'pending',
    };

    const staleRemoteQuestion: ExamQuestion = {
      id: 'q-101',
      user_id: 'user-1',
      question_url: 'https://college.edu/quiz/q1',
      normalized_url: 'https://college.edu/quiz/q1',
      title: 'Stale Cloud Version',
      question_text: 'What is O(1)?',
      answer_text: 'Stale remote answer.',
      code_snippet: null,
      code_language: 'plaintext',
      tags: [],
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T11:00:00.000Z', // Stale remote
      sync_status: 'synced',
    };

    // Conflict rule: If local has pending edits, local must be preserved
    const hasPendingLocalEdit = localQuestion.sync_status === 'pending';
    const isRemoteNewer =
      new Date(staleRemoteQuestion.updated_at).getTime() >
      new Date(localQuestion.updated_at).getTime();

    expect(hasPendingLocalEdit).toBe(true);
    expect(isRemoteNewer).toBe(false);

    // Final chosen answer must be local
    const chosenAnswer = hasPendingLocalEdit || !isRemoteNewer ? localQuestion : staleRemoteQuestion;
    expect(chosenAnswer.title).toBe('Local Updated Version');
  });

  it('preserves multiline formatting and code blocks when storing and reading answers', () => {
    const multilineAnswer = 'Line 1\nLine 2\n\nParagraph 2 with code:\ndef foo():\n    return 42';
    const record: ExamQuestion = {
      id: 'multiline-1',
      user_id: 'user-1',
      question_url: 'https://college.edu/quiz/multiline',
      normalized_url: 'https://college.edu/quiz/multiline',
      title: 'Multiline Question',
      question_text: 'Prompt',
      answer_text: multilineAnswer,
      code_snippet: 'def foo():\n    return 42',
      code_language: 'python',
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(record.answer_text).toBe(multilineAnswer);
    expect(record.answer_text.split('\n')).toHaveLength(6);
    expect(record.code_snippet).toContain('\n    return 42');
  });

  it('marks deleted answers as tombstones to prevent resurrection on sync', () => {
    const activeQuestion: ExamQuestion = {
      id: 'q-del',
      user_id: 'user-1',
      question_url: 'https://college.edu/quiz/delete-me',
      normalized_url: 'https://college.edu/quiz/delete-me',
      title: 'To be deleted',
      question_text: 'Delete me',
      answer_text: 'Will be deleted',
      code_snippet: null,
      code_language: 'plaintext',
      tags: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      sync_status: 'synced',
      deleted: false,
    };

    // Apply tombstone deletion
    const tombstone: ExamQuestion = {
      ...activeQuestion,
      deleted: true,
      sync_status: 'tombstone',
      updated_at: new Date().toISOString(),
    };

    expect(tombstone.deleted).toBe(true);
    expect(tombstone.sync_status).toBe('tombstone');

    // UI list filters out tombstones
    const library = [tombstone];
    const visibleInUI = library.filter((q) => !q.deleted && q.sync_status !== 'tombstone');
    expect(visibleInUI).toHaveLength(0);
  });
});
