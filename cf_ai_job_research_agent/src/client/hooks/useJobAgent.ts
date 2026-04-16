import type { Dispatch, SetStateAction } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { AgentState, UIMessage } from "../types";

export default function useJobAgent(sessionId: string) {
  const agent = useAgent<AgentState>({
    agent: "JobResearchAgent",
    name: sessionId,
  });

  const { messages, sendMessage, setMessages, status } = useAgentChat({
    agent,
  });

  const agentState: AgentState = agent.state ?? { researches: [] };

  return {
    messages: messages as UIMessage[],
    sendMessage,
    setMessages: setMessages as Dispatch<SetStateAction<UIMessage[]>>,
    agentState,
    isStreaming: status === "streaming",
  };
}
