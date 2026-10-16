import MemoryFS from 'memory-fs'

import { generateNotice } from '../scripts/generate-notice'

describe('generateNotice', () => {
  test('groups attributions by type, includes package names, and dedupes repeated packages', () => {
    const fs = new MemoryFS()
    fs.mkdirpSync('/src')
    fs.mkdirpSync('/dist')
    fs.writeFileSync(
      '/src/a.ts',
      [
        '// ATTRIBUTION: COPY | fake-copied-pkg | Copyright (c) Fake Author. MIT Licensed.',
        'const a = 1',
        '// ATTRIBUTION: ADAPTATION | fake-adapted-pkg | Copyright (c) Another Author. MIT Licensed.',
        'const b = 2',
      ].join('\n'),
    )
    fs.writeFileSync(
      '/src/b.ts',
      // same package referenced again, from a different file - should not produce a duplicate entry
      '// ATTRIBUTION: COPY | fake-copied-pkg | Copyright (c) Fake Author. MIT Licensed.\nconst c = 3',
    )

    generateNotice({ fs, srcDir: '/src', outputFile: '/dist/NOTICE.md' })

    const notice = fs.readFileSync('/dist/NOTICE.md', 'utf-8')
    expect(notice).toContain('## Code copied verbatim from the following third-party sources')
    expect(notice).toContain('- **fake-copied-pkg** — Copyright (c) Fake Author. MIT Licensed.')
    expect(notice).toContain('## Code adapted from the following third-party sources')
    expect(notice).toContain('- **fake-adapted-pkg** — Copyright (c) Another Author. MIT Licensed.')
    expect(notice.match(/fake-copied-pkg/g)).toHaveLength(1)
  })

  test('does not create a NOTICE.md when no attributions are found', () => {
    const fs = new MemoryFS()
    fs.mkdirpSync('/src')
    fs.mkdirpSync('/dist')
    fs.writeFileSync('/src/a.ts', 'const a = 1')

    generateNotice({ fs, srcDir: '/src', outputFile: '/dist/NOTICE.md' })

    expect(fs.existsSync('/dist/NOTICE.md')).toEqual(false)
  })

  test('removes a stale NOTICE.md if attributions are removed from the source on a subsequent run', () => {
    const fs = new MemoryFS()
    fs.mkdirpSync('/src')
    fs.mkdirpSync('/dist')
    fs.writeFileSync('/src/a.ts', '// ATTRIBUTION: COPY | fake-pkg | Copyright (c) Fake Author. MIT Licensed.\nconst a = 1')
    generateNotice({ fs, srcDir: '/src', outputFile: '/dist/NOTICE.md' })
    expect(fs.existsSync('/dist/NOTICE.md')).toEqual(true)

    fs.writeFileSync('/src/a.ts', 'const a = 1')
    generateNotice({ fs, srcDir: '/src', outputFile: '/dist/NOTICE.md' })

    expect(fs.existsSync('/dist/NOTICE.md')).toEqual(false)
  })

  test('walks nested source directories', () => {
    const fs = new MemoryFS()
    fs.mkdirpSync('/src/nested')
    fs.mkdirpSync('/dist')
    fs.writeFileSync(
      '/src/nested/deep.ts',
      '// ATTRIBUTION: ADAPTATION | fake-nested-pkg | Copyright (c) Nested Author. MIT Licensed.\nconst a = 1',
    )

    generateNotice({ fs, srcDir: '/src', outputFile: '/dist/NOTICE.md' })

    const notice = fs.readFileSync('/dist/NOTICE.md', 'utf-8')
    expect(notice).toContain('- **fake-nested-pkg** — Copyright (c) Nested Author. MIT Licensed.')
  })
})
