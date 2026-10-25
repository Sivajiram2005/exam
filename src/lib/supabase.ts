import { createClient } from '@supabase/supabase-js';
import type { ExamQuestion, ExamQuestionInsert, ExamQuestionUpdate } from '../types/database';
import { normalizeUrl } from './urlUtils';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('your-anon-key-here') &&
  !supabaseUrl.includes('your-project-id')
);

// Fallback client: Used strictly for optional online background synchronization.
// No service-role keys are ever exposed, and the app never blocks on this client.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

// ============================================================================
// IndexedDB Primary Storage Engine
// ============================================================================
const DB_NAME = 'exam_answers_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'answers';

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
}

export function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB is not supported in this browser environment.'));
  }

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by_url', 'question_url', { unique: false });
          store.createIndex('by_norm_url', 'normalized_url', { unique: false });
          store.createIndex('by_updated', 'updated_at', { unique: false });
          store.createIndex('by_sync', 'sync_status', { unique: false });
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        dbInstance.onversionchange = () => {
          dbInstance?.close();
          dbInstance = null;
          dbPromise = null;
        };
        resolve(request.result);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open local IndexedDB database.'));
      };

      request.onblocked = () => {
        console.warn('IndexedDB upgrade blocked by another open tab.');
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

// In-memory fallback if IndexedDB is blocked (e.g. strict private window error)
const memoryStore = new Map<string, ExamQuestion>();

async function getAllFromStore(): Promise<ExamQuestion[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as ExamQuestion[]) || []);
      req.onerror = () => reject(req.error || new Error('Failed to read from IndexedDB'));
    });
  } catch (err) {
    console.warn('Falling back to memory store:', err);
    return Array.from(memoryStore.values());
  }
}

async function putInStore(item: ExamQuestion): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(item);

      req.onsuccess = () => {
        memoryStore.set(item.id, item);
        resolve();
      };
      req.onerror = () => {
        // Check for QuotaExceededError
        if (req.error?.name === 'QuotaExceededError') {
          reject(new Error('Browser storage quota exceeded. Please free up disk space.'));
        } else {
          reject(req.error || new Error('Failed to write to IndexedDB'));
        }
      };
    });
  } catch (err) {
    memoryStore.set(item.id, item);
    console.warn('Saved to memory fallback:', err);
  }
}

async function deleteFromStore(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        memoryStore.delete(id);
        resolve();
      };
      req.onerror = () => reject(req.error || new Error('Failed to delete from IndexedDB'));
    });
  } catch (err) {
    memoryStore.delete(id);
  }
}

// ============================================================================
// Legacy Data Migration (from old localStorage keys into IndexedDB)
// ============================================================================
async function migrateLegacyLocalStorage() {
  if (typeof window === 'undefined') return;
  const migrationKey = 'exam_antigravity_idb_migrated_v2';
  if (localStorage.getItem(migrationKey)) return;

  const legacyKey = 'exam_antigravity_mock_questions';
  const raw = localStorage.getItem(legacyKey);
  if (raw) {
    try {
      const oldQuestions = JSON.parse(raw) as ExamQuestion[];
      for (const old of oldQuestions) {
        if (!old.id || !old.question_url) continue;
        const exists = (await getAllFromStore()).some((item) => item.question_url === old.question_url);
        if (!exists) {
          await putInStore({
            ...old,
            sync_status: 'pending',
            deleted: false,
          });
        }
      }
    } catch (e) {
      console.warn('Migration warning:', e);
    }
  }
  localStorage.setItem(migrationKey, 'true');
}

// Trigger initial migration silently
if (typeof window !== 'undefined') {
  void migrateLegacyLocalStorage();
}

const nowIso = () => new Date().toISOString();
const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));

// ============================================================================
// Public API for Answering Operations (100% Offline Capable via IndexedDB)
// ============================================================================

/**
 * Fetches all saved questions from local IndexedDB. Never blocks on network.
 */
export async function fetchUserQuestions(): Promise<{ data: ExamQuestion[]; error: string | null }> {
  try {
    const all = await getAllFromStore();
    // Filter out tombstones and sort by most recently updated
    const active = all
      .filter((q) => !q.deleted && q.sync_status !== 'tombstone')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    return { data: active, error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Storage read error' };
  }
}

/**
 * Searches local IndexedDB for exact URL match first, then normalized URL.
 */
export async function lookupQuestionByUrl(
  url: string,
  exactOnly: boolean = false
): Promise<{ data: ExamQuestion | null; error: string | null }> {
  const { data: questions } = await fetchUserQuestions();
  const clean = url.trim();

  // 1. Exact URL match
  const exact = questions.find((q) => q.question_url.trim() === clean);
  if (exact) return { data: exact, error: null };

  // 2. Normalized URL match if exact-only is not enforced
  if (!exactOnly) {
    const norm = normalizeUrl(clean);
    const normalized = questions.find(
      (q) => q.normalized_url === norm || q.question_url.toLowerCase().trim() === clean.toLowerCase()
    );
    if (normalized) return { data: normalized, error: null };
  }

  return { data: null, error: null };
}

/**
 * Creates and saves an answer directly to local IndexedDB.
 */
export async function createQuestion(
  item: ExamQuestionInsert
): Promise<{ data: ExamQuestion | null; error: string | null }> {
  try {
    const timestamp = nowIso();
    const newQuestion: ExamQuestion = {
      ...item,
      id: generateId(),
      user_id: item.user_id || 'local-user',
      created_at: timestamp,
      updated_at: timestamp,
      sync_status: 'pending',
      deleted: false,
    };

    await putInStore(newQuestion);
    return { data: newQuestion, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to save to local IndexedDB' };
  }
}

/**
 * Updates an answer record directly in local IndexedDB.
 */
export async function updateQuestion(
  id: string,
  updates: ExamQuestionUpdate
): Promise<{ data: ExamQuestion | null; error: string | null }> {
  try {
    const all = await getAllFromStore();
    const existing = all.find((q) => q.id === id);
    if (!existing) return { data: null, error: 'Question not found' };

    const updated: ExamQuestion = {
      ...existing,
      ...updates,
      updated_at: nowIso(),
      sync_status: 'pending',
    };

    await putInStore(updated);
    return { data: updated, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to update in local IndexedDB' };
  }
}

/**
 * Deletes an answer record.
 * Uses a tombstone so offline deletions are safely propagated to Supabase on reconnection.
 */
export async function deleteQuestion(id: string): Promise<{ error: string | null }> {
  try {
    const all = await getAllFromStore();
    const existing = all.find((q) => q.id === id);
    if (!existing) return { error: null };

    if (isSupabaseConfigured) {
      // Mark as tombstone for sync propagation
      await putInStore({
        ...existing,
        deleted: true,
        sync_status: 'tombstone',
        updated_at: nowIso(),
      });
    } else {
      // If Supabase is not configured, directly remove from IndexedDB
      await deleteFromStore(id);
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete record' };
  }
}

/**
 * Returns the count of local changes pending synchronization with Supabase.
 */
export async function getPendingSyncCount(): Promise<number> {
  try {
    const all = await getAllFromStore();
    return all.filter((q) => q.sync_status === 'pending' || q.sync_status === 'tombstone' || q.deleted).length;
  } catch {
    return 0;
  }
}

// ============================================================================
// Online Synchronization Engine (Optional, Non-blocking)
// ============================================================================
export interface SyncResult {
  pushed: number;
  pulled: number;
  deleted: number;
  error: string | null;
}

/**
 * Synchronizes local IndexedDB with Supabase when online.
 * - Respects tombstones for deletions.
 * - Pushes pending local changes.
 * - Pulls remote rows and merges them safely without overwriting newer local edits.
 */
export async function syncPendingChanges(): Promise<SyncResult> {
  if (!isSupabaseConfigured || typeof navigator === 'undefined' || !navigator.onLine) {
    return { pushed: 0, pulled: 0, deleted: 0, error: null };
  }

  let pushed = 0;
  let pulled = 0;
  let deletedCount = 0;

  try {
    // 1. Check if an authenticated user session is active in Supabase
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      // No active session: keep local data in IndexedDB without throwing
      return { pushed: 0, pulled: 0, deleted: 0, error: 'No active Supabase session for backup.' };
    }

    const currentUserId = sessionData.session.user.id;
    const allLocal = await getAllFromStore();

    // 2. Push Pending Local Changes & Tombstones to Supabase
    for (const item of allLocal) {
      if (item.deleted || item.sync_status === 'tombstone') {
        // Delete remotely
        const { error: delError } = await supabase
          .from('exam_questions')
          .delete()
          .eq('id', item.id)
          .eq('user_id', currentUserId);

        if (!delError) {
          await deleteFromStore(item.id);
          deletedCount++;
        }
        continue;
      }

      if (item.sync_status === 'pending') {
        const remoteRow = {
          id: item.id,
          user_id: currentUserId,
          question_url: item.question_url,
          normalized_url: item.normalized_url,
          title: item.title,
          question_text: item.question_text,
          answer_text: item.answer_text,
          code_snippet: item.code_snippet,
          code_language: item.code_language || 'plaintext',
          tags: item.tags || [],
          updated_at: item.updated_at,
        };

        const { error: upsertError } = await supabase
          .from('exam_questions')
          .upsert(remoteRow, { onConflict: 'user_id,question_url' });

        if (!upsertError) {
          await putInStore({ ...item, sync_status: 'synced', user_id: currentUserId });
          pushed++;
        }
      }
    }

    // 3. Pull Remote Rows from Supabase and Merge
    const { data: remoteData, error: pullError } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('user_id', currentUserId);

    if (pullError) {
      return { pushed, pulled, deleted: deletedCount, error: pullError.message };
    }

    if (remoteData && remoteData.length > 0) {
      const refreshedLocal = await getAllFromStore();
      const localByUrl = new Map(refreshedLocal.map((q) => [q.question_url, q]));
      const localById = new Map(refreshedLocal.map((q) => [q.id, q]));

      for (const remote of remoteData as ExamQuestion[]) {
        const existing = localById.get(remote.id) || localByUrl.get(remote.question_url);

        // Conflict check: never overwrite newer local data that has pending local edits
        if (existing) {
          if (existing.sync_status === 'pending' || existing.deleted) {
            // Keep the local newer edit
            continue;
          }

          // If remote is newer than local, update local
          if (new Date(remote.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
            await putInStore({ ...remote, sync_status: 'synced' });
            pulled++;
          }
        } else {
          // New remote question: insert locally
          await putInStore({ ...remote, sync_status: 'synced' });
          pulled++;
        }
      }
    }

    return { pushed, pulled, deleted: deletedCount, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    return { pushed, pulled, deleted: deletedCount, error: msg };
  }
}
