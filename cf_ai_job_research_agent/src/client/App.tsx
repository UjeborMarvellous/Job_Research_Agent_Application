import React from "react";
import useJobAgent from "./hooks/useJobAgent";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { theme } from "./types";
import type { ResearchEntry } from "./types";

export default function App() {
  const { messages, sendMessage, agentState, isStreaming } = useJobAgent();

  const handleSelect = (entry: ResearchEntry) => {
    sendMessage({
      text: `[view-entry:${entry.id}] ${entry.jobTitle} at ${entry.company}`,
    });
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: theme.colors.background,
      }}
    >
      <Sidebar researches={agentState.researches} onSelect={handleSelect} />
      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        onSend={(text) => sendMessage({ text })}
      />
    </div>
  );
}
