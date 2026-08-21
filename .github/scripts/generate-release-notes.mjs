import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import process from 'node:process'

const semverPattern = /^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*)?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i
const conventionalCommitPattern = /^([a-z][\w-]*)(?:\([^)]+\))?(!)?: /i

const [tag, outputPath] = process.argv.slice(2)
if (!tag || !outputPath)
  throw new Error('Usage: generate-release-notes.mjs <tag> <output-path>')
if (!semverPattern.test(tag))
  throw new Error(`Release tag is not valid SemVer: ${tag}`)

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
if (!repository || !token)
  throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required')

const [owner, repo, ...unexpected] = repository.split('/')
if (!owner || !repo || unexpected.length > 0)
  throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`)

const tags = execFileSync(
  'git',
  ['tag', '--merged', tag, '--sort=-version:refname'],
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean)
const previousTag = tags.find(candidate => candidate !== tag && semverPattern.test(candidate))

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'memorilo-release-notes',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok)
    throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`)
  return response.json()
}

async function listCommits() {
  const commits = []
  for (let page = 1; ; page += 1) {
    const path = previousTag
      ? `/repos/${owner}/${repo}/compare/${encodeURIComponent(previousTag)}...${encodeURIComponent(tag)}?per_page=100&page=${page}`
      : `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(tag)}&per_page=100&page=${page}`
    const result = await github(path)
    const pageCommits = previousTag ? result.commits : result
    if (!Array.isArray(pageCommits))
      throw new TypeError(`GitHub returned an invalid commit list for page ${page}`)
    commits.push(...pageCommits)
    if (pageCommits.length < 100)
      return commits
  }
}

const sections = [
  ['Breaking changes', commit => commit.breaking],
  ['Features', commit => commit.type === 'feat' && !commit.breaking],
  ['Bug fixes', commit => ['fix', 'perf'].includes(commit.type) && !commit.breaking],
  ['Documentation', commit => commit.type === 'docs' && !commit.breaking],
  ['Build process updates', commit => ['build', 'ci'].includes(commit.type) && !commit.breaking],
  ['Other work', commit => !['feat', 'fix', 'perf', 'docs', 'build', 'ci'].includes(commit.type) && !commit.breaking],
]

const commits = (await listCommits()).map((commit) => {
  const subject = commit.commit?.message?.split('\n', 1)[0]
  if (!subject || !commit.sha)
    throw new TypeError('GitHub returned a commit without a subject or SHA')
  const conventional = subject.match(conventionalCommitPattern)
  const author = commit.author?.login
    ? `@${commit.author.login}`
    : commit.commit.author?.name
  return {
    author,
    breaking: conventional?.[2] === '!' || commit.commit.message.includes('BREAKING CHANGE:'),
    sha: commit.sha,
    subject,
    type: conventional?.[1]?.toLowerCase(),
  }
})

const lines = ['## Changelog']
for (const [heading, matches] of sections) {
  const matchingCommits = commits.filter(matches)
  if (matchingCommits.length === 0)
    continue
  lines.push(`### ${heading}`)
  for (const commit of matchingCommits) {
    const attribution = commit.author ? ` (${commit.author})` : ''
    lines.push(`* ${commit.sha}: ${commit.subject}${attribution}`)
  }
}

const baseUrl = `https://github.com/${repository}`
const changelogUrl = previousTag
  ? `${baseUrl}/compare/${encodeURIComponent(previousTag)}...${encodeURIComponent(tag)}`
  : `${baseUrl}/commits/${encodeURIComponent(tag)}`
lines.push('', `**Full Changelog**: ${changelogUrl}`)
lines.push(
  '',
  '## Downloads',
  '',
  '* macOS: download the `.dmg` installer or `.zip` archive.',
  '* Linux: download the `.AppImage`, `.deb`, or `.rpm` package.',
  '* Windows: download the `.exe` installer.',
  '* Verify downloads with `SHA256SUMS.txt`.',
  '',
  '## Where to go next?',
  '',
  `* Report problems in [GitHub Issues](${baseUrl}/issues).`,
  `* Contribute through [pull requests](${baseUrl}/pulls).`,
  '',
)

writeFileSync(outputPath, lines.join('\n'))
