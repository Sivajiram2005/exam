# ExamVault - Offline-First Exam Answer Lookup

A fast, responsive, offline-first Progressive Web App (PWA) designed to store and look up exam questions, verified answers, and code snippets directly on your device.

## Core Architecture
- **Primary Local Database**: **IndexedDB** (`exam_answers_offline_db`). All questions, answers, and code blocks are stored locally on the device.
- **Offline App Shell & Asset Caching**: **Service Worker** (`sw.js`). Caches the complete HTML, CSS, JavaScript, icons, and web manifest.
- **PWA Ready**: Installable as a standalone desktop or mobile application.
- **Online Backup (Optional)**: Synchronizes local IndexedDB changes with Supabase PostgreSQL when an internet connection and credentials are available.
- **No External CDN / Remote Font Dependencies**: Built entirely with self-contained system font stacks and bundled icons.

---

## What Was Modified

1. **Removed Authentication & Unnecessary Pages**:
   - Removed login, signup, auth guards, dashboards, and analytics pages.
   - The interface is now a clean, focused single-page answer lookup and management workspace.
   - **Security Note on Authentication Removal**: The website URL is no longer protected by a login screen. Anyone who opens the URL on a specific device will access the local IndexedDB database of that specific device. Data stored offline stays locally on the device and is not encrypted unless full-disk device encryption (e.g. BitLocker/FileVault) is active on the operating system.

2. **Main Interface**:
   - **Question URL Search Bar**: Paste question URL with "Paste from Clipboard" button, Enter-key support, and Search button.
   - **Intelligent URL Matching**: Matches exact URL first, normalized URL second, and falls back to question prompt/title/answer text.
   - **Multiple Matches Selection**: If multiple questions match a query or keyword, presents selectable cards so you can pick the exact answer to view.
   - **Answer Display**: Formatted answer content (preserving all line breaks) with one-click **Copy Answer** button.
   - **Code Display**: Monospace code blocks with line numbers, language tag, and dedicated **Copy Code** button.
   - **Add / Edit / Delete**: Add, edit, and delete questions with confirmation dialog, plus explicit **Save** and **Cancel** buttons.
   - **Clear "Answer not found" State**: Shows a clear message with a direct button to "Add Answer for this URL".
   - **Real-Time Online/Offline Indicator**: Displays whether the browser is connected to the internet (`Online`) or running disconnected (`Offline`), along with cloud sync status.
   - **Saved Answers Library**: Full search/filter bar to browse all saved questions with created and modified dates.

3. **Offline Storage via IndexedDB**:
   - Replaced localStorage with IndexedDB as the primary storage engine.
   - Automatic migration: Any legacy answers from previous testing are safely migrated to IndexedDB on first launch.
   - Quota handling: Gracefully catches quota errors and storage exceptions.

4. **Background Synchronization (Supabase)**:
   - When offline, changes are queued locally with `sync_status: 'pending'`.
   - Deletions are marked with tombstones (`deleted: true`) so they are safely deleted remotely when connection returns.
   - Conflict resolution: Local edits are never overwritten by older remote data (`updated_at` timestamp check).
   - The app **never** requires a network connection or Supabase to open or retrieve local answers.

---

## Critical Limitation: First-Time Access on a New Device

> [!IMPORTANT]
> **A newly accessed computer or device with no internet, no previously downloaded application files, and no local cache CANNOT load this website from a URL alone.**
>
> Browsers must connect to the internet at least once on any given computer to download the HTML, JavaScript, CSS, and Service Worker. Once loaded for the first time, the Service Worker caches the application shell and assets, and all questions saved into IndexedDB will remain 100% accessible offline from that point forward.

---

## Offline Verification Procedure (Step-by-Step)

To verify that the offline functionality works properly:

1. **Step 1: Initial Online Load**
   - Start the local preview or open your deployed Vercel site in Chrome or Edge:
     ```bash
     npm run preview
     ```
   - Open Developer Tools (`F12` or `Ctrl+Shift+I`) and navigate to the **Application** tab.
   - Under **Service Workers**, confirm `sw.js` is registered, active, and running.
   - Under **Storage → IndexedDB**, verify `exam_answers_offline_db` exists.

2. **Step 2: Add Answers**
   - Click **Add Answer** and save a question URL with a multiline answer and code snippet.
   - Verify it appears in your library and in the search lookup.

3. **Step 3: Go Offline**
   - In Developer Tools, open the **Network** tab.
   - In the "Throttling" dropdown (which says "No throttling"), select **Offline** (or physically disconnect Wi-Fi / Ethernet).
   - Notice the status badge in the app header instantly updates to **Offline** (amber).

4. **Step 4: Test Core Features While Disconnected**
   - Paste the question URL into the search box and press Enter: The answer and code block appear immediately without network errors.
   - Click **Copy Answer**: Verified that the text copies with line breaks preserved.
   - Click **Add Answer**: Add a new question while offline and click **Save**.
   - Edit an existing answer and delete an answer (confirm prompt).
   - Filter the saved answers library using the search box.

5. **Step 5: Test Hard Refresh While Offline**
   - While still completely offline, press **Ctrl+F5** or click the browser Refresh button.
   - Result: The website loads instantly from the Service Worker cache, and all answers in IndexedDB remain available.

6. **Step 6: Test Closing and Reopening the Browser**
   - Close the browser tab or entire window.
   - Reopen the browser while still offline and navigate back to `http://localhost:4173/` (or your site URL).
   - Result: The page loads offline and your saved questions remain completely intact.

7. **Step 7: Reconnect Internet & Sync**
   - Turn off the "Offline" toggle in the Network tab (or re-enable Wi-Fi).
   - Result: The header badge automatically updates to **Online** (green) and background synchronization pushes any pending offline edits to Supabase (if configured).

---

## How to Install the PWA on a Computer

1. Open the website in **Google Chrome**, **Microsoft Edge**, or **Brave**.
2. Look at the right side of the address bar for the **Install App** icon (a monitor with a down arrow or a `+` symbol).
3. Click **Install**.
4. The application will now run in its own dedicated, distraction-free desktop window with its own icon on your desktop and taskbar. It launches directly from local storage even when disconnected from the internet.

---

## Local Development Commands

```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite (26 tests verifying offline sync, URL matching, and CSV)
npm test

# 3. Build production bundle and app shell
npm run build

# 4. Preview production build locally (with Service Worker enabled)
npm run preview
```

---

## Deploying to Vercel

1. Push your changes to your Git repository:
   ```bash
   git add .
   git commit -m "Add offline PWA support with IndexedDB and Service Worker"
   git push
   ```
2. In your [Vercel Dashboard](https://vercel.com):
   - Import the repository.
   - Framework: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Optional Environment Variables (if using Supabase online backup):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy! The included `vercel.json` ensures SPA client-side routes and headers are handled automatically.
