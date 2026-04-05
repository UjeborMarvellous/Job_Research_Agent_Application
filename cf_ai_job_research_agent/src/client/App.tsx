import React, { useState, useEffect, useCallback, useRef } from "react";
import useJobAgent from "./hooks/useJobAgent";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import DocumentEditor from "./components/DocumentEditor";
import { theme } from "./types";
import type { ConversationMeta } from "./types";

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
  localStorage.setItem(CONVOS_KEY, JSON.stringify(convos));
}

function loadActiveSession(convos: ConversationMeta[]): string {
  const stored = localStorage.getItem(ACTIVE_KEY);
  if (stored && convos.some((c) => c.id === stored)) return stored;
  if (convos.length > 0) return convos[0].id;
  return crypto.randomUUID();
}

// ─── Inner component: keyed by sessionId so hooks fully reset on switch ──────

interface ChatSessionProps {
  sessionId: string;
  onTitleUpdate: (title: string) => void;
  onResumeStateChange: (fileName: string | undefined) => void;
  onOpenDocument: (doc: { title: string; content: string }) => void;
  sendRef: React.MutableRefObject<((text: string) => void) | null>;
  resumeFileName?: string;
  onResumeExtracted: (text: string, fileName: string) => void;
  onResumeRemove: () => void;
}

function ChatSession({
  sessionId,
  onTitleUpdate,
  onResumeStateChange,
  onOpenDocument,
  sendRef,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
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

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage],
  );

  useEffect(() => {
    sendRef.current = (text: string) => sendMessage({ text });
    return () => { sendRef.current = null; };
  }, [sendMessage, sendRef]);

  return (
    <ChatWindow
      messages={messages}
      isStreaming={isStreaming}
      onSend={handleSend}
      onOpenDocument={onOpenDocument}
      resumeFileName={resumeFileName}
      onResumeExtracted={onResumeExtracted}
      onResumeRemove={onResumeRemove}
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
  const [resumeFileName, setResumeFileName] = useState<string | undefined>();
  const [editorDocument, setEditorDocument] = useState<{ title: string; content: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const sendRef = useRef<((text: string) => void) | null>(null);

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
    setEditorOpen(false);
    setEditorDocument(null);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveSessionId(id);
    setEditorOpen(false);
    setEditorDocument(null);
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
          setEditorOpen(false);
          setEditorDocument(null);
          return [fresh];
        }
        if (id === activeSessionId) {
          setActiveSessionId(remaining[0].id);
          setEditorOpen(false);
          setEditorDocument(null);
        }
        return remaining;
      });
    },
    [activeSessionId],
  );

  const handleResumeExtracted = useCallback((text: string, fileName: string) => {
    const MAX_RESUME_CHARS = 8000;
    const capped = text.length > MAX_RESUME_CHARS ? text.slice(0, MAX_RESUME_CHARS) : text;
    setResumeFileName(fileName);
    sendRef.current?.(`[resume-upload:${fileName}] ${capped}`);
  }, []);

  const handleResumeRemove = useCallback(() => {
    setResumeFileName(undefined);
  }, []);

  const handleResumeStateChange = useCallback((fileName: string | undefined) => {
    setResumeFileName(fileName);
  }, []);

  const handleOpenDocument = useCallback((doc: { title: string; content: string }) => {
    setEditorDocument(doc);
    setEditorOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: theme.colors.background,
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
      <ChatSession
        key={activeSessionId}
        sessionId={activeSessionId}
        onTitleUpdate={handleTitleUpdate}
        onResumeStateChange={handleResumeStateChange}
        onOpenDocument={handleOpenDocument}
        sendRef={sendRef}
        resumeFileName={resumeFileName}
        onResumeExtracted={handleResumeExtracted}
        onResumeRemove={handleResumeRemove}
      />
      {editorOpen && editorDocument && (
        <DocumentEditor
          document={editorDocument}
          onClose={handleCloseEditor}
          onUpdateContent={(content) =>
            setEditorDocument((prev) => (prev ? { ...prev, content } : null))
          }
        />
      )}
    </div>
  );
}
