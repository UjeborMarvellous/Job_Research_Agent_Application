import React, { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { Flex, Box } from "@chakra-ui/react";
import useJobAgent from "./hooks/useJobAgent";
import { useIsMobile } from "./hooks/useMediaQuery";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import DocumentEditor from "./components/DocumentEditor";
import { theme } from "./types";
import type { AgentState, ConversationMeta, DocumentSnapshot, UIMessage } from "./types";
import { getUserMessagePlainTextForComposer } from "./utils/userMessageComposerText";

function MobileSidebarDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <button className="mobile-drawer-backdrop" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} aria-label="Close sidebar" />
      <div className="mobile-drawer-panel">{children}</div>
    </>
  );
}

function MobileDocOverlay({ children }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="mobile-doc-overlay">
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

const CONVOS_KEY = "jra_conversations";
const ACTIVE_KEY = "jra_active_session";

function loadConversations(): ConversationMeta[] {
  try {
    const raw = localStorage.getItem(CONVOS_KEY);
    if (!raw) return [];
    const parsed: ConversationMeta[] = JSON.parse(raw);

    // Remove duplicate IDs — keeps first occurrence
    const seenIds = new Set<string>();
    const deduped = parsed.filter((c) => {
      if (seenIds.has(c.id)) return false;
      seenIds.add(c.id);
      return true;
    });

    // Remove extra untouched "New conversation" entries — keep at most one
    let keptFresh = false;
    return deduped.filter((c) => {
      const isFresh = c.title === "New conversation" && c.updatedAt === c.createdAt;
      if (isFresh) {
        if (keptFresh) return false;
        keptFresh = true;
      }
      return true;
    });
  } catch {
    return [];
  }
}

function saveConversations(convos: ConversationMeta[]) {
  localStorage.setItem(CONVOS_KEY, JSON.stringify(convos.slice(0, 50)));
}

function loadActiveSession(convos: ConversationMeta[]): string {
  const stored = localStorage.getItem(ACTIVE_KEY);
  if (stored && convos.some((c) => c.id === stored)) return stored;
  if (convos.length > 0) return convos[0].id;
  return crypto.randomUUID();
}

// ─── Inner component: keyed by sessionId so hooks fully reset on switch ──────

interface OpenDocument {
  id: string;
  title: string;
  content: string;
}

interface ChatSessionProps {
  onTitleUpdate: (title: string) => void;
  onResumeStateChange: (fileName: string | undefined) => void;
  onOpenDocument: (doc: { title: string; content: string }, opts?: { fromAgent?: boolean }) => void;
  pendingResume: { text: string; fileName: string } | null;
  onClearPendingResume: () => void;
  resumeFileName?: string;
  onResumeExtracted: (text: string, fileName: string) => void;
  onResumeRemove: () => void;
  /** True when the composer should attach editor-session / editor-content (desktop: any open doc; mobile: sheet visible). */
  editorOpen: boolean;
  /** True when the document stack has at least one doc (used for agent doc refresh vs new insert). */
  hasOpenDocuments: boolean;
  activeDocumentId: string | null;
  activeDocumentTitle: string | null;
  activeDocumentContent: string | null;
  onUpdateActiveDocument: (content: string) => void;
  onUserSend: () => void;
  isMobile?: boolean;
  onOpenSidebar?: () => void;
  messages: UIMessage[];
  sendMessage: (message: { text: string }) => void;
  setMessages: Dispatch<SetStateAction<UIMessage[]>>;
  agentState: AgentState;
  isStreaming: boolean;
  onLoadDocumentVersion: (versionedDocumentId: string) => void;
  documentVersionMap: Record<string, DocumentSnapshot>;
  documentVersionByToolCallId: Record<string, string>;
}

function ChatSession({
  onTitleUpdate,
  onResumeStateChange,
  onOpenDocument,
  pendingResume,
  onClearPendingResume,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
  editorOpen,
  hasOpenDocuments,
  activeDocumentId,
  activeDocumentTitle,
  activeDocumentContent,
  onUpdateActiveDocument,
  onUserSend,
  isMobile,
  onOpenSidebar,
  messages,
  sendMessage,
  setMessages,
  agentState,
  isStreaming,
  onLoadDocumentVersion,
  documentVersionMap,
  documentVersionByToolCallId,
}: ChatSessionProps) {

  const [suppressServerResumeChip, setSuppressServerResumeChip] = useState(false);
  const [composerSeed, setComposerSeed] = useState<{ text: string; nonce: number } | null>(null);
  const [editResendFromIndex, setEditResendFromIndex] = useState<number | null>(null);

  // True only after the user sends their first message in this session.
  // Resets to false on every session switch (ChatSession is keyed by activeSessionId).
  // This is the reliable guard against the old session's sidebarTitle bleeding into a
  // new session during the async DO state handoff.
  const hasUserSentRef = useRef(false);

  useEffect(() => {
    const t = agentState.sidebarTitle?.trim();
    if (!t) return;
    if (!hasUserSentRef.current) return;
    onTitleUpdate(t);
  }, [agentState.sidebarTitle, onTitleUpdate]);

  useEffect(() => {
    onResumeStateChange(agentState.resumeFileName);
  }, [agentState.resumeFileName, onResumeStateChange]);

  useEffect(() => {
    if (!isStreaming) setSuppressServerResumeChip(false);
  }, [isStreaming]);

  // Fix 2 — attach pending resume to the next user send
  // Step 8 — attach live editor content tag when editor is open (for update-document intent)
  const handleSend = useCallback(
    (text: string) => {
      if (editResendFromIndex !== null) {
        const idx = editResendFromIndex;
        setEditResendFromIndex(null);
        setMessages((msgs) => msgs.slice(0, idx));
      }

      if (pendingResume || resumeFileName) {
        setSuppressServerResumeChip(true);
      }

      let messageText = text;

      // Session hint so the agent knows the editor is open (even before content syncs).
      if (editorOpen && activeDocumentId) {
        const sessionPayload = JSON.stringify({
          open: true,
          documentId: activeDocumentId,
          title: activeDocumentTitle ?? "",
        });
        const encSession = btoa(unescape(encodeURIComponent(sessionPayload)));
        messageText = `[editor-session:${encSession}] ${messageText}`;
      }

      // Prepend editor-content tag so backend can use live TipTap HTML for updates
      if (editorOpen && activeDocumentContent) {
        const encoded = btoa(unescape(encodeURIComponent(activeDocumentContent)));
        messageText = `[editor-content:${encoded}] ${messageText}`;
      }

      if (pendingResume) {
        const resumePayload = messageText.trim()
          ? `${pendingResume.text}\n---USER_INTENT---\n${messageText}`
          : pendingResume.text;
        sendMessage({ text: `[resume-upload:${pendingResume.fileName}] ${resumePayload}` });
        onClearPendingResume();
      } else {
        sendMessage({ text: messageText });
      }

      hasUserSentRef.current = true;
      onUserSend();
    },
    [
      sendMessage,
      setMessages,
      pendingResume,
      onClearPendingResume,
      editorOpen,
      activeDocumentId,
      activeDocumentTitle,
      activeDocumentContent,
      onUserSend,
      editResendFromIndex,
      resumeFileName,
    ],
  );

  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const text = (lastUserMsg?.parts ?? []).find((p: { type?: string; text?: string }) => p.type === "text")?.text ?? "";
    if (text) sendMessage({ text });
  }, [messages, sendMessage]);

  // Auto-open or auto-refresh editor when the DO state records a new document.
  // Previously this also depended on `messages`, which caused the effect to fire
  // on every streaming chunk. If the DO state was momentarily stale the guard
  // would compare full content vs truncated message-part content, fail, and
  // re-open the editor mid-stream — the visible "glitch". Now we trigger only
  // when lastGeneratedDocument itself changes; the DO writes it exactly once per
  // generation, so the effect runs at most once per document.
  const lastGenDocContentRef = useRef<string | null>(null);
  useEffect(() => {
    const stateDoc = agentState.lastGeneratedDocument;
    if (!stateDoc?.content) return;
    if (lastGenDocContentRef.current === stateDoc.content) return;
    lastGenDocContentRef.current = stateDoc.content;

    const title = stateDoc.title ?? "Document";
    if (hasOpenDocuments && activeDocumentTitle === title) {
      onUpdateActiveDocument(stateDoc.content);
    } else {
      onOpenDocument({ title, content: stateDoc.content }, { fromAgent: true });
    }
  }, [
    agentState.lastGeneratedDocument,
    hasOpenDocuments,
    activeDocumentTitle,
    onUpdateActiveDocument,
    onOpenDocument,
  ]);

  const handleBeginEditUserMessage = useCallback(
    (index: number) => {
      const msg = messages[index];
      if (!msg) return;
      const text = getUserMessagePlainTextForComposer(msg);
      if (text === null) return;
      setComposerSeed({ text, nonce: Date.now() });
      setEditResendFromIndex(index);
    },
    [messages],
  );

  return (
    <ChatWindow
      messages={messages}
      isStreaming={isStreaming}
      onSend={handleSend}
      onRetry={handleRetry}
      onOpenDocument={onOpenDocument}
      stateDocContent={agentState.lastGeneratedDocument?.content ?? null}
      documentVersionMap={documentVersionMap}
      documentVersionByToolCallId={documentVersionByToolCallId}
      onLoadDocumentVersion={onLoadDocumentVersion}
      resumeFileName={suppressServerResumeChip ? undefined : resumeFileName}
      onResumeExtracted={onResumeExtracted}
      onResumeRemove={onResumeRemove}
      pendingResumeFileName={pendingResume?.fileName}
      composerSeed={composerSeed}
      onComposerSeedConsumed={() => setComposerSeed(null)}
      onBeginEditUserMessage={handleBeginEditUserMessage}
      isMobile={isMobile}
      onOpenSidebar={onOpenSidebar}
    />
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────

const NEW_CONVERSATION_DEBOUNCE_MS = 400;

export default function App() {
  const isMobile = useIsMobile();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const lastNewConversationAtRef = useRef(0);

  const [conversations, setConversations] = useState<ConversationMeta[]>(() => {
    const convos = loadConversations();
    if (convos.length > 0) return convos;
    const id = crypto.randomUUID();
    const initial: ConversationMeta = {
      id,
      title: "New conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveConversations([initial]);
    localStorage.setItem(ACTIVE_KEY, id);
    return [initial];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    loadActiveSession(conversations),
  );

  const { messages, sendMessage, setMessages, agentState, isStreaming } =
    useJobAgent(activeSessionId);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploadedResumeFileName, setUploadedResumeFileName] = useState<string | undefined>();

  // Fix 2 — pending resume staged here, sent on next user submit
  const [pendingResume, setPendingResume] = useState<{ text: string; fileName: string } | null>(null);

  // Fix 4 — document stack replaces single editorDocument
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [mobileEditorSheetOpen, setMobileEditorSheetOpen] = useState(false);
  const hasOpenDocuments = openDocuments.length > 0;
  const editorOpenForComposer = !isMobile ? hasOpenDocuments : mobileEditorSheetOpen;
  const activeDocument = openDocuments.find((d) => d.id === activeDocumentId) ?? null;
  const activeDocumentTitle = activeDocument?.title ?? null;

  useEffect(() => {
    if (openDocuments.length === 0) setMobileEditorSheetOpen(false);
  }, [openDocuments.length]);

  useEffect(() => {
    if (!isMobile) setMobileEditorSheetOpen(false);
  }, [isMobile]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const handleTitleUpdate = useCallback(
    (title: string) => {
      const next = title.trim();
      if (!next) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeSessionId
            ? { ...c, title: next }
            : c,
        ),
      );
    },
    [activeSessionId],
  );

  const handleNewConversation = useCallback(() => {
    const now = Date.now();
    if (now - lastNewConversationAtRef.current < NEW_CONVERSATION_DEBOUNCE_MS) return;
    lastNewConversationAtRef.current = now;

    setConversations((prev) => {
      // If the current active conversation is already a fresh untouched "New conversation",
      // don't create a duplicate — just close the drawer and reuse it.
      const current = prev.find((c) => c.id === activeSessionId);
      if (current?.title === "New conversation" && current.updatedAt === current.createdAt) {
        setMobileDrawerOpen(false);
        return prev;
      }

      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      const entry: ConversationMeta = {
        id,
        title: "New conversation",
        createdAt: ts,
        updatedAt: ts,
      };
      setActiveSessionId(id);
      setOpenDocuments([]);
      setActiveDocumentId(null);
      setMobileEditorSheetOpen(false);
      setMobileDrawerOpen(false);
      return [entry, ...prev];
    });
  }, [activeSessionId]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveSessionId(id);
    setOpenDocuments([]);
    setActiveDocumentId(null);
    setMobileEditorSheetOpen(false);
    setMobileDrawerOpen(false);
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          const newId = crypto.randomUUID();
          const ts = new Date().toISOString();
          const fresh: ConversationMeta = {
            id: newId,
            title: "New conversation",
            createdAt: ts,
            updatedAt: ts,
          };
          setActiveSessionId(newId);
          setOpenDocuments([]);
          setActiveDocumentId(null);
          setMobileEditorSheetOpen(false);
          return [fresh];
        }
        if (id === activeSessionId) {
          setActiveSessionId(remaining[0].id);
          setOpenDocuments([]);
          setActiveDocumentId(null);
          setMobileEditorSheetOpen(false);
        }
        return remaining;
      });
    },
    [activeSessionId],
  );

  // Fix 1 — no truncation; Fix 2 — stage only, do not send on parse
  const handleResumeExtracted = useCallback((text: string, fileName: string) => {
    setPendingResume({ text, fileName });
    // uploadedResumeFileName is set only when the DO confirms it has the resume
  }, []);

  const handleResumeRemove = useCallback(() => {
    setPendingResume(null);
    setUploadedResumeFileName(undefined);
  }, []);

  const handleClearPendingResume = useCallback(() => {
    setPendingResume(null);
  }, []);

  const handleResumeStateChange = useCallback((fileName: string | undefined) => {
    setUploadedResumeFileName(fileName);
  }, []);

  const handleUserSend = useCallback(() => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeSessionId
          ? { ...c, updatedAt: new Date().toISOString() }
          : c,
      ),
    );
  }, [activeSessionId]);

  // Fix 4 — open / upsert document by title (`fromAgent`: do not auto-open mobile editor sheet)
  const handleOpenDocument = useCallback(
    (doc: { title: string; content: string }, opts?: { fromAgent?: boolean }) => {
      setOpenDocuments((prev) => {
        const existing = prev.find((d) => d.title === doc.title);
        if (existing) {
          setActiveDocumentId(existing.id);
          return prev.map((d) => d.id === existing.id ? { ...d, content: doc.content } : d);
        }
        const newDoc = { id: crypto.randomUUID(), ...doc };
        setActiveDocumentId(newDoc.id);
        return [...prev, newDoc];
      });
      if (isMobile && !opts?.fromAgent) {
        setMobileEditorSheetOpen(true);
      }
    },
    [isMobile],
  );

  const handleCloseDocument = useCallback(
    (id: string) => {
      setOpenDocuments((prev) => {
        const next = prev.filter((d) => d.id !== id);
        if (next.length === 0) {
          setActiveDocumentId(null);
        } else if (id === activeDocumentId) {
          setActiveDocumentId(next[next.length - 1].id);
        }
        return next;
      });
    },
    [activeDocumentId],
  );

  const handleSetActiveDocument = useCallback((id: string) => {
    setActiveDocumentId(id);
  }, []);

  const documentVersionMap = agentState.documentVersionMap ?? {};
  const documentVersionByToolCallId = agentState.documentVersionByToolCallId ?? {};

  const handleLoadVersionById = useCallback(
    (versionedDocumentId: string) => {
      const snap = documentVersionMap[versionedDocumentId];
      if (!snap?.content) return;
      setOpenDocuments((prev) => {
        const existing = prev.find((d) => d.title === snap.title);
        if (existing) {
          setActiveDocumentId(existing.id);
          return prev.map((d) =>
            d.id === existing.id ? { ...d, content: snap.content, title: snap.title } : d,
          );
        }
        const newDoc = { id: crypto.randomUUID(), title: snap.title, content: snap.content };
        setActiveDocumentId(newDoc.id);
        return [...prev, newDoc];
      });
      if (isMobile) setMobileEditorSheetOpen(true);
    },
    [documentVersionMap, isMobile],
  );

  // Fix 3 — called by ChatSession when agent pushes new content for the active doc
  const handleUpdateActiveDocument = useCallback(
    (content: string) => {
      setOpenDocuments((prev) =>
        prev.map((d) => d.id === activeDocumentId ? { ...d, content } : d),
      );
    },
    [activeDocumentId],
  );

  // Fix 4 — called by DocumentEditor's TipTap onUpdate
  const handleUpdateDocumentContent = useCallback((id: string, content: string) => {
    setOpenDocuments((prev) =>
      prev.map((d) => d.id === id ? { ...d, content } : d),
    );
  }, []);

  const handleCloseAllDocs = useCallback(() => {
    setOpenDocuments([]);
    setActiveDocumentId(null);
    setMobileEditorSheetOpen(false);
  }, []);

  return (
    <Flex
      height="100dvh"
      overflow="hidden"
      style={{
        background: "var(--color-viewport)",
        padding: isMobile ? "0" : "14px",
        gap: isMobile ? "0" : "12px",
        alignItems: "stretch",
      }}
    >
      {/* Sidebar: inline on desktop, drawer overlay on mobile */}
      {!isMobile && (
        <Sidebar
          conversations={conversations}
          activeConversationId={activeSessionId}
          onNewConversation={handleNewConversation}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        />
      )}
      {isMobile && mobileDrawerOpen && (
        <MobileSidebarDrawer onClose={() => setMobileDrawerOpen(false)}>
          <Sidebar
            conversations={conversations}
            activeConversationId={activeSessionId}
            onNewConversation={handleNewConversation}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            collapsed={false}
            onToggleCollapse={() => setMobileDrawerOpen(false)}
            inDrawer
          />
        </MobileSidebarDrawer>
      )}

      <Box
        flex="1"
        minW={0}
        maxW="100%"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        style={{
          borderRadius: isMobile ? "0" : "16px",
          boxShadow: isMobile ? "none" : "0 8px 32px rgba(0,0,0,0.13), 0 4px 12px rgba(0,0,0,0.08)",
          background: theme.colors.background,
        }}
      >
        <ChatSession
          key={activeSessionId}
          onTitleUpdate={handleTitleUpdate}
          onResumeStateChange={handleResumeStateChange}
          onOpenDocument={handleOpenDocument}
          pendingResume={pendingResume}
          onClearPendingResume={handleClearPendingResume}
          resumeFileName={uploadedResumeFileName}
          onResumeExtracted={handleResumeExtracted}
          onResumeRemove={handleResumeRemove}
          editorOpen={editorOpenForComposer}
          hasOpenDocuments={hasOpenDocuments}
          activeDocumentId={activeDocumentId}
          activeDocumentTitle={activeDocumentTitle}
          activeDocumentContent={activeDocument?.content ?? null}
          onUpdateActiveDocument={handleUpdateActiveDocument}
          onUserSend={handleUserSend}
          isMobile={isMobile}
          onOpenSidebar={() => setMobileDrawerOpen(true)}
          messages={messages}
          sendMessage={sendMessage}
          setMessages={setMessages}
          agentState={agentState}
          isStreaming={isStreaming}
          onLoadDocumentVersion={handleLoadVersionById}
          documentVersionMap={documentVersionMap}
          documentVersionByToolCallId={documentVersionByToolCallId}
        />
      </Box>

      {/* DocumentEditor: side panel on desktop; mobile overlay only after user opens sheet */}
      {hasOpenDocuments && activeDocument && (
        isMobile ? (
          mobileEditorSheetOpen && (
          <MobileDocOverlay onClose={handleCloseAllDocs}>
            <DocumentEditor
              openDocuments={openDocuments}
              activeDocumentId={activeDocumentId!}
              onCloseDocument={handleCloseDocument}
              onSetActiveDocument={handleSetActiveDocument}
              onUpdateContent={handleUpdateDocumentContent}
              isMobile={true}
            />
          </MobileDocOverlay>
          )
        ) : (
          <DocumentEditor
            openDocuments={openDocuments}
            activeDocumentId={activeDocumentId!}
            onCloseDocument={handleCloseDocument}
            onSetActiveDocument={handleSetActiveDocument}
            onUpdateContent={handleUpdateDocumentContent}
          />
        )
      )}
    </Flex>
  );
}
