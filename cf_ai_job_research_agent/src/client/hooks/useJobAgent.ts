import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { AgentState, UIMessage } from "../types";

export default function useJobAgent(sessionId: string) {
  const agent = useAgent<AgentState>({
    agent: "JobResearchAgent",
    name: sessionId,
  });

  const { messages, sendMessage, status } = useAgentChat({
    agent,
  });

  const agentState: AgentState = agent.state ?? { researches: [] };

  return {
    messages: messages as UIMessage[],
    sendMessage,
    agentState,
    isStreaming: status === "streaming",
  };
}
