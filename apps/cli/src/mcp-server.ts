import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
console.log("Running");
const server = new McpServer({
  name: "mcp-server",
  version: "0",
});

server.registerTool(
  "transcribe",
  {
    title: "STT Tool Transcribe",
    description: "Transcribes speech to text",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({
    content: [{ type: "text", text: String(text) }],
  }),
);
const transport = new StdioServerTransport();
console.log("Connecting");
await server.connect(transport);
