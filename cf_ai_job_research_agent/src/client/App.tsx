import React, { useState, useEffect, useCallback, useRef } from "react";
import { Flex, Box } from "@chakra-ui/react";
import useJobAgent from "./hooks/useJobAgent";
import { getToolName, isToolUIPart } from "ai";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import DocumentEditor from "./components/DocumentEditor";
import { theme } from "./types";
import type { ConversationMeta, UIMessagePart } from "./types";

const CONVOS_KEY = "jra_conversations";
const ACTIVE_KEY = "jra_active_session";

function loadConversations(): ConversationMeta[] {
  try {
    const raw = localStorage.getItem(CONVOS_KEY);
    return raw ? JSON.parse(raw) : [];
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
  sessionId: string;
  onTitleUpdate: (title: string) => void;
  onResumeStateChange: (fileName: string | undefined) => void;
  onOpenDocument: (doc: { title: string; content: string }) => void;
  pendingResume: { text: string; fileName: string } | null;
  onClearPendingResume: () => void;
  resumeFileName?: string;
  onResumeExtracted: (text: string, fileName: string) => void;
  onResumeRemove: () => void;
  editorOpen: boolean;
  activeDocumentTitle: string | null;
  activeDocumentContent: string | null;
  onUpdateActiveDocument: (content: string) => void;
}

function ChatSession({
  sessionId,
  onTitleUpdate,
  onResumeStateChange,
  onOpenDocument,
  pendingResume,
  onClearPendingResume,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
  editorOpen,
  activeDocumentTitle,
  activeDocumentContent,
  onUpdateActiveDocument,
}: ChatSessionProps) {
  const { messages, sendMessage, agentState, isStreaming } =
    useJobAgent(sessionId);

  useEffect(() => {
    const t = agentState.sidebarTitle?.trim();
    if (t) onTitleUpdate(t);
  }, [agentState.sidebarTitle, onTitleUpdate]);

  useEffect(() => {
    onResumeStateChange(agentState.resumeFileName);
  }, [agentState.resumeFileName, onResumeStateChange]);

  // Fix 2 — attach pending resume to the next user send
  // Step 8 — attach live editor content tag when editor is open (for update-document intent)
  const handleSend = useCallback(
    (text: string) => {
      let messageText = text;

      // Prepend editor-content tag so backend can use live TipTap HTML for updates
      if (editorOpen && activeDocumentContent) {
        const encoded = btoa(unescape(encodeURIComponent(activeDocumentContent)));
        messageText = `[editor-content:${encoded}] ${messageText}`;
      }

      if (pendingResume) {
        sendMessage({ text: `[resume-upload:${pendingResume.fileName}] ${messageText}` });
        onClearPendingResume();
      } else {
        sendMessage({ text: messageText });
      }
    },
    [sendMessage, pendingResume, onClearPendingResume, editorOpen, activeDocumentContent],
  );

  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const text = (lastUserMsg?.parts ?? []).find((p: { type?: string; text?: string }) => p.type === "text")?.text ?? "";
    if (text) sendMessage({ text });
  }, [messages, sendMessage]);

  // Fix 3 — auto-open or auto-refresh editor when agent emits a generateDocument output
  const lastGenDocContentRef = useRef<string | null>(null);
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const parts = [...(lastAssistant.parts ?? [])].reverse();
    for (const p of parts) {
      const aiP = p as Parameters<typeof isToolUIPart>[0];
      if (!isToolUIPart(aiP) || getToolName(aiP) !== "generateDocument") continue;
      const typed = p as UIMessagePart;
      if (typed.state !== "output-available") continue;
      const input = typed.input as { title?: string } | undefined;
      const output = typed.output as { content?: string } | undefined;
      const title = input?.title ?? "Document";
      const content = output?.content ?? "";
      if (lastGenDocContentRef.current === content) break;
      lastGenDocContentRef.current = content;
      if (editorOpen && activeDocumentTitle === title) {
        onUpdateActiveDocument(content);
      } else {
        onOpenDocument({ title, content });
      }
      break;
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ChatWindow
      messages={messages}
      isStreaming={isStreaming}
      onSend={handleSend}
      onRetry={handleRetry}
      onOpenDocument={onOpenDocument}
      resumeFileName={resumeFileName}
      onResumeExtracted={onResumeExtracted}
      onResumeRemove={onResumeRemove}
      pendingResumeFileName={pendingResume?.fileName}
    />
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploadedResumeFileName, setUploadedResumeFileName] = useState<string | undefined>();

  // Fix 2 — pending resume staged here, sent on next user submit
  const [pendingResume, setPendingResume] = useState<{ text: string; fileName: string } | null>(null);

  // Fix 4 — document stack replaces single editorDocument
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const editorOpen = openDocuments.length > 0;
  const activeDocument = openDocuments.find((d) => d.id === activeDocumentId) ?? null;
  const activeDocumentTitle = activeDocument?.title ?? null;

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const handleTitleUpdate = useCallback(
    (title: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeSessionId
            ? { ...c, title, updatedAt: new Date().toISOString() }
            : c,
        ),
      );
    },
    [activeSessionId],
  );

  const handleNewConversation = useCallback(() => {
    const id = crypto.randomUUID();
    const entry: ConversationMeta = {
      id,
      title: "New conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => [entry, ...prev]);
    setActiveSessionId(id);
    setOpenDocuments([]);
    setActiveDocumentId(null);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveSessionId(id);
    setOpenDocuments([]);
    setActiveDocumentId(null);
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          const newId = crypto.randomUUID();
          const fresh: ConversationMeta = {
            id: newId,
            title: "New conversation",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setActiveSessionId(newId);
          setOpenDocuments([]);
          setActiveDocumentId(null);
          return [fresh];
        }
        if (id === activeSessionId) {
          setActiveSessionId(remaining[0].id);
          setOpenDocuments([]);
          setActiveDocumentId(null);
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

  // Fix 4 — open / upsert document by title
  const handleOpenDocument = useCallback((doc: { title: string; content: string }) => {
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
  }, []);

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

  return (
    <Flex
      height="100vh"
      overflow="hidden"
      style={{
        background: "var(--color-viewport)",
        padding: "14px",
        gap: "12px",
        alignItems: "stretch",
      }}
    >
      <Sidebar
        conversations={conversations}
        activeConversationId={activeSessionId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
      />
      <Box
        flex="1"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        style={{
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.13), 0 4px 12px rgba(0,0,0,0.08)",
          background: theme.colors.background,
        }}
      >
        <ChatSession
          key={activeSessionId}
          sessionId={activeSessionId}
          onTitleUpdate={handleTitleUpdate}
          onResumeStateChange={handleResumeStateChange}
          onOpenDocument={handleOpenDocument}
          pendingResume={pendingResume}
          onClearPendingResume={handleClearPendingResume}
          resumeFileName={uploadedResumeFileName}
          onResumeExtracted={handleResumeExtracted}
          onResumeRemove={handleResumeRemove}
          editorOpen={editorOpen}
          activeDocumentTitle={activeDocumentTitle}
          activeDocumentContent={activeDocument?.content ?? null}
          onUpdateActiveDocument={handleUpdateActiveDocument}
        />
      </Box>
      {editorOpen && activeDocument && (
        <DocumentEditor
          openDocuments={openDocuments}
          activeDocumentId={activeDocumentId!}
          onCloseDocument={handleCloseDocument}
          onSetActiveDocument={handleSetActiveDocument}
          onUpdateContent={handleUpdateDocumentContent}
        />
      )}
    </Flex>
  );
}
