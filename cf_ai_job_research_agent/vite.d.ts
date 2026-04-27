// Ambient declarations for Vite config modules.
// These are only needed for VS Code IntelliSense — the build resolves them fine.
// vite.config.ts runs in a Node.js context outside the Workers tsconfig scope.

declare module "vite" {
  export interface Plugin {}
  export interface UserConfig {
    plugins?: Plugin[];
    resolve?: {
      alias?: Record<string, string>;
    };
  }
  export function defineConfig(config: UserConfig): UserConfig;
}

declare module "@cloudflare/vite-plugin" {
  import type { Plugin } from "vite";
  export function cloudflare(options?: object): Plugin;
}

declare module "@vitejs/plugin-react" {
  import type { Plugin } from "vite";
  function react(options?: object): Plugin;
  export default react;
}

declare module "@tailwindcss/vite" {
  import type { Plugin } from "vite";
  function tailwindcss(options?: object): Plugin;
  export default tailwindcss;
}

declare module "agents/vite" {
  import type { Plugin } from "vite";
  function agents(options?: object): Plugin;
  export default agents;
}

declare module "agents/react" {
  export function useAgent<State = unknown>(options: {
    agent: string;
    name?: string;
    host?: string;
    onStateUpdate?: (state: State, source: "server" | "client") => void;
    onStateUpdateError?: (error: unknown) => void;
  }): {
    state: State | undefined;
    setState: (state: State) => void;
    [key: string]: unknown;
  };
}

declare module "@cloudflare/ai-chat/react" {
  export function useAgentChat(options: {
    agent: unknown;
    [key: string]: unknown;
  }): {
    messages: unknown[];
    sendMessage: (message: { text: string } | string) => void;
    clearHistory: () => void;
    status: string;
    [key: string]: unknown;
  };
}
