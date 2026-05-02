import { useRef, useEffect, type Dispatch, type SetStateAction } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { AgentState, UIMessage, UserLocation } from "../types";

export default function useJobAgent(sessionId: string) {
  const agent = useAgent<AgentState>({
    agent: "JobResearchAgent",
    name: sessionId,
  });

  const { messages, sendMessage, setMessages, status } = useAgentChat({
    agent,
  });

  const locationRef = useRef<UserLocation | null>(null);

  useEffect(() => {
    fetch("/api/location")
      .then((r) => r.json() as Promise<UserLocation>)
      .then((data) => { locationRef.current = data; })
      .catch(() => {});
  }, []);

  function send(message: { text: string }) {
    let text = message.text;
    // Attach location on every message — used in-memory by the agent for search,
    // never stored, GDPR-safe.
    if (locationRef.current?.country) {
      const tag = `[user-location:${btoa(JSON.stringify(locationRef.current))}]`;
      text = `${tag} ${text}`;
    }
    sendMessage({ text });
  }

  const agentState: AgentState = agent.state ?? { researches: [] };

  return {
    messages: messages as UIMessage[],
    sendMessage: send,
    setMessages: setMessages as Dispatch<SetStateAction<UIMessage[]>>,
    agentState,
    isStreaming: status === "streaming",
  };
}
