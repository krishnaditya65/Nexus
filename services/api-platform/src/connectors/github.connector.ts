// Real GitHub connector — imports open issues from a real GitHub repo (via
// the actual GitHub REST API, `api.github.com`, no mocking) as tickets in
// services/pm. This is the first concrete implementation on top of the
// connector framework in connectors.service.ts; other connector types
// (Jira, Bitbucket) would follow the same `runConnectorSync`-shaped export.

const PM_SERVICE_URL = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';

interface SyncResult {
  imported: number;
  skipped: number;
}

// Pulled out as standalone, exported, pure functions — the idempotency
// logic worth guarding with a regression test — so they're unit-testable
// without a live pm-service. See github.connector.spec.ts.
export function alreadyImportedIssueNumbers(existingTickets: Array<{ description: string | null }>): Set<string> {
  return new Set(
    existingTickets
      .map((t) => t.description?.match(/Imported from GitHub #(\d+)/)?.[1])
      .filter((n): n is string => !!n),
  );
}

export function buildImportedDescription(issue: { body: string | null; number: number; html_url: string }): string {
  return `${issue.body ?? ''}\n\n---\nImported from GitHub #${issue.number} (${issue.html_url})`;
}

interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown; // GitHub's issues endpoint also returns PRs — filtered out below
}

export async function runConnectorSync(
  install: { id: string; config: Record<string, any>; credential: string | null },
  authorizationHeader: string,
): Promise<SyncResult> {
  const { owner, repo, targetProjectId } = install.config ?? {};
  if (!owner || !repo || !targetProjectId) {
    throw new Error("Connector config missing 'owner', 'repo', or 'targetProjectId'");
  }

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'nexus-connector',
  };
  if (install.credential) {
    headers.authorization = `Bearer ${install.credential}`;
  }

  const ghRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=50`,
    { headers },
  );
  if (!ghRes.ok) {
    const body = await ghRes.text();
    throw new Error(`GitHub API returned ${ghRes.status}: ${body.slice(0, 300)}`);
  }
  const issues = (await ghRes.json()) as GithubIssue[];

  // Fetch existing tickets in the target project once, so re-running sync
  // is idempotent (matches on a "Imported from GitHub #<n>" marker in the
  // description rather than re-importing duplicates every run).
  const existingRes = await fetch(
    `${PM_SERVICE_URL}/tickets?projectId=${encodeURIComponent(targetProjectId)}`,
    { headers: { authorization: authorizationHeader } },
  );
  if (!existingRes.ok) {
    throw new Error(`Failed to list existing tickets in target project: ${existingRes.status}`);
  }
  const existingTickets = (await existingRes.json()) as Array<{ description: string | null }>;
  const alreadyImported = alreadyImportedIssueNumbers(existingTickets);

  let imported = 0;
  let skipped = 0;

  for (const issue of issues) {
    if (issue.pull_request) continue; // GitHub's /issues includes PRs; not in scope here
    if (alreadyImported.has(String(issue.number))) {
      skipped++;
      continue;
    }

    const description = buildImportedDescription(issue);
    const createRes = await fetch(`${PM_SERVICE_URL}/tickets`, {
      method: 'POST',
      headers: { authorization: authorizationHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: targetProjectId,
        type: 'bug',
        title: `[GH #${issue.number}] ${issue.title}`,
        description,
      }),
    });
    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Failed to create ticket for issue #${issue.number}: ${createRes.status} ${body.slice(0, 200)}`);
    }
    imported++;
  }

  return { imported, skipped };
}
