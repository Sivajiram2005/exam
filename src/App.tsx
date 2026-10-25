import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Edit3,
  Trash2,
  Copy,
  Check,
  Wifi,
  WifiOff,
  CloudOff,
  RefreshCw,
  ExternalLink,
  ClipboardPaste,
  X,
  AlertCircle,
  HelpCircle,
  Layers,
  Code2,
  Calendar,
  Save,
} from 'lucide-react';
import type { ExamQuestion, ExamQuestionInsert, ExamQuestionUpdate } from './types/database';
import {
  fetchUserQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  syncPendingChanges,
  getPendingSyncCount,
  isSupabaseConfigured,
} from './lib/supabase';
import { isValidUrl, findMatchingAnswers } from './lib/urlUtils';
import { CodeBlock } from './components/CodeBlock';

interface AnswerFormState {
  question_url: string;
  title: string;
  question_text: string;
  answer_text: string;
  code_snippet: string;
  code_language: string;
}

const emptyForm: AnswerFormState = {
  question_url: '',
  title: '',
  question_text: '',
  answer_text: '',
  code_snippet: '',
  code_language: 'plaintext',
};

export default function App() {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Search & matching state
  const [searchUrl, setSearchUrl] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState<ExamQuestion | null>(null);
  const [multipleMatches, setMultipleMatches] = useState<ExamQuestion[]>([]);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');

  // Library list filter
  const [libraryFilter, setLibraryFilter] = useState('');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AnswerFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation
  const [deleteCandidate, setDeleteCandidate] = useState<ExamQuestion | null>(null);

  // Feedback states
  const [answerCopied, setAnswerCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load questions from local IndexedDB
  const loadLocalQuestions = useCallback(async () => {
    try {
      const { data, error } = await fetchUserQuestions();
      if (!error && data) {
        setQuestions(data);
      }
      const pending = await getPendingSyncCount();
      setPendingSyncCount(pending);
    } catch (err) {
      console.error('Failed to load from IndexedDB', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger Supabase background sync
  const triggerSync = useCallback(async () => {
    if (!isSupabaseConfigured || typeof navigator === 'undefined' || !navigator.onLine) {
      return;
    }
    setSyncing(true);
    try {
      const res = await syncPendingChanges();
      if (res.pushed > 0 || res.pulled > 0 || res.deleted > 0) {
        await loadLocalQuestions();
      }
      const pending = await getPendingSyncCount();
      setPendingSyncCount(pending);
    } catch (err) {
      console.warn('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  }, [loadLocalQuestions]);

  // Initial load and network listeners
  useEffect(() => {
    void loadLocalQuestions().then(() => {
      if (navigator.onLine && isSupabaseConfigured) {
        void triggerSync();
      }
    });

    const handleOnline = () => {
      setIsOnline(true);
      showToast('Back online! Syncing changes...');
      void triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('You are offline. Full search and editing remains active locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic sync attempt if online
    const interval = window.setInterval(() => {
      if (navigator.onLine && isSupabaseConfigured) {
        void triggerSync();
      }
    }, 45000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(interval);
    };
  }, [loadLocalQuestions, triggerSync]);

  // Perform search by URL or fallback
  const handleSearch = (queryOverride?: string) => {
    const raw = queryOverride !== undefined ? queryOverride : searchUrl;
    const clean = raw.trim();
    if (!clean) return;

    setSearchAttempted(true);
    setLastSearchedQuery(clean);

    const result = findMatchingAnswers(questions, clean);

    if (result.matches.length === 1) {
      setSelectedAnswer(result.matches[0]);
      setMultipleMatches([]);
    } else if (result.matches.length > 1) {
      // Let user choose from multiple matches
      setMultipleMatches(result.matches);
      setSelectedAnswer(result.matches[0]);
    } else {
      setSelectedAnswer(null);
      setMultipleMatches([]);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setSearchUrl(text.trim());
        handleSearch(text.trim());
      }
    } catch {
      showToast('Clipboard access was blocked by browser.');
    }
  };

  const handleCopyAnswer = async () => {
    if (!selectedAnswer?.answer_text) return;
    try {
      await navigator.clipboard.writeText(selectedAnswer.answer_text);
      setAnswerCopied(true);
      setTimeout(() => setAnswerCopied(false), 2000);
      showToast('Answer copied with line breaks preserved!');
    } catch {
      showToast('Failed to copy to clipboard.');
    }
  };

  // Open modal for Adding
  const openAddModal = (prefillUrl?: string) => {
    setEditingId(null);
    setFormData({
      ...emptyForm,
      question_url: prefillUrl || searchUrl || '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  // Open modal for Editing
  const openEditModal = (item: ExamQuestion) => {
    setEditingId(item.id);
    setFormData({
      question_url: item.question_url,
      title: item.title || '',
      question_text: item.question_text || '',
      answer_text: item.answer_text,
      code_snippet: item.code_snippet || '',
      code_language: item.code_language || 'plaintext',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  // Save handler (Add or Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUrl = formData.question_url.trim();
    if (!cleanUrl) {
      setFormError('Question URL is required.');
      return;
    }

    if (!isValidUrl(cleanUrl)) {
      setFormError('Please enter a valid web URL (e.g. https://college.edu/quiz/q1).');
      return;
    }

    if (!formData.answer_text.trim()) {
      setFormError('Answer content cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        const updates: ExamQuestionUpdate = {
          question_url: cleanUrl,
          title: formData.title.trim() || null,
          question_text: formData.question_text.trim(),
          answer_text: formData.answer_text,
          code_snippet: formData.code_snippet.trim() ? formData.code_snippet : null,
          code_language: formData.code_snippet.trim() ? formData.code_language : 'plaintext',
        };
        const { data: updated, error } = await updateQuestion(editingId, updates);
        if (error || !updated) throw new Error(error || 'Failed to update record');

        await loadLocalQuestions();
        setSelectedAnswer(updated);
        showToast('Answer updated in local IndexedDB!');
      } else {
        const newRecord: ExamQuestionInsert = {
          user_id: 'local-user',
          question_url: cleanUrl,
          normalized_url: cleanUrl,
          title: formData.title.trim() || null,
          question_text: formData.question_text.trim(),
          answer_text: formData.answer_text,
          code_snippet: formData.code_snippet.trim() ? formData.code_snippet : null,
          code_language: formData.code_snippet.trim() ? formData.code_language : 'plaintext',
          tags: [],
        };
        const { data: created, error } = await createQuestion(newRecord);
        if (error || !created) throw new Error(error || 'Failed to create record');

        await loadLocalQuestions();
        setSelectedAnswer(created);
        setSearchUrl(created.question_url);
        showToast('Answer saved to local IndexedDB!');
      }

      setIsFormOpen(false);
      if (navigator.onLine && isSupabaseConfigured) {
        void triggerSync();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Storage write failed');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handler
  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      await deleteQuestion(deleteCandidate.id);
      await loadLocalQuestions();

      if (selectedAnswer?.id === deleteCandidate.id) {
        setSelectedAnswer(null);
        setMultipleMatches([]);
      }

      showToast('Answer deleted from device.');
      setDeleteCandidate(null);

      if (navigator.onLine && isSupabaseConfigured) {
        void triggerSync();
      }
    } catch (err) {
      showToast('Failed to delete answer: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // Filtered library view
  const filteredLibrary = useMemo(() => {
    if (!libraryFilter.trim()) return questions;
    const lower = libraryFilter.toLowerCase();
    return questions.filter(
      (q) =>
        q.question_url.toLowerCase().includes(lower) ||
        (q.title && q.title.toLowerCase().includes(lower)) ||
        (q.question_text && q.question_text.toLowerCase().includes(lower)) ||
        q.answer_text.toLowerCase().includes(lower)
    );
  }, [questions, libraryFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-800 text-emerald-300 border border-emerald-500/30 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-indigo-600 p-0.5 shadow-md">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <h1 className="font-bold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
              <span>ExamVault</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                IndexedDB Offline
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Private Offline Answer Storage & Rapid URL Lookup
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          {/* Online/Offline Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline</span>
              </>
            )}
          </div>

          {/* Sync Status Badge */}
          {isSupabaseConfigured ? (
            <button
              onClick={() => void triggerSync()}
              disabled={syncing || !isOnline}
              title={isOnline ? 'Click to synchronize with Supabase' : 'Will sync when connection returns'}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">
                {syncing
                  ? 'Syncing...'
                  : pendingSyncCount > 0
                  ? `${pendingSyncCount} pending`
                  : 'Cloud Synced'}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
              <CloudOff className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Local IndexedDB</span>
            </div>
          )}

          {/* Add Answer Quick Button */}
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Answer</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Search Bar Section */}
        <section className="p-4 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="relative flex items-center"
          >
            <div className="absolute left-3.5 text-slate-400 pointer-events-none">
              <Search className="w-5 h-5 text-emerald-400" />
            </div>
            <input
              type="text"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="Paste exact question URL (or search by keyword / title)..."
              className="w-full pl-11 pr-28 py-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <div className="absolute right-2 flex items-center gap-1.5">
              {searchUrl && (
                <button
                  type="button"
                  onClick={() => setSearchUrl('')}
                  title="Clear input"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePasteClipboard}
                title="Paste from clipboard and search immediately"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium border border-slate-700 transition-colors"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Paste</span>
              </button>
              <button
                type="submit"
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>Press Enter to search • Exact URL matched first, title/text fallback</span>
            <span>{questions.length} total answers stored locally</span>
          </div>
        </section>

        {/* Multiple Matches Picker (if multiple records match) */}
        {multipleMatches.length > 1 && (
          <section className="p-4 rounded-xl bg-slate-900 border border-indigo-500/40 space-y-3">
            <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Multiple answers match ({multipleMatches.length}). Select the one you want to view:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {multipleMatches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedAnswer(m)}
                  className={`text-left p-3 rounded-lg border transition-all text-xs ${
                    selectedAnswer?.id === m.id
                      ? 'bg-indigo-950/60 border-indigo-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold truncate">{m.title || 'Untitled Answer'}</div>
                  <div className="font-mono text-[10px] text-indigo-400 truncate">{m.question_url}</div>
                  <div className="text-slate-400 truncate mt-1">{m.answer_text}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ACTIVE ANSWER DISPLAY CARD */}
        {selectedAnswer ? (
          <article className="rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-2xl overflow-hidden divide-y divide-slate-800">
            {/* Answer Header Bar */}
            <div className="p-5 sm:p-6 bg-slate-950/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    Saved Answer
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-1.5">
                    {selectedAnswer.title || 'Exam Answer'}
                  </h2>
                </div>

                {/* Card Action Controls: Copy, Edit, Delete */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyAnswer}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors"
                  >
                    {answerCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Answer</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => openEditModal(selectedAnswer)}
                    title="Edit this answer"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setDeleteCandidate(selectedAnswer)}
                    title="Delete this answer"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Source Question URL */}
              <div className="text-xs font-mono text-emerald-400/90 break-all flex items-center gap-1">
                <span>URL:</span>
                <a
                  href={selectedAnswer.question_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline text-slate-300 hover:text-emerald-300 flex items-center gap-1"
                >
                  <span>{selectedAnswer.question_url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              {/* Question text / prompt (if provided) */}
              {selectedAnswer.question_text && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                  <span className="font-semibold text-slate-400 block mb-1">Question Prompt:</span>
                  {selectedAnswer.question_text}
                </div>
              )}
            </div>

            {/* Answer Content Area (Preserves formatting & line breaks) */}
            <div className="p-5 sm:p-6 space-y-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block mb-2">
                  Answer Content
                </span>
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-100 text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedAnswer.answer_text}
                </div>
              </div>

              {/* Optional Code Content (Preserves formatting & line breaks) */}
              {selectedAnswer.code_snippet && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1 mb-1">
                    <Code2 className="w-3.5 h-3.5" />
                    Code Content
                  </span>
                  <CodeBlock
                    code={selectedAnswer.code_snippet}
                    language={selectedAnswer.code_language || 'plaintext'}
                    title={selectedAnswer.title || 'Code Snippet'}
                  />
                </div>
              )}

              {/* Metadata Footer: Created & Modified Dates */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Created: {new Date(selectedAnswer.created_at).toLocaleString()}
                </span>
                <span>
                  Last modified: {new Date(selectedAnswer.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          </article>
        ) : searchAttempted ? (
          /* Answer Not Found State */
          <section className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Answer Not Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No matching answer found in local IndexedDB for:
            </p>
            <p className="text-xs font-mono text-emerald-400 break-all p-2 rounded-lg bg-slate-950 max-w-lg mx-auto border border-slate-800">
              {lastSearchedQuery}
            </p>
            <div className="pt-2">
              <button
                onClick={() => openAddModal(lastSearchedQuery)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Add Answer for this URL</span>
              </button>
            </div>
          </section>
        ) : null}

        {/* LIBRARY / SAVED ANSWERS SECTION */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Saved Answers Library</span>
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {questions.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                All saved answers persist locally in IndexedDB and work 100% offline.
              </p>
            </div>

            <button
              onClick={() => openAddModal()}
              className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Add New Answer</span>
            </button>
          </div>

          {/* Library Search/Filter bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={libraryFilter}
              onChange={(e) => setLibraryFilter(e.target.value)}
              placeholder="Filter library by question URL, title, or answer text..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* List of Saved Answers */}
          {loading ? (
            <div className="text-center py-10 text-xs text-slate-500">Loading local IndexedDB...</div>
          ) : filteredLibrary.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 space-y-1">
              <p>{libraryFilter ? 'No answers match the filter.' : 'Your offline library is empty.'}</p>
              {!libraryFilter && (
                <button
                  onClick={() => openAddModal()}
                  className="text-emerald-400 hover:underline font-semibold"
                >
                  Click here to save your first question & answer
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
              {filteredLibrary.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 sm:p-4 flex items-start justify-between gap-3 transition-colors ${
                    selectedAnswer?.id === item.id ? 'bg-emerald-950/20' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedAnswer(item);
                      setSearchUrl(item.question_url);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-left flex-1 min-w-0"
                  >
                    <div className="font-semibold text-xs sm:text-sm text-white truncate">
                      {item.title || item.question_url}
                    </div>
                    <div className="font-mono text-[11px] text-emerald-400 truncate mt-0.5">
                      {item.question_url}
                    </div>
                    <div className="text-xs text-slate-400 line-clamp-1 mt-1 font-sans">
                      {item.answer_text}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Modified {new Date(item.updated_at).toLocaleDateString()}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0 self-center">
                    <button
                      onClick={() => openEditModal(item)}
                      title="Edit Answer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteCandidate(item)}
                      title="Delete Answer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-4 py-4 text-center text-xs text-slate-500">
        <p>ExamVault • Offline Progressive Web App with IndexedDB</p>
      </footer>

      {/* ADD / EDIT MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <h3 className="text-base font-bold text-white">
                {editingId ? 'Edit Answer' : 'Add New Answer'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Question URL (Required) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Question URL <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.question_url}
                  onChange={(e) => setFormData({ ...formData, question_url: e.target.value })}
                  placeholder="https://college.edu/quiz/cs101/q5"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Question Title (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Title (Optional)
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. QuickSort Lomuto Partitioning"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Question Text (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Question Prompt (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.question_text}
                  onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                  placeholder="Paste question text if desired..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-emerald-500 focus:outline-none leading-relaxed"
                />
              </div>

              {/* Answer Content (Required, Multiline) */}
              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1">
                  Answer Content <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  value={formData.answer_text}
                  onChange={(e) => setFormData({ ...formData, answer_text: e.target.value })}
                  placeholder="Enter the complete answer or solution here (multiline supported)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-emerald-500/40 text-emerald-100 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none leading-relaxed"
                />
              </div>

              {/* Optional Code Content */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Optional Code Content
                </label>
                <textarea
                  rows={4}
                  value={formData.code_snippet}
                  onChange={(e) => setFormData({ ...formData, code_snippet: e.target.value })}
                  placeholder="Paste optional code block (syntax / algorithm / query)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Save and Cancel buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save Answer'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Delete Answer?</h3>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to delete the answer for:
            </p>
            <p className="text-xs font-mono text-emerald-400 break-all p-2 rounded-lg bg-slate-950 border border-slate-800">
              {deleteCandidate.title || deleteCandidate.question_url}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
