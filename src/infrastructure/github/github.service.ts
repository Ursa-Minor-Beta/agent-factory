import { Octokit } from '@octokit/rest';

export interface GitHubFile {
  path: string;
  content: string;
  sha: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  date: Date;
  author: string;
}

export interface CreateOrUpdateFileParams {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
  sha?: string; // Required for update
}

export interface GetFileParams {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  ref?: string; // Specific commit SHA
}

export interface ListCommitsParams {
  owner: string;
  repo: string;
  path?: string;
  branch?: string;
}

function parseRepo(repository: string): { owner: string; repo: string } {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository format: ${repository}. Expected "owner/repo"`);
  }
  return { owner, repo };
}

export function createGitHubClient(token: string, baseUrl?: string): Octokit {
  return new Octokit({
    auth: token,
    ...(baseUrl && { baseUrl }),
  });
}

/**
 * Create unauthenticated client for public repos (60 req/hour rate limit)
 */
export function createPublicGitHubClient(): Octokit {
  return new Octokit();
}

export async function getFile(
  client: Octokit,
  params: GetFileParams
): Promise<GitHubFile | null> {
  try {
    const response = await client.rest.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      ref: params.ref ?? params.branch,
    });

    const data = response.data;
    if (Array.isArray(data) || data.type !== 'file') {
      return null;
    }

    return {
      path: data.path,
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
    };
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function createOrUpdateFile(
  client: Octokit,
  params: CreateOrUpdateFileParams
): Promise<GitHubCommit> {
  const response = await client.rest.repos.createOrUpdateFileContents({
    owner: params.owner,
    repo: params.repo,
    path: params.path,
    message: params.message,
    content: Buffer.from(params.content).toString('base64'),
    branch: params.branch,
    sha: params.sha,
  });

  return {
    sha: response.data.commit.sha ?? '',
    message: response.data.commit.message ?? params.message,
    date: new Date(response.data.commit.author?.date ?? Date.now()),
    author: response.data.commit.author?.name ?? 'unknown',
  };
}

export async function listCommits(
  client: Octokit,
  params: ListCommitsParams
): Promise<GitHubCommit[]> {
  const response = await client.rest.repos.listCommits({
    owner: params.owner,
    repo: params.repo,
    path: params.path,
    sha: params.branch,
  });

  return response.data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    date: new Date(commit.commit.author?.date ?? Date.now()),
    author: commit.commit.author?.name ?? 'unknown',
  }));
}

export async function getFileAtCommit(
  client: Octokit,
  repository: string,
  path: string,
  commitSha: string
): Promise<GitHubFile | null> {
  const { owner, repo } = parseRepo(repository);
  return getFile(client, { owner, repo, path, ref: commitSha });
}

export async function validateToken(client: Octokit): Promise<{ valid: boolean; username?: string }> {
  try {
    const response = await client.rest.users.getAuthenticated();
    return { valid: true, username: response.data.login };
  } catch {
    return { valid: false };
  }
}

export async function listUserRepos(client: Octokit): Promise<string[]> {
  const response = await client.rest.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: 'updated',
  });
  return response.data.map((repo) => repo.full_name);
}
