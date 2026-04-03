import { routeAgentRequest } from "agents";
import { JobResearchAgent } from "./agent/JobResearchAgent";

export { JobResearchAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
