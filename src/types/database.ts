export type SyncStatus = 'synced' | 'pending' | 'tombstone';

export interface ExamQuestion {
  id: string;
  user_id: string;
  question_url: string;
  normalized_url: string;
  title: string | null;
  question_text: string;
  answer_text: string;
  code_snippet: string | null;
  code_language: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  sync_status?: SyncStatus;
  deleted?: boolean;
}

export type ExamQuestionInsert = Omit<ExamQuestion, 'id' | 'created_at' | 'updated_at'>;

export type ExamQuestionUpdate = Partial<Omit<ExamQuestion, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface CSVQuestionRow {
  question_url: string;
  title?: string;
  question_text: string;
  answer_text: string;
  code_snippet?: string;
  code_language?: string;
  tags?: string;
}
