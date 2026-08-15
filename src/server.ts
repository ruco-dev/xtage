/**
 * xtage MCP server entry point.
 * Invoked as an MCP server when no CLI subcommand is given.
 */
import { createServer } from "mcpster"
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'
import { VERSION } from './version.js'

export async function startServer(): Promise<void> {
  const server = createServer({
    name: 'xtage',
    version: VERSION,
    transport: 'stdio',
  })

  registerTools(server)
  registerResources(server)
  registerPrompts(server)

  await server.start()
}
