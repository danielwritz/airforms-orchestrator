import { promises as fs } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

const ignoredDirs = new Set(['.git', '.githooks', 'node_modules', 'dist', 'coverage', '.vite'])
const allowedExtensions = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.txt', '.yml', '.yaml', '.env', '.sh', '.ps1'
])

const placeholderTokens = ['your_key_here', 'your-api-key', 'example_key', 'changeme', 'replace_me']

const rules = [
  { name: 'OpenAI key', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'GitHub token', regex: /ghp_[A-Za-z0-9]{30,}/g },
  { name: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Google API key', regex: /AIza[A-Za-z0-9_-]{20,}/g },
  { name: 'Slack token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Hardcoded API key assignment', regex: /\b(?:OPENAI_API_KEY|API_KEY|SECRET|TOKEN)\b\s*[:=]\s*["'][^"'\n]{12,}["']/gi }
]

function isLikelyTextFile(filePath) {
  return allowedExtensions.has(path.extname(filePath).toLowerCase())
}

function shouldIgnore(fullPath) {
  const relative = path.relative(repoRoot, fullPath)
  const parts = relative.split(path.sep)
  return parts.some((part) => ignoredDirs.has(part))
}

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (shouldIgnore(fullPath)) {
      continue
    }

    if (entry.isDirectory()) {
      await walk(fullPath, out)
      continue
    }

    if (entry.isFile() && isLikelyTextFile(fullPath)) {
      out.push(fullPath)
    }
  }
  return out
}

function hasPlaceholder(value) {
  const lower = value.toLowerCase()
  return placeholderTokens.some((token) => lower.includes(token))
}

function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

async function main() {
  const files = await walk(repoRoot)
  const findings = []

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8')

    for (const rule of rules) {
      rule.regex.lastIndex = 0
      let match = rule.regex.exec(content)
      while (match) {
        const matched = match[0]
        if (!hasPlaceholder(matched)) {
          findings.push({
            file: path.relative(repoRoot, file),
            line: getLineNumber(content, match.index),
            rule: rule.name,
            value: matched.slice(0, 12) + '…'
          })
        }
        match = rule.regex.exec(content)
      }
    }
  }

  if (findings.length > 0) {
    console.error('Potential secrets detected:')
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.value}`)
    }
    process.exit(1)
  }

  console.log('Secret scan passed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
