# miloAgentServices

A full-stack web application that exposes askMilo — an AI Chorus of Experts pipeline — as a paid API service with x402 USDC micropayments, MCP integration for Claude Code, and a Nuxt frontend.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [askMilo: The Core Engine](#askmilo-the-core-engine)
- [The Chorus Pipeline](#the-chorus-pipeline)
- [Serial vs Parallel Fan-Out](#serial-vs-parallel-fan-out)
- [Web Stack Integration](#web-stack-integration)
- [Async Delivery: Submit + Check Pattern](#async-delivery-submit--check-pattern)
- [Calling From Outside](#calling-from-outside)
- [x402 Payment Integration](#x402-payment-integration)
- [MCP Server](#mcp-server)
- [Conway Deployment](#conway-deployment)
- [Configuration](#configuration)
- [Directory Structure](#directory-structure)
- [Development Workflow](#development-workflow)

---

## Architecture Overview

```
                                    ┌──────────────────────┐
  Claude Code ──► MCP Server ──────►│  Conway Entry (3000)  │
  (stdio, x402 payment)            │  - x402 paywall       │
                                    │  - static files       │
  Browser ─────────────────────────►│  - API proxy          │
                                    └──────────┬───────────┘
                                               │
                                    ┌──────────▼───────────┐
                                    │  startApiServer (7792)│
                                    │  - endpoints          │
                                    │  - access points      │
                                    │  - SQLite             │
                                    └──────────┬───────────┘
                                               │
                                    ┌──────────▼───────────┐
                                    │  askMilo (child proc) │
                                    │  - expand             │
                                    │  - fan-out            │
                                    │  - synthesize         │
                                    │  - Anthropic API      │
                                    └──────────────────────┘
```

---

## askMilo: The Core Engine

askMilo is a CLI tool that runs an AI "Chorus of Experts" analysis pipeline. It takes a prompt, expands it into multiple research perspectives, fans them out to separate AI agents, and optionally synthesizes the results.

### Canonical Source

askMilo is **not maintained in this repository.** The canonical source lives at:

```
/Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/ask-milo-multitool/
```

A **pre-commit hook** in this repo (`.git/hooks/pre-commit`) rsyncs the canonical files into `server/data-model/lib/ask-milo-multitool/` before every commit and marks them read-only. This ensures miloAgentServices always carries a fresh copy, but edits must be made in qbookSuperTool.

```bash
# The pre-commit hook does:
rsync -a --delete "$CANONICAL" "$DEST"
chmod -R a-w "$DEST"
git add "$DEST"
```

**If you need to change askMilo itself, edit it in qbookSuperTool.** The next commit here will pick it up automatically.

### Config Resolution

askMilo resolves its config independently from the web server. On line 791 of `askMilo.js`:

```javascript
const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
const configDirPath = `${projectRoot}/configs/${configName}/`;
```

This means:
- On TQ's Mac (`qMini.local`): looks at `configs/instanceSpecific/qbook/askMilo.ini`
- On everything else (including Conway): looks at `configs/askMilo.ini` (flat)

This is different from the web server's `figure-out-config-path` module, which has its own hostname-based resolution. When deploying, askMilo.ini must be at the flat `configs/` level — NOT in `configs/instanceSpecific/root/`. See [Configuration](#configuration).

---

## The Chorus Pipeline

When askMilo runs with perspectives > 0, it executes a multi-stage pipeline:

### Stage 1: Expand

An opus-class model reads the user's prompt and generates N research instructions — each with a unique perspective name, research methodology, and detailed instruction. This is the "research design" stage.

**Module:** `stages/expand-direct.mjs`

### Stage 2: Fan-Out

Each research instruction is sent to a separate sonnet-class agent. Each agent produces a detailed response (the "findings"). Agents can run in parallel or serial.

**Module:** `stages/fanOut-direct.mjs`

### Stage 3: Synthesize (optional, `-summarize` flag)

An opus-class model reads ALL the perspective outputs and produces a cross-cutting synthesis — identifying areas of agreement, disagreement, novel insights, and gaps.

**Module:** `stages/synthesize-direct.mjs`

### Stage 4: Collect

Results are assembled into a structured JSON report and optionally written to a session file.

**Module:** `stages/collect.js`

Each stage has two implementations: `*-direct.mjs` (direct Anthropic API calls) and `*.mjs` (Anthropic Agent SDK). The direct driver is used in production. The SDK driver was an alternative that proved slower and more expensive.

---

## Serial vs Parallel Fan-Out

The fan-out stage supports two modes, controlled by the `-serialFanOut` flag:

### Parallel (default)

All perspective agents run simultaneously via `Promise.all()`. Fast but hits Anthropic rate limits with 3+ concurrent requests on opus/sonnet.

### Serial (`-serialFanOut`)

Agents run one-at-a-time in a `for...of` loop. Slower (roughly N * time-per-agent) but avoids rate limits entirely. This is the **recommended mode** for production use.

For 5 perspectives with serial fan-out:
- Expansion: ~30 seconds (opus)
- Each perspective: ~3-5 minutes (sonnet)
- Synthesis: ~2-3 minutes (opus)
- Total: ~20-25 minutes
- Cost: ~$1.30-$1.50

**Why serial matters:** Anthropic's rate limits on concurrent requests are strict. Parallel mode works for 2-3 perspectives but reliably fails with 5+. Serial mode adds time but guarantees completion.

---

## Web Stack Integration

askMilo is integrated into the web server's standard architecture: endpoints → access points → child process.

### Blocking Endpoint (original)

```
POST /api/askTheChorus
  → endpoint: server/endpoints-dot-d/qtDotLib.d/askTheChorus/
  → access point: accessPoints.d/ask-the-chorus.js
  → spawns: askMilo.js as child process
  → waits for completion
  → returns full result in HTTP response
```

This works for single-call mode (perspectives=0, ~5 seconds) but times out for chorus runs (20+ minutes).

### Async Endpoints (current)

Two new endpoints implement a submit-and-poll pattern:

```
POST /api/submitChorusStudy
  → endpoint: server/endpoints-dot-d/qtDotLib.d/submitChorusStudy/
  → access point: accessPoints.d/submit-chorus-study.js
  → spawns: askMilo.js DETACHED (does not wait)
  → returns immediately: { status: "accepted", sessionName, turnNumber, checkUrl }

GET /api/chorusStudyStatus?sessionName=X&turnNumber=N
  → endpoint: server/endpoints-dot-d/qtDotLib.d/chorusStudyStatus/
  → access point: accessPoints.d/chorus-study-status.js
  → reads session file from disk
  → returns: { status: "running" | "complete" | "error", result? }
```

Session files are written by askMilo to `~/Library/Application Support/askMilo/sessions/{sessionName}.json`. The status endpoint reads these files — pure filesystem, no child processes.

### In-Flight Protection

`submit-chorus-study.js` maintains a module-level `Set` of sessions with active turns. If a second request arrives for the same session while a turn is in progress, it's rejected. The set is cleaned up on askMilo completion (success or failure).

### Error Handling

If askMilo crashes (non-zero exit code), the submit access point's `child.on('close')` handler writes an error session file:

```json
{
  "sessionName": "stone_trail",
  "status": "error",
  "error": "askMilo exited with code 1: [stderr output]",
  "failedAt": "2026-02-24T15:01:03.427Z",
  "turns": []
}
```

The status endpoint reads this and returns `{ status: "error", message: "..." }`.

### Endpoint Package.json Requirement

Each endpoint in `endpoints-dot-d/qtDotLib.d/` that lives in a **directory** (not a bare .js file) must have a `package.json` with a `"main"` field pointing to its JS file. This is required by `qtools-library-dot-d`'s auto-loading — Node's `require()` on a directory defaults to `index.js` if no `"main"` is specified, and the endpoint files are not named `index.js`.

Example (`chorusStudyStatus/package.json`):
```json
{
  "name": "chorusStudyStatus",
  "version": "1.0.0",
  "main": "chorusStudyStatus.js"
}
```

**This bit us during deployment.** The original files had stub `package.json` containing only `{ "comment": "..." }`, which worked for access points (different loading mechanism) but caused endpoints to silently fail to register on Express.

---

## Calling From Outside

### Private Endpoint (no payment)

For internal/development use. Not publicly documented.

```bash
curl -X POST "https://milo3.life.conway.tech/api/private/askTheChorus" \
  -H "Content-Type: application/json" \
  -d '{
    "switches": { "dryRun": true },
    "values": { "perspectives": ["0"], "model": ["sonnet"] },
    "fileList": ["Your prompt here"]
  }'
```

The private endpoint is a route in `conway-entry.js` that sets `req._skipPaywall = true` and rewrites the URL to `/api/askTheChorus`. It bypasses x402 entirely.

### Paid Public Endpoint (x402)

```bash
# This returns HTTP 402 with payment details.
# A proper x402 client (like @x402/fetch) handles payment automatically.
curl -X POST "https://milo3.life.conway.tech/api/askTheChorus" \
  -H "Content-Type: application/json" \
  -d '{ "fileList": ["Your prompt"] }'
# → 402 Payment Required (with x402 payment instructions in body)
```

### Async Submit + Poll (recommended for chorus)

```bash
# Submit
curl -X POST "https://milo3.life.conway.tech/api/submitChorusStudy" \
  -H "Content-Type: application/json" \
  -d '{
    "switches": { "serialFanOut": true, "summarize": true },
    "values": { "perspectives": ["5"], "model": ["sonnet"] },
    "fileList": ["Your prompt here"]
  }'
# → { "status": "accepted", "sessionName": "keen_ledge", "turnNumber": 1, ... }

# Poll (after ~5 min, then every 60s)
curl "https://milo3.life.conway.tech/api/chorusStudyStatus?sessionName=keen_ledge&turnNumber=1"
# → { "status": "running", "completedTurns": 0 }  (still working)
# → { "status": "complete", "result": { ... } }     (done — 200KB+ JSON)
```

**Note:** `submitChorusStudy` is NOT currently behind the x402 paywall. Only the original `askTheChorus` endpoint is gated. Adding x402 to the submit endpoint requires a one-line addition to the x402 config in `conway-entry.js`.

---

## x402 Payment Integration

x402 revives the HTTP 402 "Payment Required" status code for stablecoin micropayments. When a client hits a paywalled endpoint, the server returns 402 with payment instructions. The client signs a USDC transfer on Base, retries with an `X-PAYMENT` header, and the server verifies the payment before processing the request.

### Server Side (conway-entry.js)

```javascript
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { HTTPFacilitatorClient } = require('@x402/core/server');
const { registerExactEvmScheme } = require('@x402/evm/exact/server');

const facilitatorClient = new HTTPFacilitatorClient({ url: 'https://facilitator.xpay.sh' });
const resourceServer = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(resourceServer);

const x402 = paymentMiddleware(
    {
        'POST /api/askTheChorus': {
            accepts: [{
                scheme: 'exact',
                price: '$1.00',
                network: 'eip155:8453',    // Base
                payTo: '0xDE0629429672D395A93F9a22840fd43cCb01F219',
            }],
            description: 'AI Chorus of Experts analysis',
        },
    },
    resourceServer,
);
```

Key components:
- **@x402/express**: Express middleware that intercepts requests and handles the 402 dance
- **@x402/core/server**: Communicates with the facilitator service for payment verification
- **@x402/evm/exact/server**: Handles EVM-specific (Base) payment scheme verification
- **Facilitator** (`xpay.sh`): Third-party service that validates payment proofs on-chain. Your server never touches the blockchain directly. Free to use.
- **payTo address**: Where USDC lands. Currently `0xDE06...219`.

### Client Side (MCP Server)

```javascript
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const wallet = JSON.parse(readFileSync('~/.conway/wallet.json', 'utf-8'));
const signer = privateKeyToAccount(wallet.privateKey);

const paymentClient = new x402Client();
registerExactEvmScheme(paymentClient, { signer });

const fetchWithPayment = wrapFetchWithPayment(fetch, paymentClient);
// Now use fetchWithPayment() instead of fetch() — it handles 402 automatically
```

Key components:
- **@x402/fetch**: Wraps the standard fetch. When it gets a 402, it signs a payment and retries.
- **@x402/evm/exact/client**: Handles signing USDC transfers on Base
- **viem**: Ethereum library for wallet/signing operations
- **Wallet**: `~/.conway/wallet.json` contains a hex private key. Must have USDC on Base.

### Adding x402 to New Endpoints

To gate a new endpoint, add it to the `paymentMiddleware` config object:

```javascript
'POST /api/submitChorusStudy': {
    accepts: [{
        scheme: 'exact',
        price: '$1.00',
        network: 'eip155:8453',
        payTo: '0xDE0629429672D395A93F9a22840fd43cCb01F219',
    }],
    description: 'Submit async chorus study',
},
```

---

## MCP Server

The MCP (Model Context Protocol) server exposes the chorus as two tools for Claude Code:

**Location:** `mcp-servers/askTheChorus/`

### Tools

| Tool | Method | Payment | Description |
|------|--------|---------|-------------|
| `submit_chorus_study` | POST | x402 ($1.00 USDC) | Submit study, returns session name |
| `check_chorus_study` | GET | Free | Poll for status/results |

### How It Works

The MCP server runs as a **local stdio process** — Claude Code spawns it as a child process. It is NOT deployed to Conway. It runs on TQ's Mac.

```
Claude Code ──stdio──► MCP Server (index.js)
                          │
                          ├── submit: fetchWithPayment() ──► Conway /api/submitChorusStudy
                          │     (signs x402 USDC payment)
                          │
                          └── check: fetch() ──────────────► Conway /api/chorusStudyStatus
                                (no payment)
```

### Long-Running Process Problem

Chorus studies take 20-25 minutes. The MCP `check_chorus_study` tool returns the complete JSON result, which can be **200KB+** for multi-perspective studies. This floods the Claude Code context window and can cause context exhaustion.

### Solution: Background Agent Pattern

The recommended workflow (codified in the `run-chorus-study` skill):

1. **Main context** calls `submit_chorus_study` via MCP (small response, handles x402)
2. **Main context** spawns a background agent with the session name
3. **Background agent** polls the status endpoint via `curl` (agents can't use MCP tools)
4. **Background agent** saves raw JSON to a file, formats into markdown, returns a 3-sentence summary
5. **Main context** receives only the tiny summary — context stays clean

### MCP Configuration

The MCP server is configured in Claude Code's settings. It needs:
- `@modelcontextprotocol/sdk` for the MCP protocol
- `@x402/fetch` and `@x402/evm` for payment
- `viem` for wallet signing
- `zod` for schema validation
- Access to `~/.conway/wallet.json` for the payment wallet

---

## Conway Deployment

Conway is a sandbox VM hosting service. Our deployment history has been... eventful.

### Current State (February 2026)

- **Sandbox ID:** `58e84ccffdeb056ae39d98031ea14acb`
- **Subdomain:** `milo3.life.conway.tech`
- **Public URL:** `https://milo3.life.conway.tech`
- **Region:** us-east, 1 vCPU, 1024 MB RAM, 5 GB disk

### How Conway Runs

Conway has no nginx. `conway-entry.js` serves as both:
- **Static file server** (port 3000): Serves the Nuxt frontend from `html/.output/public/`
- **API proxy**: Forwards `/api/*` to `startApiServer.js` (port 7792)
- **x402 paywall**: Intercepts paywalled routes before proxying

```
Internet ──► Cloudflare tunnel ──► conway-entry.js (3000)
                                      ├── /api/* ──► proxy ──► startApiServer.js (7792)
                                      ├── /_nuxt/* ──► static (cached 1yr)
                                      └── /* ──► static (SPA fallback)
```

### Problems Encountered

#### 1. Sandbox Bricking

Running `reboot` inside a Conway sandbox bricks it permanently. The status API reports "running" but SSH returns "No route to host" indefinitely. The only recovery is to delete the sandbox and create a new one.

**We have done this twice.** The original sandbox (`milo`, then `milo2`) was bricked. We deleted it and created the current one (`milo3`).

#### 2. Subdomain Name Retention

When you delete a Conway sandbox, its subdomain names are NOT released. `milo` and `milo2` both still return 409 "Subdomain already in use" even though their sandboxes no longer exist. This is why we're on `milo3`.

#### 3. Zombie Processes

`conway-entry.js` spawns `startApiServer.js` as a child. Killing the parent does NOT kill the child — it continues holding port 7792. `pkill -f` patterns can be too broad and kill the SSH connection. The reliable kill sequence:

```bash
ss -tlnp | grep 7792   # find exact PID
kill -9 <pid>           # kill it
```

#### 4. Multiple npm install Locations

The project has node_modules at many levels. All of these need `npm install` on a fresh sandbox:

```
code/                          # Express, http-proxy-middleware, x402
code/server/                   # server dependencies
code/html/                     # Nuxt frontend
code/server/data-model/data-mapping/                          # sqlstring-sqlite
code/server/data-model/lib/sqlite-instance/                   # sqlite3
code/server/data-model/lib/ask-milo-multitool/                # askMilo dependencies
code/server/lib/assemble-configuration-show-help-maybe-exit/lib/figure-out-config-path/
```

#### 5. SQLite Native Binary

npm install pulls the wrong-platform `.node` binary (macOS when we need Linux). Fix: use pre-built Linux x64 binaries from `system/zInstallationHelpers/`:

```bash
cp system/zInstallationHelpers/sqlite3/build/Release/node_sqlite3.node \
   code/server/data-model/lib/sqlite-instance/node_modules/sqlite3/build/Release/
```

### Creating a New Sandbox

When a sandbox dies (and it will):

```bash
# 1. Delete old sandbox
mcp__conway__sandbox_delete: sandbox_id=[OLD_ID]

# 2. Create new sandbox
mcp__conway__sandbox_create: region=us-east, vcpus=1, memory_mb=1024, disk_gb=5

# 3. Claim a subdomain (old names won't be available)
mcp__conway__sandbox_add_domain: sandbox_id=[NEW_ID], subdomain=milo[N]

# 4. Expose port 3000
mcp__conway__sandbox_expose_port: sandbox_id=[NEW_ID], port=3000

# 5. Full setup: git clone, npm install everywhere, native binaries, config deploy, UI build, start
# See the deploy-conway skill for the complete procedure.
```

### Future Plans

We plan to migrate off Conway to TQ's codeFactory Ubuntu server, which runs the same Node/nginx stack and doesn't have Conway's reliability problems. The x402 Express middleware would move into the existing nginx → Express proxy chain.

---

## Configuration

### Config Files

Configuration files live outside the git repo in `system/configs/`:

| File | Purpose |
|------|---------|
| `startApiServer.ini` | Server port, SQLite path, auth tokens, built-in users |
| `askMilo.ini` | Anthropic API key, model defaults, prompt templates |

### Local (Mac)

```
system/configs/instanceSpecific/qbook/startApiServer.ini
system/configs/instanceSpecific/qbook/askMilo.ini
```

### Conway

**CRITICAL: Flat deployment.** Config files go to `system/configs/` directly, NOT `system/configs/instanceSpecific/root/`. The `instanceSpecific/conwayBox1/` nesting is a local organizational convention only. Both the server's `figure-out-config-path` and askMilo's hostname fallback expect configs at `configs/*.ini`.

```
# Local source (what we edit)
system/configs/instanceSpecific/conwayBox1/startApiServer.ini
system/configs/instanceSpecific/conwayBox1/askMilo.ini

# Conway destination (where they go)
/root/miloAgentServices_project/system/configs/startApiServer.ini
/root/miloAgentServices_project/system/configs/askMilo.ini
```

Conway configs contain Conway-specific paths (e.g., `projectRoot=/root/miloAgentServices_project/system/`). They are NOT the same as the local Mac configs.

---

## Directory Structure

```
system/
├── code/                              # Main git repo
│   ├── conway-entry.js                # Conway proxy + x402 + static server
│   ├── server/
│   │   ├── startApiServer.js          # API server (port 7792)
│   │   ├── endpoints-dot-d/
│   │   │   └── qtDotLib.d/
│   │   │       ├── askTheChorus/      # Blocking chorus endpoint
│   │   │       ├── chorusStudyStatus/ # Async status check
│   │   │       ├── submitChorusStudy/ # Async submit
│   │   │       ├── login/             # User auth
│   │   │       ├── ping/              # Health check
│   │   │       └── ...
│   │   └── data-model/
│   │       ├── access-points-dot-d/
│   │       │   └── accessPoints.d/
│   │       │       ├── ask-the-chorus.js       # Blocking: spawn askMilo, wait
│   │       │       ├── submit-chorus-study.js  # Async: spawn detached, return immediately
│   │       │       ├── chorus-study-status.js  # Read session file from disk
│   │       │       └── ...
│   │       ├── lib/
│   │       │   ├── ask-milo-multitool/         # askMilo (rsynced from qbookSuperTool)
│   │       │   │   ├── askMilo.js              # Main entry point
│   │       │   │   ├── stages/                 # Pipeline stages
│   │       │   │   │   ├── expand-direct.mjs
│   │       │   │   │   ├── fanOut-direct.mjs   # Parallel + serial implementations
│   │       │   │   │   ├── synthesize-direct.mjs
│   │       │   │   │   └── collect.js
│   │       │   │   └── lib/
│   │       │   │       └── sessionManager/     # Session name generation + file I/O
│   │       │   └── sqlite-instance/
│   │       └── data-mapping/
│   ├── html/                          # Nuxt frontend
│   │   └── .output/public/            # Built static files
│   └── mcp-servers/
│       └── askTheChorus/
│           ├── index.js               # MCP stdio server (runs locally, not on Conway)
│           └── package.json
├── configs/
│   └── instanceSpecific/
│       ├── qbook/                     # Mac configs
│       └── conwayBox1/                # Conway configs (deploy flat to configs/)
├── dataStores/
│   └── miloAgentServices_dev.sqlite3
├── management/
│   └── zNotesPlansDocs/
│       ├── chorus-results/            # Formatted chorus study output
│       └── EXEC-async-chorus-delivery.md
└── zInstallationHelpers/
    ├── sqlite3/                       # Linux x64 native binary
    ├── better-sqlite3/
    └── sqlite-vec-linux-x64/
```

---

## Development Workflow

### Making Changes to askMilo

1. Edit files in `/Users/tqwhite/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/ask-milo-multitool/`
2. Commit in this repo — pre-commit hook rsyncs automatically
3. Deploy to Conway if needed (git pull, restart if server code changed)

### Making Changes to Server Endpoints

1. Edit in `server/endpoints-dot-d/` or `server/data-model/access-points-dot-d/`
2. Test locally
3. Commit, push, pull on Conway, restart server

### Making Changes to MCP Server

1. Edit `mcp-servers/askTheChorus/index.js`
2. Restart Claude Code (or the MCP server) to pick up changes
3. The MCP server runs locally — Conway only needs a pull to stay in sync

### Making Changes to x402 Config

1. Edit `conway-entry.js` (payment routes, prices, payTo address)
2. Commit, push, pull on Conway, restart server

### Running a Chorus Study

```bash
# Via MCP (recommended — handles payment)
# Use the run-chorus-study skill in Claude Code

# Via CLI (local, no payment)
echo '{"switches":{"serialFanOut":true,"summarize":true},"values":{"perspectives":["5"],"model":["sonnet"]},"fileList":["Your prompt"]}' | \
  node server/data-model/lib/ask-milo-multitool/askMilo.js

# Via curl (Conway, private bypass)
curl -X POST "https://milo3.life.conway.tech/api/private/askTheChorus" \
  -H "Content-Type: application/json" \
  -d '{"switches":{"serialFanOut":true,"summarize":true},"values":{"perspectives":["5"],"model":["sonnet"]},"fileList":["Your prompt"]}'
```

---

## Key Commits

| Hash | Description |
|------|-------------|
| `d564727` | Add askTheChorus MCP server (v1 — blocking, private endpoint) |
| `f3f75c1` | Enable x402 USDC payment in askTheChorus MCP server |
| `aae5774` | Add async chorus delivery — submit + check two-tool pattern |
| `c396c49` | Fix endpoint package.json — add main field for dotD loader |
| `853ab61` | Update Conway subdomain from milo2 to milo3 |
| `2461658` | Add large-result warning to check_chorus_study MCP tool description |

---

## Known Issues

1. **submitChorusStudy is not x402 gated** — Needs a one-line addition to conway-entry.js x402 config
2. **askMilo hostname check is hardcoded** — Only knows `qMini.local`. Conway works via flat config placement, but any new host will have the same issue
3. **Conway sandboxes are fragile** — Don't run `reboot`. Process management is manual. Plan to migrate to codeFactory.
4. **No automatic Conway restart** — If the server crashes, you must manually restart via `sandbox_exec`
5. **Chorus results are huge** — 200KB+ for 5-perspective studies. Never return inline to a context-limited client.
