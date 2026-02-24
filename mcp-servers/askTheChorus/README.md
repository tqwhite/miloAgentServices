# askTheChorus MCP Server

Exposes the AI Chorus of Experts as an MCP tool that any MCP-capable AI agent (Claude Code, etc.) can call. Sends a prompt to multiple AI expert perspectives in parallel, each analyzing independently, then optionally synthesizes their responses into a unified analysis.

**Version 1** — blocking HTTP call to the private (unlisted) Conway endpoint. No x402 payment. Requires `MCP_TOOL_TIMEOUT` >= 1200000 (20 minutes) for full chorus studies.

## Prerequisites

- Node.js 18+ (for global `fetch`)
- Conway sandbox running at `milo3.life.conway.tech` with the `/api/private/askTheChorus` endpoint deployed

## Installation

```bash
cd mcp-servers/askTheChorus
npm install
```

## Claude Code Configuration

Add to `~/.claude/settings.json`:

```json
{
  "env": {
    "MCP_TOOL_TIMEOUT": "1200000"
  },
  "mcpServers": {
    "askTheChorus": {
      "command": "node",
      "args": ["/Users/tqwhite/Documents/webdev/miloAgentServices/system/code/mcp-servers/askTheChorus/index.js"]
    }
  }
}
```

Restart Claude Code after adding the configuration.

## Tool: `ask_the_chorus`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| prompt | string | yes | — | The question or topic for the chorus to analyze |
| perspectives | number | no | 3 | Number of expert perspectives (0 = single-call, no chorus) |
| summarize | boolean | no | true | Add synthesis stage after perspectives |
| model | string | no | "sonnet" | AI model: "opus", "sonnet", or "haiku" |
| dryRun | boolean | no | false | Use mock responses, no API calls |
| serialFanOut | boolean | no | true | Run agents sequentially (avoids rate limits) |

## Example Usage

From Claude Code, ask:

```
Use the ask_the_chorus tool with prompt "Evaluate the implications of x402 micropayments for API monetization" with 3 perspectives and summarize true
```

A typical 3-perspective study with synthesis takes 5-15 minutes.

## Quick Tests

1. **Dry run** (instant, no API calls): `ask_the_chorus` with `prompt: "test"`, `dryRun: true`
2. **Single call** (~30s): `ask_the_chorus` with `prompt: "What is quantum computing?"`, `perspectives: 0`
3. **Full chorus** (5-15 min): `ask_the_chorus` with `prompt: "Your real question"`, `perspectives: 3`, `summarize: true`

## Troubleshooting

- **MCP server not in `/mcp` list** — check settings.json path, restart Claude Code
- **Connection refused** — is Conway sandbox running? `curl https://milo3.life.conway.tech/api/ping`
- **Timeout** — is `MCP_TOOL_TIMEOUT` set? Check `env | grep MCP`
- **404 on endpoint** — the private endpoint hasn't been deployed to Conway yet
