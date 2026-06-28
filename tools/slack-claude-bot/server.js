import express from "express";
import dotenv from "dotenv";
import { WebClient } from "@slack/web-api";
import { exec } from "child_process";
import util from "util";
import fs from "fs/promises";

dotenv.config();

const app = express();
const execAsync = util.promisify(exec);
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

let running = false;

const repo = process.env.GITHUB_REPO || "pissartel/Artist-Radar";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Slack Claude bot is running.");
});

app.post("/slack/command", async (req, res) => {
  const text = req.body.text || "";
  const channel = req.body.channel_id;

  const match = text.match(/issue\s+#?(\d+)/i);

  if (!match) {
    return res.send("Usage: `/dev issue #42`");
  }

  if (running) {
    return res.send("Another Claude task is already running.");
  }

  const issueNumber = match[1];

  res.send(`Starting Claude Code for issue #${issueNumber}...`);

  runClaudeForIssue(issueNumber, channel).catch((error) => {
    console.error("Unhandled Claude task error:", error);
  });
});

app.post("/run-issue", async (req, res) => {
  const issueNumber = req.body.issueNumber;

  if (!issueNumber) {
    return res.status(400).send("Missing issueNumber");
  }

  if (running) {
    return res.status(409).send("Claude already running");
  }

  res.send(`Starting Claude Code for issue #${issueNumber}...`);

  runClaudeForIssue(String(issueNumber), process.env.SLACK_CHANNEL_ID).catch(
    (error) => {
      console.error("Unhandled Claude task error:", error);
    }
  );
});

async function runClaudeForIssue(issueNumber, channel) {
  running = true;

  try {
    const { baseBranch, previousBranchFound } = await prepareGitBase(issueNumber);

    await slack.chat.postMessage({
      channel,
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
- The worker already prepared the repository before starting Claude.
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

    const promptFile = `/tmp/artist-radar-claude-issue-${issueNumber}.txt`;
    await fs.writeFile(promptFile, prompt, "utf8");

    await slack.chat.postMessage({
      channel,
      text: `Claude Code started for issue #${issueNumber}: ${issue.title}\nBase branch: ${baseBranch}`
    });

    const claudeCommand = `
cd "${process.env.REPO_PATH}" &&
cat "${promptFile}" | "${process.env.CLAUDE_BIN}" -p --allowedTools "Read,Write,Edit,MultiEdit,Glob,Grep,Bash(git:*),Bash(gh:*),Bash(npm:*),Bash(pnpm:*),Bash(yarn:*),Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(find:*),Bash(rg:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(rm:*),Bash(touch:*)"
`;

    const { stdout, stderr } = await execAsync(claudeCommand, {
      timeout: 1000 * 60 * 60
    });

    await slack.chat.postMessage({
      channel,
      text:
        `Claude Code finished issue #${issueNumber}.\n\n` +
        `Stdout:\n\`\`\`${stdout.slice(-2500)}\`\`\`\n\n` +
        `Stderr:\n\`\`\`${stderr.slice(-1500)}\`\`\``
    });
  } catch (error) {
    await slack.chat.postMessage({
      channel,
      text: `Claude Code failed for issue #${issueNumber}.\n\`\`\`${String(
        error.message
      ).slice(0, 2500)}\`\`\``
    });
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
      "Working tree is not clean. Commit, stash, or discard local changes before running Claude."
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

app.listen(3000, () => {
  console.log("Slack Claude bot listening on port 3000");
});