import express from "express";
import dotenv from "dotenv";
import { WebClient } from "@slack/web-api";
import { exec } from "child_process";
import util from "util";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.join(__dirname, ".env")
});

const app = express();
const execAsync = util.promisify(exec);
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

let running = false;

const repo = process.env.GITHUB_REPO || "pissartel/Artist-Radar";
const SUPPORTED_AGENTS = ["claude", "codex", "kimi"];

function resolveAgent(value) {
  const agent = String(value || process.env.DEFAULT_AGENT || "claude").trim().toLowerCase();
  if (!SUPPORTED_AGENTS.includes(agent)) {
    throw new Error(`Unsupported agent "${agent}". Choose claude, codex, or kimi.`);
  }
  return agent;
}

function agentLabel(agent) {
  return agent === "claude" ? "Claude Code" : agent === "codex" ? "Codex" : "Kimi Code";
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

function buildAgentCommand(agent, promptFile) {
  const repoPath = requireEnv("REPO_PATH");
  const quotedRepo = JSON.stringify(repoPath);
  const quotedPrompt = JSON.stringify(promptFile);

  if (agent === "claude") {
    const binary = JSON.stringify(requireEnv("CLAUDE_BIN"));
    return `cd ${quotedRepo} && cat ${quotedPrompt} | ${binary} -p --allowedTools "Read,Write,Edit,MultiEdit,Glob,Grep,Bash(git:*),Bash(gh:*),Bash(npm:*),Bash(pnpm:*),Bash(yarn:*),Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(find:*),Bash(rg:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(rm:*),Bash(touch:*)"`;
  }

  if (agent === "codex") {
    const binary = JSON.stringify(requireEnv("CODEX_BIN"));
    return `cd ${quotedRepo} && cat ${quotedPrompt} | ${binary} exec --dangerously-bypass-approvals-and-sandbox -C ${quotedRepo} -`;
  }

  const binary = JSON.stringify(process.env.KIMI_BIN?.trim() || "kimi");
  return `cd ${quotedRepo} && ${binary} --auto --prompt "$(cat ${quotedPrompt})"`;
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Slack development bot is running.");
});

app.post("/slack/command", async (req, res) => {
  const text = req.body.text || "";
  const channel = req.body.channel_id;

  const match = text.match(/issue\s+#?(\d+)/i);

  if (!match) {
    return res.send("Usage: `/dev issue #42 [claude|codex|kimi]`");
  }

  const agent = resolveAgent(text.match(/\b(claude|codex|kimi)\b/i)?.[1]);

  if (running) {
    return res.send("Another development task is already running.");
  }

  const issueNumber = match[1];

  res.send(`Starting ${agentLabel(agent)} for issue #${issueNumber}...`);

  runAgentForIssue(issueNumber, channel, undefined, agent).catch((error) => {
    console.error("Unhandled development task error:", error);
  });
});

app.post("/run-issue", handleRunIssue);
app.post("/run-claude-feature", withAgent("claude", handleRunIssue));
app.post("/run-codex-feature", withAgent("codex", handleRunIssue));
app.post("/run-kimi-feature", withAgent("kimi", handleRunIssue));

async function handleRunIssue(req, res) {
  const { issueNumber, projectItemId } = req.body;
  let agent;
  try {
    agent = resolveAgent(req.body.agent ?? req.body.provider);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  if (!issueNumber) {
    return res.status(400).json({
      success: false,
      error: "Missing issueNumber"
    });
  }

  if (running) {
    return res.status(409).json({
      success: false,
      issueNumber,
      error: "Another development task is already running"
    });
  }

  try {
    await runAgentForIssue(
      String(issueNumber),
      process.env.SLACK_CHANNEL_ID,
      projectItemId,
      agent
    );

    return res.json({
      success: true,
      issueNumber,
      agent
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      issueNumber,
      error: String(error.message)
    });
  }
}

async function runAgentForIssue(issueNumber, channel, projectItemId, agent) {
  const resolvedChannel = channel || process.env.SLACK_CHANNEL_ID;

  if (!resolvedChannel) {
    throw new Error("Missing Slack channel. Set SLACK_CHANNEL_ID in .env.");
  }

  running = true;

  try {
    const { baseBranch, previousBranchFound } = await prepareGitBase(issueNumber);

    await slack.chat.postMessage({
      channel: resolvedChannel,
      text: `Fetching GitHub issue #${issueNumber}...`
    });

    const issueCommand = `"${process.env.GH_BIN}" issue view ${issueNumber} --repo "${repo}" --json title,body,labels,url`;
    const { stdout: issueJson } = await execAsync(issueCommand, {
      timeout: 1000 * 30
    });

    const issue = JSON.parse(issueJson);

    const prompt = `
Implement GitHub issue #${issueNumber} in the Artist-Radar repository.

Follow strictly:
1. CLAUDE.md
2. AGENTS.md
3. Relevant files in agents/

Important:
- Do not look for agents/team; it no longer exists.
- Select only the relevant specialist agents from the agents/ directory.
- Follow CLAUDE.md strictly for branch naming, PR naming, commit naming, PR body, quality standards, coding principles, UI principles, booking rules, and safety rules.
- Do not ask to fetch the GitHub issue. The full issue content is provided below.

Git base preparation:
- The worker already prepared the repository before starting the development agent.
- Base branch: ${baseBranch}
- Previous issue branch found: ${previousBranchFound ? "yes" : "no"}
- Create the implementation branch from this base branch.
- Open the PR against: ${baseBranch}

GitHub issue:

URL:
${issue.url}

Title:
${issue.title}

Labels:
${issue.labels?.map((label) => label.name).join(", ") || "none"}

Body:
${issue.body || "(empty issue body)"}

Use the GitHub issue above as the source of truth.

Workflow:
1. Read the full issue content provided in this prompt.
2. Identify Area and Work Type from the issue.
3. Create the correct branch from the prepared base branch.
4. Implement only the requested scope.
5. Run lint/tests/build if available.
6. Commit using the repository convention.
7. Push the branch.
8. Open a pull request against ${baseBranch}.
9. Do not merge.

PR body must include:
Closes #${issueNumber}

Report honestly:
- Summary
- Changes
- Tests run
- Risks / limitations

Do not claim tests passed if they were not executed.
`;

    const promptFile = `/tmp/artist-radar-${agent}-issue-${issueNumber}.txt`;
    await fs.writeFile(promptFile, prompt, "utf8");

    await setProjectItemStatus(
      projectItemId,
      process.env.GITHUB_AI_PROGRESS_OPTION_ID
    );

    await slack.chat.postMessage({
      channel: resolvedChannel,
      text: `${agentLabel(agent)} started for issue #${issueNumber}: ${issue.title}\nBase branch: ${baseBranch}`
    });

    const agentCommand = buildAgentCommand(agent, promptFile);

    const { stdout, stderr } = await execAsync(agentCommand, {
      timeout: 1000 * 60 * 60
    });

    await slack.chat.postMessage({
      channel: resolvedChannel,
      text:
        `${agentLabel(agent)} finished issue #${issueNumber}.\n\n` +
        `Stdout:\n\`\`\`${stdout.slice(-2500)}\`\`\`\n\n` +
        `Stderr:\n\`\`\`${stderr.slice(-1500)}\`\`\``
    });

    return {
      issueNumber,
      stdout,
      stderr
    };
  } catch (error) {
    await slack.chat.postMessage({
      channel: resolvedChannel,
      text: `${agentLabel(agent)} failed for issue #${issueNumber}.\n\`\`\`${String(
        error.message
      ).slice(0, 2500)}\`\`\``
    });

    throw error;
  } finally {
    running = false;
  }
}

async function prepareGitBase(issueNumber) {
  const previousIssue = Number(issueNumber) - 1;

  const { stdout: status } = await execAsync(
    `cd "${process.env.REPO_PATH}" && git status --porcelain`,
    { timeout: 1000 * 30 }
  );

  if (status.trim()) {
    throw new Error(
      "Working tree is not clean. Commit, stash, or discard local changes before running a development agent."
    );
  }

  await execAsync(`cd "${process.env.REPO_PATH}" && git fetch origin --prune`, {
    timeout: 1000 * 60
  });

  const { stdout } = await execAsync(
    `cd "${process.env.REPO_PATH}" && git branch -r --list "origin/*-${previousIssue}_*"`,
    { timeout: 1000 * 30 }
  );

  const previousBranch = stdout
    .split("\n")
    .map((line) => line.trim().replace(/^origin\//, ""))
    .find(Boolean);

  const baseBranch = previousBranch || "main";

  await execAsync(`cd "${process.env.REPO_PATH}" && git checkout ${baseBranch}`, {
    timeout: 1000 * 30
  });

  await execAsync(
    `cd "${process.env.REPO_PATH}" && git pull --rebase origin ${baseBranch}`,
    { timeout: 1000 * 60 }
  );

  return {
    baseBranch,
    previousBranchFound: Boolean(previousBranch)
  };
}

async function setProjectItemStatus(projectItemId, optionId) {
  if (!projectItemId) return;

  const requiredEnv = [
    "GITHUB_TOKEN",
    "GITHUB_PROJECT_ID",
    "GITHUB_STATUS_FIELD_ID"
  ];

  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key} in .env`);
    }
  }

  if (!optionId) {
    throw new Error("Missing GitHub Project status option id.");
  }

  const query = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item {
          id
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json"
    },
    body: JSON.stringify({
      query,
      variables: {
        projectId: process.env.GITHUB_PROJECT_ID,
        itemId: projectItemId,
        fieldId: process.env.GITHUB_STATUS_FIELD_ID,
        optionId
      }
    })
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json;
}

app.post("/run-pr-feedback", handleRunPrFeedback);
app.post("/run-claude-fix", withAgent("claude", handleRunPrFeedback));
app.post("/run-codex-fix", withAgent("codex", handleRunPrFeedback));
app.post("/run-kimi-fix", withAgent("kimi", handleRunPrFeedback));

async function handleRunPrFeedback(req, res) {
  const { prNumber, branchName, feedbacks } = req.body;
  let agent;
  try {
    agent = resolveAgent(req.body.agent ?? req.body.provider);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  if (!prNumber || !branchName || !Array.isArray(feedbacks) || feedbacks.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing prNumber, branchName, or feedbacks"
    });
  }

  if (running) {
    return res.status(409).json({
      success: false,
      error: "Another development task is already running"
    });
  }

  try {
    await runAgentForPrFeedback({
      prNumber,
      branchName,
      feedbacks,
      channel: process.env.SLACK_CHANNEL_ID,
      agent
    });

    return res.json({ success: true, prNumber, agent });
  } catch (error) {
    return res.status(500).json({
      success: false,
      prNumber,
      error: String(error.message)
    });
  }
}

function withAgent(agent, handler) {
  return (req, res) => {
    req.body = { ...req.body, agent };
    return handler(req, res);
  };
}

async function runAgentForPrFeedback({
  prNumber,
  branchName,
  feedbacks,
  channel,
  agent
}) {
  const resolvedChannel = channel || process.env.SLACK_CHANNEL_ID;

  if (!resolvedChannel) {
    throw new Error("Missing Slack channel. Set SLACK_CHANNEL_ID in .env.");
  }

  running = true;

  try {
    const feedbackText = feedbacks
      .map((feedback, index) => {
        return `Feedback ${index + 1}
ID: ${feedback.id}
Author: ${feedback.author}
URL: ${feedback.url}

${feedback.body}`;
      })
      .join("\n\n---\n\n");

    await slack.chat.postMessage({
      channel: resolvedChannel,
      text: `${agentLabel(agent)} PR feedback started for PR #${prNumber}\nBranch: ${branchName}\nFeedback comments: ${feedbacks.length}`
    });

    const { stdout: status } = await execAsync(
      `cd "${process.env.REPO_PATH}" && git status --porcelain`,
      { timeout: 1000 * 30 }
    );

    if (status.trim()) {
      throw new Error(
        "Working tree is not clean. Commit, stash, or discard local changes before running a development agent."
      );
    }

    await execAsync(
      `cd "${process.env.REPO_PATH}" && git fetch origin --prune`,
      { timeout: 1000 * 60 }
    );

    await execAsync(
      `cd "${process.env.REPO_PATH}" && git checkout "${branchName}"`,
      { timeout: 1000 * 30 }
    );

    await execAsync(
      `cd "${process.env.REPO_PATH}" && git pull --rebase origin "${branchName}"`,
      { timeout: 1000 * 60 }
    );

    const prompt = `
You are updating an existing GitHub pull request after review feedback.

Repository:
Artist-Radar

Pull request:
#${prNumber}

Branch:
${branchName}

Feedback comments to address:
${feedbackText}

Instructions:
- Work on the existing PR branch only.
- Do not create a new branch.
- Do not open a new PR.
- Address all feedback comments in one pass.
- Make one cohesive commit if changes are needed.
- Modify only what is requested by the feedback.
- Preserve the existing scope and architecture.
- Run relevant lint/tests/build if available.
- Commit the changes to the same branch.
- Push the same branch.
- Report honestly what changed and which tests were run.
- Do not claim tests passed if they were not executed.
`;

    const promptFile = `/tmp/artist-radar-${agent}-pr-${prNumber}.txt`;
    await fs.writeFile(promptFile, prompt, "utf8");

    const agentCommand = buildAgentCommand(agent, promptFile);

    const { stdout, stderr } = await execAsync(agentCommand, {
      timeout: 1000 * 60 * 60
    });

    const processedIds = feedbacks.map((feedback) => `- ${feedback.id}`).join("\n");

    await execAsync(
      `"${process.env.GH_BIN}" pr comment ${prNumber} --repo "${repo}" --body ${JSON.stringify(
        `✅ ${agentLabel(agent)} processed feedback\n\nProcessed comment IDs:\n${processedIds}`
      )}`,
      { timeout: 1000 * 30 }
    );

    await slack.chat.postMessage({
      channel: resolvedChannel,
      text:
        `${agentLabel(agent)} PR feedback finished for PR #${prNumber}.\n\n` +
        `Processed comments: ${feedbacks.length}\n\n` +
        `Stdout:\n\`\`\`${stdout.slice(-2500)}\`\`\`\n\n` +
        `Stderr:\n\`\`\`${stderr.slice(-1500)}\`\`\``
    });

    return { prNumber, stdout, stderr };
  } catch (error) {
    await slack.chat.postMessage({
      channel: resolvedChannel,
      text: `${agentLabel(agent)} PR feedback failed for PR #${prNumber}.\n\`\`\`${String(
        error.message
      ).slice(0, 2500)}\`\`\``
    });

    throw error;
  } finally {
    running = false;
  }
}

app.listen(3000, () => {
  console.log("Slack Claude bot listening on port 3000");
});
