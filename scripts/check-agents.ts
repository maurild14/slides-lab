// Self-check for the usage plumbing: what each CLI prints -> what the chat
// panel shows. Run: npm run check:agents
// No framework on purpose — plain asserts, plain node.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ENGINES } from "../src/lib/agents.ts";

// --- Claude: the plan's rate-limit event and the turn's token count.
// Both lines are verbatim from `claude -p --output-format stream-json`.
const claude = ENGINES.claude.createParser();

assert.deepEqual(
  claude(
    JSON.stringify({
      type: "rate_limit_event",
      rate_limit_info: {
        unifiedWindows: {
          five_hour: { utilization: 0.5 },
          seven_day: { utilization: 0.05 },
        },
      },
    })
  ),
  // utilization is a fraction, and Claude is billed in five-hour blocks
  [{ type: "usage", planLabel: "5 h", planUsedPct: 50 }]
);

// The weekly window may be fuller and still not be the one Claude reports on.
assert.deepEqual(
  claude(
    JSON.stringify({
      type: "rate_limit_event",
      rate_limit_info: {
        unifiedWindows: {
          five_hour: { utilization: 0.1 },
          seven_day: { utilization: 0.8 },
        },
      },
    })
  ),
  [{ type: "usage", planLabel: "5 h", planUsedPct: 10 }]
);

assert.deepEqual(
  claude(
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "hola",
      usage: {
        input_tokens: 2,
        output_tokens: 112,
        cache_creation_input_tokens: 21072,
        cache_read_input_tokens: 13463,
      },
    })
  ),
  [{ type: "usage", tokens: 34649 }, { type: "result", text: "hola" }]
);

// --- Codex: the turn's tokens come off the stream, the plan does not.
assert.deepEqual(
  ENGINES.codex.createParser()(
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 21224, cached_input_tokens: 7936, output_tokens: 6 },
    })
  ),
  [{ type: "usage", tokens: 21230 }]
);

// --- Codex: plan usage read back out of a thread's rollout log.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "oc-codex-"));
const id = "01a05f30-c2a2-79f1-becb-9195a977a96c";
const dir = path.join(home, "sessions", "2026", "09", "01");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, `rollout-2026-09-01T19-57-06-${id}.jsonl`),
  [
    JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { total_token_usage: { total_tokens: 21230 } },
        // Codex is billed weekly, and the weekly figure is not always the
        // fuller one — nor always `primary`.
        rate_limits: {
          primary: { used_percent: 40, window_minutes: 300 },
          secondary: { used_percent: 12, window_minutes: 10080 },
        },
      },
    }),
    "",
  ].join("\n")
);

process.env.CODEX_HOME = home;
assert.deepEqual(ENGINES.codex.readPlanUsage!(id), {
  type: "usage",
  totalTokens: 21230,
  planUsedPct: 12,
  planLabel: "7 d",
});
// An unknown thread is normal (first turn, cleared chat) and must stay quiet.
assert.equal(ENGINES.codex.readPlanUsage!("no-such-thread"), null);
fs.rmSync(home, { recursive: true, force: true });

console.log("agents: usage checks pass");
