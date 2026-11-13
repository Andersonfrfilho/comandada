# UX-CNV-01 — Gap Analysis: ConversationsPage

Comparing **sakura-bot-oficial** (current) against the reference project
**financiamento-imobiliario-bot** (target parity), per spec §6.

---

## 1. Current State — sakura-bot-oficial

### Frontend (`apps/web/src/pages/conversations/`)

| File | Lines | Purpose |
|------|-------|---------|
| `ConversationsPage.tsx` | 650 | Main layout: conversation list + message panel + context sidebar |
| `components/ConversationListItem.tsx` | 82 | List item with avatar (last-2-digits circle), badges (human/waiting/unread), relative timestamp |
| `components/MessageBubble.tsx` | 101 | Message display: text, template, media-link (emoji icon), sender label, status glyph, selectable checkbox |
| `components/MessageComposer.tsx` | 144 | Textarea + send button, hardcoded 12-emoji grid, *bold*/_italic_/~strikethrough~ markers, file attach via hidden input, quick messages chips |

Total frontend: **977 lines**. Reference project: ~1,550 `ConversationsPage` + 15.8K `MessageBubble` + dedicated components.

### Backend (`apps/api/src/modules/conversations/`)

| Layer | Files | Capabilities |
|-------|-------|-------------|
| **Controller** | `ConversationController.ts` (229 lines) + `ConversationRoutes.ts` (26 lines) | 14 REST endpoints: list, history, context, send text/media/template, takeover, release, mark-read/mark-all-read, export, fetch-media, log-message (internal), request-human (internal) |
| **Use cases** (14 total) | `ListConversations`, `GetConversationHistory`, `GetConversationContext`, `LogMessage`, `MarkConversationRead`, `MarkAllConversationsRead`, `SendAgentMessage`, `SendAgentMedia`, `SendAgentTemplate`, `TakeoverConversation`, `ReleaseConversation`, `RequestHuman`, `ExportConversation`, `FetchConversationMedia` | Full CRUD for conversations, agent handoff, media send/fetch |
| **Repository** | `DrizzleConversationRepository.ts` (303 lines) | PostgreSQL via Drizzle ORM, deduplication by `waMessageId`, cursor-based pagination |
| **Sender** | `WhatsAppSender.ts` (64 lines) | Wraps `@adatechnology/whatsapp-provider` (text, media, template, fetch-media-as-base64) |

### Real-time communication

| File | Lines | Mechanism |
|------|-------|-----------|
| `useWebSocket.ts` | 80 | Native `WebSocket` with auth token, auto-reconnect (max 10 attempts, 3s delay), silent token refresh on `auth:failure` |
| Server-side | `WebSocketHub` + `WS_EVENTS` | Broadcasts `conversation:message` and `conversation:session` per establishment |

### Design System

| File | Status |
|------|--------|
| `theme.constant.ts` | Exists — `COLORS`, `TYPOGRAPHY`, `RADIUS`, `SHADOW` tokens |
| `components/ui/Select.tsx` | Exists (T1.1) |
| `components/ui/Modal.tsx` | Exists |
| `components/ui/Skeleton.tsx` | Exists |
| Dark mode | **None** |
| Lucide-react icons | **None** in conversations module (T1.2 added them elsewhere) |
| Toast/notification | **None** |

---

## 2. Missing Features — Feature-by-Feature Table

### 2.1 Components present in reference, absent here

| # | Reference Component | What It Does | Current State in sakura |
|---|-------------------|--------------|------------------------|
| 1 | **`AudioPlayer`** | Inline audio playback with waveform/progress, play/pause in chat bubble | Modal-based native `<audio>` only. No inline player. |
| 2 | **`SimpleEmojiPicker`** | Dedicated emoji picker component (categorized, searchable) | Hardcoded 12-emoji grid in `MessageComposer.tsx:25`. No search, no categories. |
| 3 | **`WhatsAppMessageEditor`** | Rich text editor with WhatsApp formatting, mentions, preview | Plain `<textarea>` with manual `*bold*`/`_italic_`/`~strikethrough~` markers. No preview. |
| 4 | **`DateDivider`** | Groups messages by date with separator ("Hoje", "Ontem", "DD/MM") | Not present. Messages flow continuously without date separators. |
| 5 | **`Avatar`** | Proper avatar component (customer photo, initials fallback) | Simple colored circle with last 2 digits of phone number (`ConversationListItem.tsx:56-58`). |
| 6 | **`Toast`** | Notification toasts for success/error/loading states | Not present anywhere in the app. Errors shown inline (`sendError` state). |

### 2.2 Hooks present in reference, absent here

| # | Reference Hook | What It Does | Current State |
|---|---------------|--------------|--------------|
| 7 | **`useGlobalSse`** | Server-Sent Events for real-time updates (vs WebSocket) | Uses WebSocket (`useWebSocket.ts`). Functional but different architecture. |
| 8 | **`useWaitingNotifications`** | Browser tab notifications + badge count for human-requested conversations | Not present. No browser notifications, no tab title badge. |
| 9 | **`useDarkMode`** | Theme toggle with persistence, applies to entire app | Not present. All styles hardcoded to light theme (`bg-white`, `text-gray-900`). |

### 2.3 Backend capabilities present in reference, absent here

| # | Reference Capability | What It Does | Current State |
|---|---------------------|--------------|--------------|
| 10 | **Uploads module (`uploads`)** | Dedicated module for file upload handling (validate, resize, optimize) | No upload module. Files sent as base64 directly in the `send-media` endpoint. |
| 11 | **Storage S3** | Cloud storage for media (S3 in production, local in dev) | No storage provider. Media fetched from Meta API on demand, returned as base64. No persistence. |
| 12 | **BullMQ worker for media** | Async queue processing for media (resize, transcode, virus scan, upload to S3) | Synchronous send. Base64 data flows: client → API → WhatsApp API. No queue, no worker, no async processing. |

### 2.4 UX features present in reference, absent here

| # | Reference Feature | What It Does | Current State |
|---|------------------|--------------|--------------|
| 13 | **Inline image preview** | Images rendered inline in chat bubble (thumbnail with click-to-expand) | Images shown as `🖼️` emoji + filename button. Opens modal with base64 fetch on click. |
| 14 | **Document viewer** | PDF/document preview inline or in dedicated viewer | Documents shown as `📄` emoji + filename button. Download only. |
| 15 | **Video player** | Inline video with thumbnail, play in chat or expand | Video shown as `🎬` emoji + filename button. Modal playback only after fetch. |
| 16 | **Dark mode** | Full dark theme toggle across entire app | **None.** All components use hardcoded `bg-white`, `bg-gray-50`, `text-gray-900`. |
| 17 | **Browser notifications** | Desktop notification when new human request arrives | **None.** |
| 18 | **Tab badge counter** | Unread/total count in browser tab title | **None.** Only in-page badge (list item). |
| 19 | **Message status live updates** | Read receipts, delivery status updating in real time (not just on reload) | Status glyph (✓/✓✓/⚠️) shown on outbound messages but only updates on page refresh. No real-time status push. |
| 20 | **Conversation search by content** | Search within a conversation's messages | Only phone number search in list. No message content search (`ConversationsPage.tsx:398` — busca por número). |

---

## 3. Priority & Effort Assessment

Scored 1 (lowest urgency) to 5 (critical/must-have).

| # | Feature | Priority (1-5) | Effort | Rationale |
|---|---------|:---:|:---:|-----------|
| 1 | Dark mode (`useDarkMode`) | **5** | Medium | UX-DSN-04 mandates tokens; affects every screen. Foundation for all other T7 tasks. |
| 2 | Inline image preview in `MessageBubble` | **5** | Small | Biggest UX gap — users can't see images they send/receive without extra clicks. |
| 3 | Uploads module + S3 storage (`UX-CNV-03`) | **5** | Large | Critical infrastructure. Required for: media persistence, worker processing, shared package. |
| 4 | BullMQ worker for media processing | **4** | Large | Needed for: async media upload, resize, transcode. Depends on #3. |
| 5 | Audio player in `MessageBubble` | **4** | Medium | Voice notes are primary WhatsApp use case. Modal player is poor UX. |
| 6 | Rich message editor (`WhatsAppMessageEditor`) | **4** | Large | Agent productivity. Current markup (***) is unfriendly for non-technical staff. |
| 7 | Browser notifications + tab badge | **4** | Small | Staff miss human requests without audio/visual alert. High business impact. |
| 8 | `DateDivider` in message list | **3** | Small | Quick win. Makes long conversations scannable. |
| 9 | `Avatar` component improvements | **3** | Small | Customer photo/initials improves identification. |
| 10 | `SimpleEmojiPicker` upgrade | **3** | Medium | Current 12-emoji grid works but is very limited. |
| 11 | Video player inline | **3** | Medium | Less frequent than audio/images but expected. |
| 12 | Document viewer | **2** | Medium | Less frequent use case (invoices, PDFs). |
| 13 | Message content search | **2** | Medium | Useful for support but not critical. |
| 14 | SSE (`useGlobalSse`) migration | **1** | Medium | WebSocket works fine. SSE is a "nice to have" parity item. |
| 15 | Message status live updates | **2** | Small | Status glyph updates on page refresh; real-time would be better. |

### Execution order recommendation

```
Phase 1 (Foundation):
  #1 Dark mode
  #3 Uploads + S3
  #8 DateDivider
  #9 Avatar improvements

Phase 2 (Core UX):
  #2 Inline image preview
  #4 BullMQ media worker
  #5 Audio player
  #7 Browser notifications + tab badge

Phase 3 (Polish):
  #6 Rich message editor
  #10 SimpleEmojiPicker
  #11 Video player inline

Phase 4 (Nice to have):
  #12 Document viewer
  #13 Message content search
  #14 SSE migration
  #15 Live status updates
```

---

## 4. Blockers & Dependencies

| Dependency | Blocks | Notes |
|-----------|--------|-------|
| `UX-CNV-02` (shared package `@adatechnology/conversations-ui`) | Most T7 tasks | Components built in the shared package will be consumed here. But features can be built in sakura first, then extracted. |
| `UX-CNV-03` (uploads + S3) | #2, #4, #5, #11, #12 | Media features need storage infrastructure. |
| T1.3 (theme tokens) / T1.2 (lucide-react) | #1, #9 | Theme constants exist; icons need to be adopted in conversations module. |

---

## 5. Summary

**sakura-bot-oficial** has a functional but minimalist conversations module: **977 lines total** frontend + solid backend with 14 REST endpoints and WebSocket support. The reference project has ~17K+ lines of frontend alone, with dedicated components for audio, rich editing, emoji, avatars, date dividers, and a complete media pipeline (upload → worker → S3).

The biggest gaps are:
1. **Media handling** — no storage, no inline preview, no worker pipeline
2. **Dark mode** — completely absent
3. **Agent UX** — no rich editor, no notifications, no audio player
4. **Visual polish** — no date dividers, no proper avatars, emoji picker is minimal

Priority order: dark mode + storage infrastructure first, then media UX, then agent tools, then polish items.
