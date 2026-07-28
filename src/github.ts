/**
 * GitHub REST API fetcher.
 * Uses the zip archive endpoint to fetch all files in one request.
 * No auth token required for public repos.
 */
import AdmZip from 'adm-zip'
import type { FileContent } from './chunker.js'
import { countTokensLocal } from './tokens.js'

export interface RepoMeta {
  owner: string
  repo: string
  defaultBranch: string
  latestCommitSha: string
  latestCommitDate: string
}

export interface StructuredRepoData {
  meta: RepoMeta
  files: FileContent[]
}

function parseRepoUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!match) throw new Error(`Cannot parse GitHub URL: ${url}`)
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${url}`)
  return res.json()
}

export async function fetchRepoMeta(repoUrl: string): Promise<RepoMeta> {
  const { owner, repo } = parseRepoUrl(repoUrl)

  const repoData = (await fetchJson(`https://api.github.com/repos/${owner}/${repo}`)) as {
    default_branch: string
  }
  const branch = repoData.default_branch

  const commits = (await fetchJson(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`
  )) as Array<{ sha: string; commit: { committer: { date: string } } }>

  return {
    owner,
    repo,
    defaultBranch: branch,
    latestCommitSha: commits[0].sha,
    latestCommitDate: commits[0].commit.committer.date,
  }
}

export async function fetchRepoData(
  repoUrl: string,
  filterFn: (path: string) => boolean
): Promise<StructuredRepoData> {
  const { owner, repo } = parseRepoUrl(repoUrl)
  const meta = await fetchRepoMeta(repoUrl)

  const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${meta.defaultBranch}`
  const res = await fetch(zipUrl)
  if (!res.ok) throw new Error(`Failed to download repo zip: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()

  const files: FileContent[] = []
  const prefix = `${repo}-${meta.defaultBranch}/`

  for (const entry of entries) {
    if (entry.isDirectory) continue
    // Strip the root folder prefix GitHub adds
    const entryName = entry.entryName
    const path = entryName.startsWith(prefix) ? entryName.slice(prefix.length) : entryName
    if (!path || !filterFn(path)) continue

    const content = entry.getData().toString('utf8')
    files.push({
      path,
      content,
      tokens: countTokensLocal(content),
      is_changed: false,
    })
  }

  return { meta, files }
}

export async function fetchSingleFile(
  repoUrl: string,
  filePath: string
): Promise<FileContent> {
  const { owner, repo } = parseRepoUrl(repoUrl)
  const meta = await fetchRepoMeta(repoUrl)

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${meta.defaultBranch}`
  const data = (await fetchJson(apiUrl)) as { content?: string; encoding?: string }

  if (!data.content || data.encoding !== 'base64') {
    throw new Error(`Unexpected response format for ${filePath}`)
  }

  const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
  return {
    path: filePath,
    content,
    tokens: countTokensLocal(content),
    is_changed: false,
  }
}

export async function checkForUpdates(
  repoUrl: string,
  lastIndexed: string
): Promise<{ stale: boolean; commitsBehind: number }> {
  const { owner, repo } = parseRepoUrl(repoUrl)

  const commits = (await fetchJson(
    `https://api.github.com/repos/${owner}/${repo}/commits?since=${lastIndexed}&per_page=100`
  )) as Array<{ sha: string }>

  const count = commits.length
  return { stale: count > 0, commitsBehind: count }
}
