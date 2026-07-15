# 🔴 Spec Collider

**A multiplayer workspace where AI agents debate your architecture — and you moderate the fight.**

Spec Collider is an adversarial spec review tool where you submit a rough feature idea, a Red Team agent attacks it for risks, an Architect agent proposes mitigations, and you moderate the debate to produce production-ready architecture documents. All streamed in real-time via Amazon Bedrock.

---

## Short Description

Spec Collider is a multiplayer collaborative workspace where a Red Team AI agent stress-tests your software architecture while an Architect AI agent proposes mitigations — all streamed in real-time via Amazon Bedrock. You moderate the structured adversarial debate and walk away with exportable architecture artifacts (requirements, design docs, tasks, and ADRs) ready for implementation.

---

## How Kiro Was Used

Kiro was the primary build partner throughout the entire development lifecycle. Two **Kiro Specs** drove the implementation end-to-end: the core "Spec Collider" spec (10 requirements, 13 task groups, 28 property-based test properties) defined the application logic, and the "Bedrock Deployment" spec (7 requirements, 7 task groups) defined the AWS infrastructure. Every implementation task traced directly back to acceptance criteria, ensuring nothing was built without a reason.

**Steering files** taught Kiro the Material Design 3 color token system — Primary (#7C580D), Secondary (#6D5C3F), Tertiary (#4E6543), and all surface/container variants — so every component was generated on-brand without manual color correction. The steering rules enforced semantic token usage, correct On/Container pairing, and WCAG contrast compliance across the entire UI layer.

Kiro's spec-driven workflow handled the complexity of wiring together isolated AI agents, streaming parsers, moderation state machines, conflict detection, IndexedDB persistence, MCP integration, and responsive three-panel layouts — all while maintaining traceability from requirement to test to implementation. The structured approach meant 527 tests (including property-based tests via fast-check) were generated alongside the code, catching edge cases in SSE parsing and message mapping that manual testing would have missed.

---

## The Room — How It Works

Three panels. One shared workspace. Three participants.

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   SPEC DRAFT     │  │  ACTIVITY FEED   │  │    ARTIFACTS     │
│                  │  │                  │  │                  │
│  • Overview      │  │  [User] Idea     │  │  requirements.md │
│  • Architecture  │  │  [Red] Risk #1   │  │  design.md       │
│  • Data Model    │  │  [Arch] Fix #1   │  │  tasks.md        │
│  • API Surface   │  │  [User] Accept ✓ │  │  adr.md          │
│  • Assumptions   │  │  [Red] Risk #2   │  │  steering-rules  │
│                  │  │  ...streaming... │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Flow

1. **Submit an idea** — Free-form text (10–5000 chars)
2. **Spec Draft generated** — AI structures it into 5 sections
3. **Red Team attacks** — Identifies risks (security, scalability, reliability, edge cases, missing assumptions)
4. **Architect defends** — Proposes mitigations with specific technologies and trade-offs
5. **You moderate** — Accept, Reject, or Edit each proposal with conflict detection
6. **Simulate Chaos** — Triggers catastrophic failure analysis (cascading failures, adversarial patterns)
7. **Finalize Spec** — Exports architecture documents to your filesystem

---

## Architecture

```
┌──────────┐       ┌────────────────┐       ┌──────────────────┐       ┌─────────────┐       ┌──────────────┐
│   User   │─HTTPS─│  CloudFront    │       │  HTTP API GW     │─Invoke│   Lambda    │─SDK──│   Bedrock    │
│ (Browser)│       │  (CDN + SPA)   │       │  POST /converse  │───────│  (Node 20)  │──────│  Nova 2 Lite │
└──────────┘       └───────┬────────┘       └──────────────────┘       └──────┬──────┘       └──────────────┘
                           │ OAC                                               │
                    ┌──────┴──────┐                                    ┌──────┴──────┐
                    │  S3 Bucket  │                                    │  IAM Role   │
                    │  (private)  │                                    │ (bedrock:*) │
                    └─────────────┘                                    └─────────────┘
```

### Data Flow

1. **User** loads the React SPA from CloudFront (global CDN, HTTPS)
2. **CloudFront** fetches static assets from a private S3 bucket via Origin Access Control
3. **React app** submits feature ideas → Red Team + Architect agents run adversarial review
4. **AgentOrchestrator** POSTs `{ messages, system }` to API Gateway `/converse`
5. **API Gateway** forwards to the Lambda proxy (CORS enabled, no auth)
6. **Lambda** maps the payload to Bedrock format, invokes `ConverseStreamCommand`
7. **Bedrock** (Nova 2 Lite) streams response chunks back to Lambda
8. **Lambda** formats each chunk as SSE (`data: {"content":"...","done":false}\n\n`) and returns
9. **Frontend** parses SSE events, yields `StreamChunk` objects via `AsyncGenerator`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS (Material Design 3) |
| State Management | Zustand + IndexedDB persistence |
| CDN | Amazon CloudFront + S3 (Origin Access Control) |
| API | Amazon API Gateway HTTP API |
| Backend | AWS Lambda (Node.js 20.x) — thin Bedrock proxy |
| AI Model | Amazon Bedrock — `us.amazon.nova-2-lite-v1:0` (ConverseStream API) |
| Context | Model Context Protocol (MCP) — up to 5 simultaneous providers |
| IaC | AWS CDK (TypeScript, single stack) |
| Testing | Vitest + fast-check (property-based, 527 tests) |

---

## What Makes It Multiplayer

This isn't a chatbot. It's a room with defined roles:

| Participant | Role | Constraint |
|------------|------|-----------|
| **Red Team Agent** | Only produces Risks | Never suggests fixes. Isolated prompt, isolated context. |
| **Architect Agent** | Only produces Mitigations | Never attacks. References specific technologies. |
| **Human** | Moderates decisions | Accept/Reject/Edit. Triggers Chaos. Finalizes output. |

### AI Role Isolation

- Each agent has its own system prompt — never sees the other's configuration
- Context isolation prevents cross-contamination across debate turns
- System prompts are protocol-separated from user content (prompt injection resistance)
- Red Team outputs structured `Risk` objects exclusively
- Architect outputs structured `Mitigation` objects exclusively

---

## Key Design Decisions

### Streaming via SSE
The Lambda proxy streams Bedrock responses as Server-Sent Events. The frontend parses via `AsyncGenerator<StreamChunk>`, giving instant token-by-token feedback.

### Property-Based Testing
28 correctness properties validated with fast-check: SSE round-trip fidelity, agent output exclusivity, moderation state transitions, responsive breakpoints, version cap enforcement, and more.

### MCP Integration
The workspace reads actual repository structure and infrastructure state via Model Context Protocol, grounding AI analysis in reality.

### Conflict Detection
When you try to accept a mitigation targeting a spec section already modified by a prior decision, the system catches the conflict and asks you to re-review.

### Session Persistence
Full state persisted to IndexedDB within 2 seconds of any action. Auto-retry on save failure (3 attempts). Restore within 5 seconds including scroll positions.

---

## The Output

After moderation, you export:

| File | Content |
|------|---------|
| `requirements.md` | All accepted requirements |
| `design.md` | Final architecture with mitigations applied |
| `tasks.md` | Implementation tasks (one per accepted mitigation minimum) |
| `adr.md` | Architecture Decision Records for every trade-off |
| `steering-rules.md` | Reusable constraints for future builds (optional) |

Routed to `.kiro/specs/` and `.kiro/steering/` automatically.

---

## Getting Started

### Prerequisites

- Node.js 20+
- AWS CLI configured with credentials
- AWS CDK CLI (`npm install -g aws-cdk`)
- Bedrock model access enabled for `us.amazon.nova-2-lite-v1:0` in your region

### Local Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`. Set `VITE_API_ENDPOINT` in `.env` to point to your deployed API Gateway URL.

### Deploy

```bash
# 1. Build the frontend
npm run build

# 2. Bootstrap CDK (first time only)
cd infra
npm install
npx cdk bootstrap

# 3. Deploy the stack
npx cdk deploy
```

After deploy, CDK outputs:
- **DistributionUrl** — your live app URL
- **ApiUrl** — your API Gateway endpoint

### Two-Deploy Workflow (bake API URL into frontend)

```bash
# First deploy to get the API URL
cd infra && npx cdk deploy

# Note the ApiUrl output, then rebuild frontend with it
cd ..
VITE_API_ENDPOINT=https://YOUR_API_ID.execute-api.REGION.amazonaws.com/converse npm run build

# Redeploy to upload the updated dist/
cd infra && npx cdk deploy
```

### Run Tests

```bash
npm run test        # single run (527 tests)
npm run test:watch  # watch mode
```

---

## Project Structure

```
red/
├── src/                          # React SPA source
│   ├── agents/                   # AgentOrchestrator, Red Team parser, Architect parser
│   ├── components/               # UI panels (WorkspaceLayout, SpecDraft, ActivityFeed, Artifacts, Toolbar)
│   ├── core/                     # Business logic (store, moderation, validation, artifact generation)
│   ├── integration/              # IndexedDB persistence, MCP client, filesystem writer
│   └── types/                    # TypeScript interfaces (domain, events, streaming, MCP, UI)
├── infra/                        # AWS CDK infrastructure
│   ├── bin/app.ts                # CDK app entry point
│   ├── lib/bedrock-stack.ts      # Single stack (S3, CloudFront, Lambda, API GW, IAM)
│   └── lambda/                   # Lambda handler + utilities
│       ├── handler.ts            # Bedrock proxy (validate → map → stream → SSE)
│       ├── sse.ts                # SSE format/parse utilities
│       └── message-mapper.ts     # Frontend → Bedrock message mapping
├── tests/
│   ├── properties/               # Property-based tests (fast-check)
│   └── unit/                     # Unit tests
├── .kiro/
│   ├── specs/                    # Kiro Specs (spec-collider, bedrock-deployment)
│   └── steering/                 # Design system tokens, workflow rules
└── dist/                         # Built frontend (deployed to S3)
```

---

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_API_ENDPOINT` | Frontend build | API Gateway URL + `/converse` path |
| `BEDROCK_MODEL_ID` | Lambda env | Bedrock model ID (default: `us.amazon.nova-2-lite-v1:0`) |

---

## Kiro Challenge Day 2 Submission

**Challenge**: Build a multiplayer workspace where humans and AI agents team up to make something real.

**What we built**: A room where AI feels like part of the team — with defined roles, structured output, adversarial tension, and human control. The user leaves with real architecture artifacts, not just a chat transcript.

**Built with Kiro** — from first idea to final deploy.

---

## License

Private
