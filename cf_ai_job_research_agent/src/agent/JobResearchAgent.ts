import { AIChatAgent } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import {
  streamText,
  generateObject,
  convertToModelMessages,
  tool,
  stepCountIs,
  type ToolSet,
} from "ai";
import { z } from "zod";
import type { AgentState, JobAnalysis, ResearchEntry } from "../client/types";

export class JobResearchAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = { researches: [] };

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env, AgentState>["onChatMessage"]>[0]
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const tools = {
      analyzeJobPosting: tool({
        description: "Analyze a job posting and return structured research.",
        inputSchema: z.object({
          jobTitle: z.string(),
          company: z.string(),
          jobDescription: z.string(),
        }),
        execute: async (input) => {
          try {
            const { object } = await generateObject({
              model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
              schema: z.object({
                companyOverview: z.string(),
                roleExpectations: z.string(),
                cultureSignals: z.string(),
                potentialRedFlags: z.string(),
                questionsToAsk: z.array(z.string()).min(5),
                positioningTips: z.string(),
              }),
              system: `You are an expert career advisor. Analyze the job posting provided and return detailed, specific insights grounded entirely in the content given. No generic advice. Every field must contain multiple sentences. questionsToAsk must be specific to this exact role and company — minimum 5 questions.`,
              prompt: `Job Title: ${input.jobTitle}\nCompany: ${input.company}\nJob Description: ${input.jobDescription}`,
            });
            return object as JobAnalysis;
          } catch (err) {
            console.error("analyzeJobPosting failed:", err);
            return {
              companyOverview: "Analysis unavailable — please try again.",
              roleExpectations: "Analysis unavailable — please try again.",
              cultureSignals: "Analysis unavailable — please try again.",
              potentialRedFlags: "Analysis unavailable — please try again.",
              questionsToAsk: ["Could not generate questions — please retry."],
              positioningTips: "Analysis unavailable — please try again.",
            } satisfies JobAnalysis;
          }
        },
      }),

      saveResearch: tool({
        description: "Save a job research entry to persistent memory.",
        inputSchema: z.object({
          company: z.string(),
          jobTitle: z.string(),
          summary: z.string(),
        }),
        execute: async (input) => {
          try {
            const current = (this.state?.researches ?? []) as ResearchEntry[];
            const entry: ResearchEntry = {
              id: crypto.randomUUID(),
              company: input.company,
              jobTitle: input.jobTitle,
              summary: input.summary,
              timestamp: new Date().toISOString(),
            };
            await this.setState({ researches: [...current, entry] });
            return { success: true, id: entry.id };
          } catch (err) {
            console.error("saveResearch failed:", err);
            return { success: false, error: "Could not save research." };
          }
        },
      }),

      getResearchHistory: tool({
        description: "Retrieve all saved job research from memory.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const researches = (this.state?.researches ?? []) as ResearchEntry[];
            return { researches, count: researches.length };
          } catch (err) {
            console.error("getResearchHistory failed:", err);
            return { researches: [], count: 0 };
          }
        },
      }),
    };

    const modelMessages = await convertToModelMessages(this.messages);

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: `You are a professional job application research assistant. When the user shares a job description or company name, immediately call analyzeJobPosting — do not write any text before the tool call. After analyzeJobPosting completes, call saveResearch with a single concise sentence summarizing the role. When the user asks to see history, call getResearchHistory. After all tool calls complete, write a brief 2-3 sentence commentary on the single most important finding. Be specific. Never give generic advice.`,
      messages: modelMessages,
      tools: tools as ToolSet,
      stopWhen: stepCountIs(5),
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }
}
