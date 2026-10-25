import Papa from 'papaparse';
import type { ExamQuestion, ExamQuestionInsert, CSVQuestionRow } from '../types/database';
import { normalizeUrl } from './urlUtils';

export interface CSVParseResult {
  valid: ExamQuestionInsert[];
  errors: string[];
  totalParsed: number;
}

/**
 * Generates a clean CSV file string from an array of questions.
 */
export function exportQuestionsToCSV(questions: ExamQuestion[]): string {
  const exportData = questions.map((q) => ({
    question_url: q.question_url,
    title: q.title || '',
    question_text: q.question_text,
    answer_text: q.answer_text,
    code_snippet: q.code_snippet || '',
    code_language: q.code_language || 'plaintext',
    tags: (q.tags || []).join('; '),
  }));

  return Papa.unparse(exportData, {
    quotes: true,
    header: true,
  });
}

/**
 * Downloads a CSV string as a file in the user's browser.
 */
export function downloadCSV(csvContent: string, filename: string = 'exam_questions.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Returns a starter CSV template string with examples.
 */
export function getSampleCSVTemplate(): string {
  const sampleRows: CSVQuestionRow[] = [
    {
      question_url: 'https://college.edu/quizzes/cs101/question/1',
      title: 'Time Complexity of Binary Search',
      question_text: 'What is the worst-case time complexity of binary search on a sorted array of size n, and why?',
      answer_text: 'The worst-case time complexity is O(log n). Each iteration divides the search interval in half until the element is found or the subarray becomes empty.',
      code_snippet: 'def binary_search(arr, target):\n    low, high = 0, len(arr) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1',
      code_language: 'python',
      tags: 'Algorithms; CS101; Midterm',
    },
    {
      question_url: 'https://college.edu/quizzes/cs101/question/2',
      title: 'SQL Inner Join vs Left Join',
      question_text: 'Explain the difference between an INNER JOIN and a LEFT JOIN in PostgreSQL.',
      answer_text: 'An INNER JOIN returns only rows that have matching values in both tables. A LEFT JOIN returns all rows from the left table, and the matched rows from the right table (or NULL if no match exists).',
      code_snippet: 'SELECT u.id, u.name, o.total\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id;',
      code_language: 'sql',
      tags: 'Databases; SQL; Quiz2',
    },
  ];

  return Papa.unparse(sampleRows, { quotes: true, header: true });
}

/**
 * Parses user-uploaded CSV file and validates required fields.
 */
export function parseQuestionsCSV(csvText: string, currentUserId: string): Promise<CSVParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const valid: ExamQuestionInsert[] = [];
        const errors: string[] = [];

        results.data.forEach((row, index) => {
          const rowNum = index + 2; // +1 for 0-index, +1 for header line
          
          // Case-insensitive key matching for common CSV headers
          const getField = (keys: string[]): string => {
            for (const key of keys) {
              const matchedKey = Object.keys(row).find(
                (k) => k.trim().toLowerCase() === key.toLowerCase()
              );
              if (matchedKey && row[matchedKey] !== undefined) {
                return row[matchedKey].trim();
              }
            }
            return '';
          };

          const question_url = getField(['question_url', 'url', 'question url']);
          const question_text = getField(['question_text', 'question', 'question text', 'prompt']);
          const answer_text = getField(['answer_text', 'answer', 'answer text', 'solution']);
          const title = getField(['title', 'name', 'subject']);
          const code_snippet = getField(['code_snippet', 'code', 'snippet']);
          const code_language = getField(['code_language', 'language', 'lang']) || 'plaintext';
          const tagsRaw = getField(['tags', 'categories', 'category']);

          if (!question_url) {
            errors.push(`Row ${rowNum}: Missing required 'question_url'.`);
            return;
          }

          if (!question_text) {
            errors.push(`Row ${rowNum}: Missing required 'question_text'.`);
            return;
          }

          if (!answer_text) {
            errors.push(`Row ${rowNum}: Missing required 'answer_text'.`);
            return;
          }

          // Parse tags from semicolon or comma separated string
          const tags = tagsRaw
            ? tagsRaw
                .split(/[;,]/)
                .map((t) => t.trim())
                .filter((t) => t.length > 0)
            : [];

          valid.push({
            user_id: currentUserId,
            question_url,
            normalized_url: normalizeUrl(question_url),
            title: title || null,
            question_text,
            answer_text,
            code_snippet: code_snippet || null,
            code_language: code_language.toLowerCase(),
            tags,
          });
        });

        resolve({
          valid,
          errors,
          totalParsed: results.data.length,
        });
      },
      error: (err: Error) => {
        resolve({
          valid: [],
          errors: [`Failed to parse CSV: ${err.message}`],
          totalParsed: 0,
        });
      },
    });
  });
}
