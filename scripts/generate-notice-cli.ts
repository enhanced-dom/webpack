import fs from 'fs'
import path from 'path'

import { generateNotice, getFolderArg } from './generate-notice'

const srcDir = path.join(process.cwd(), 'src')
const outputFile = path.join(process.cwd(), getFolderArg(process.argv), 'NOTICE.md')
const wrote = generateNotice({ fs, srcDir, outputFile })
if (wrote) {
  console.log(`generated ${path.relative(process.cwd(), outputFile)}`)
}
