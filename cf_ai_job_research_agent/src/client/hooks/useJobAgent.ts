import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { AgentState } from "../types";

const getSessionId = (): string => {
  const key = "jra_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
};

export default function useJobAgent() {
  const sessionId = getSessionId();

  const agent = useAgent<AgentState>({
    agent: "JobResearchAgent",
    name: sessionId,
  });

  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent,
  });

  const agentState: AgentState = agent.state ?? { researches: [] };

  return {
    messages,
    sendMessage,
    clearHistory,
    status,
    agentState,
    isStreaming: status === "streaming",
  };
}
