import path from 'path'

interface ISyncFileSystem {
  readdirSync: (dir: string) => string[]
  statSync: (path: string) => { isDirectory: () => boolean }
  readFileSync: (file: string, encoding: 'utf-8') => string
  writeFileSync: (file: string, content: string) => void
  existsSync: (file: string) => boolean
  unlinkSync: (file: string) => void
}

type AttributionType = 'COPY' | 'ADAPTATION'
type AttributionsByType = Record<AttributionType, Map<string, string>>

function getFolderArg(argv: string[]) {
  const flagIndex = argv.indexOf('--folder')
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1]!
  }
  const inlineFlag = argv.find((arg) => arg.startsWith('--folder='))
  return inlineFlag ? inlineFlag.split('=')[1]! : 'dist'
}

const ATTRIBUTION_REGEX = /ATTRIBUTION:\s*(COPY|ADAPTATION)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/

const ATTRIBUTION_SECTION_TITLES: Record<AttributionType, string> = {
  COPY: 'Code copied verbatim from the following third-party sources',
  ADAPTATION: 'Code adapted from the following third-party sources',
}

// `fs` is injected rather than imported directly, so this can run against either the real
// filesystem (CLI usage) or an in-memory one (tests) - mirrors the ISyncFileSystem sync-cast
// pattern used by WebcomponentStyleLoader.ts/HtmlInlineSourcePlugin.ts for the same reason.
function walk(fs: ISyncFileSystem, dir: string, files: string[] = []) {
  fs.readdirSync(dir).forEach((name) => {
    const fullPath = path.join(dir, name)
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fs, fullPath, files)
    } else if (name.endsWith('.ts')) {
      files.push(fullPath)
    }
  })
  return files
}

function collectAttributions(fs: ISyncFileSystem, files: string[]): AttributionsByType {
  const byType: AttributionsByType = { COPY: new Map(), ADAPTATION: new Map() }
  files.forEach((file) => {
    fs.readFileSync(file, 'utf-8')
      .split('\n')
      .forEach((line) => {
        const match = line.match(ATTRIBUTION_REGEX)
        if (match) {
          const [, attributionType, packageName, copyrightString] = match as [string, AttributionType, string, string]
          byType[attributionType].set(packageName.trim(), copyrightString.trim())
        }
      })
  })
  return byType
}

function renderNotice(byType: AttributionsByType) {
  const sections = (Object.keys(ATTRIBUTION_SECTION_TITLES) as AttributionType[])
    .filter((attributionType) => byType[attributionType].size > 0)
    .map((attributionType) => {
      const items = Array.from(byType[attributionType].keys())
        .sort()
        .map((packageName) => `- **${packageName}** — ${byType[attributionType].get(packageName)}`)
        .join('\n')
      return `## ${ATTRIBUTION_SECTION_TITLES[attributionType]}\n\n${items}`
    })

  return `# Third-Party Notices\n\n${sections.join('\n\n')}\n`
}

function generateNotice({ fs, srcDir, outputFile }: { fs: ISyncFileSystem; srcDir: string; outputFile: string }) {
  const byType = collectAttributions(fs, walk(fs, srcDir))
  const hasAttributions = Object.keys(byType).some((attributionType) => byType[attributionType as AttributionType].size > 0)

  if (hasAttributions) {
    fs.writeFileSync(outputFile, renderNotice(byType))
  } else if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile)
  }

  return hasAttributions
}

export { generateNotice, walk, collectAttributions, renderNotice, getFolderArg }
