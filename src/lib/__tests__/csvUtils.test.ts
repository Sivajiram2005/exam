import { describe, it, expect } from 'vitest';
import {
  parseQuestionsCSV,
  exportQuestionsToCSV,
  getSampleCSVTemplate,
} from '../csvUtils';
import type { ExamQuestion } from '../../types/database';

describe('csvUtils', () => {
  const currentUserId = 'test-user-uuid-123';

  describe('parseQuestionsCSV', () => {
    it('successfully parses valid question rows', async () => {
      const csv = `question_url,title,question_text,answer_text,code_snippet,code_language,tags
https://college.edu/q1,Binary Search,What is runtime?,O(log n),def search(): pass,python,Algorithms; CS101
https://college.edu/q2,DB Index,What is B-Tree?,Balanced tree,SELECT * FROM tbl,sql,Database`;

      const result = await parseQuestionsCSV(csv, currentUserId);

      expect(result.errors).toHaveLength(0);
      expect(result.valid).toHaveLength(2);
      expect(result.totalParsed).toBe(2);

      const first = result.valid[0];
      expect(first.user_id).toBe(currentUserId);
      expect(first.question_url).toBe('https://college.edu/q1');
      expect(first.title).toBe('Binary Search');
      expect(first.question_text).toBe('What is runtime?');
      expect(first.answer_text).toBe('O(log n)');
      expect(first.code_snippet).toBe('def search(): pass');
      expect(first.code_language).toBe('python');
      expect(first.tags).toEqual(['Algorithms', 'CS101']);
    });

    it('handles multiline answers and quoted strings with commas', async () => {
      const csv = `question_url,question_text,answer_text
"https://college.edu/q/complex","Explain polymorphism, inheritance, and encapsulation.","Polymorphism allows objects to be treated as instances of their parent class.\n\nInheritance allows code reuse.\nEncapsulation hides state."`;

      const result = await parseQuestionsCSV(csv, currentUserId);

      expect(result.errors).toHaveLength(0);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].answer_text).toContain('\n\n');
      expect(result.valid[0].answer_text).toContain('Encapsulation hides state.');
    });

    it('detects and reports missing required fields', async () => {
      const csv = `question_url,question_text,answer_text
,Missing URL question,Some answer
https://college.edu/q2,,Missing question text
https://college.edu/q3,Valid question,`;

      const result = await parseQuestionsCSV(csv, currentUserId);

      expect(result.valid).toHaveLength(0);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain("Missing required 'question_url'");
      expect(result.errors[1]).toContain("Missing required 'question_text'");
      expect(result.errors[2]).toContain("Missing required 'answer_text'");
    });
  });

  describe('exportQuestionsToCSV', () => {
    it('correctly serializes questions to CSV format', () => {
      const questions: ExamQuestion[] = [
        {
          id: '1',
          user_id: currentUserId,
          question_url: 'https://college.edu/q1',
          normalized_url: 'https://college.edu/q1',
          title: 'Title 1',
          question_text: 'Question text 1',
          answer_text: 'Answer text 1',
          code_snippet: 'console.log("hello");',
          code_language: 'javascript',
          tags: ['CS101', 'Intro'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const csv = exportQuestionsToCSV(questions);
      expect(csv).toContain('"question_url"');
      expect(csv).toContain('"https://college.edu/q1"');
      expect(csv).toContain('"Question text 1"');
      expect(csv).toContain('"Answer text 1"');
      expect(csv).toContain('"console.log(""hello"");"');
      expect(csv).toContain('"CS101; Intro"');
    });
  });

  describe('getSampleCSVTemplate', () => {
    it('returns a non-empty sample template with expected headers', () => {
      const template = getSampleCSVTemplate();
      expect(template).toContain('question_url');
      expect(template).toContain('question_text');
      expect(template).toContain('answer_text');
    });
  });
});
