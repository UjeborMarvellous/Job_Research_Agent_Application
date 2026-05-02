import { routeAgentRequest } from "agents";
import { JobResearchAgent } from "./agent/JobResearchAgent";

export { JobResearchAgent };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/location") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      const cf = (request as Request & { cf?: CfProperties }).cf ?? {};
      return new Response(
        JSON.stringify({
          country: cf.country ?? null,
          city: cf.city ?? null,
          region: cf.region ?? null,
          timezone: cf.timezone ?? null,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
