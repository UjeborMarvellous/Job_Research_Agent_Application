/**
 * Orchestrated “show process” timeline: synthetic providerExecuted tool parts
 * named `agentStep` with input `{ label }` and output `{ ok: boolean }`.
 * The client renders them via AgentStepRow (spinner while active, check/X when done).
 */

import type { UIMessageStreamWriter } from "ai";

export const AGENT_STEP_TOOL_NAME = "agentStep" as const;

export async function runAgentStep(
  writer: UIMessageStreamWriter,
  label: string,
  work: () => Promise<void>,
): Promise<void> {
  const toolCallId = crypto.randomUUID();
  writer.write({
    type: "tool-input-start",
    toolCallId,
    toolName: AGENT_STEP_TOOL_NAME,
    providerExecuted: true,
  });
  writer.write({
    type: "tool-input-available",
    toolCallId,
    toolName: AGENT_STEP_TOOL_NAME,
    input: { label },
    providerExecuted: true,
  });
  try {
    await work();
    writer.write({
      type: "tool-output-available",
      toolCallId,
      output: { ok: true },
      providerExecuted: true,
    });
  } catch (e) {
    writer.write({
      type: "tool-output-available",
      toolCallId,
      output: { ok: false },
      providerExecuted: true,
    });
    throw e;
  }
}

export function beginAgentStep(writer: UIMessageStreamWriter, label: string): string {
  const toolCallId = crypto.randomUUID();
  writer.write({
    type: "tool-input-start",
    toolCallId,
    toolName: AGENT_STEP_TOOL_NAME,
    providerExecuted: true,
  });
  writer.write({
    type: "tool-input-available",
    toolCallId,
    toolName: AGENT_STEP_TOOL_NAME,
    input: { label },
    providerExecuted: true,
  });
  return toolCallId;
}

export function endAgentStep(
  writer: UIMessageStreamWriter,
  toolCallId: string,
  ok: boolean,
): void {
  writer.write({
    type: "tool-output-available",
    toolCallId,
    output: { ok },
    providerExecuted: true,
  });
}
