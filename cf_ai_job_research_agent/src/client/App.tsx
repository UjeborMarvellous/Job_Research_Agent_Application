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

function truncateTitle(text: string, max = 50): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

// ─── Inner component: keyed by sessionId so hooks fully reset on switch ──────

interface ChatSessionProps {
  sessionId: string;
  onTitleUpdate: (title: string) => void;
  onResumeStateChange: (fileName: string | undefined) => void;
  onOpenDocument: (doc: { title: string; content: string }) => void;
  sendRef: React.MutableRefObject<((text: string) => void) | null>;
}

function ChatSession({ sessionId, onTitleUpdate, onResumeStateChange, onOpenDocument, sendRef }: ChatSessionProps) {
  const { messages, sendMessage, agentState, isStreaming } =
    useJobAgent(sessionId);

  const prevResearchCount = useRef(agentState.researches.length);

  useEffect(() => {
    const entries = agentState.researches;
    if (entries.length > prevResearchCount.current && entries.length > 0) {
      const latest = entries[entries.length - 1];
      onTitleUpdate(`${latest.jobTitle} at ${latest.company}`);
    }
    prevResearchCount.current = entries.length;
  }, [agentState.researches, onTitleUpdate]);

  useEffect(() => {
    onResumeStateChange(agentState.resumeFileName);
  }, [agentState.resumeFileName, onResumeStateChange]);

  const handleSend = useCallback(
    (text: string) => {
      if (messages.length === 0) {
        onTitleUpdate(truncateTitle(text));
      }
      sendMessage({ text });
    },
    [messages.length, sendMessage, onTitleUpdate],
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
    setResumeFileName(fileName);
    sendRef.current?.(`[resume-upload:${fileName}] ${text}`);
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
        resumeFileName={resumeFileName}
        onResumeExtracted={handleResumeExtracted}
        onResumeRemove={handleResumeRemove}
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
