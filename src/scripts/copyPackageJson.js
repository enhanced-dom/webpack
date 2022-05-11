#!/usr/bin/env node

const path = require('path')
const fs = require('fs')
const yargs = require('yargs')
const args = yargs(process.argv).usage("$0 <folder>").positional('folder', { describe: 'destination folder for package.json copy', type: 'string' }).default('folder', 'dist').argv
const packageJSONContents = require(path.join(process.cwd(), 'package.json'))
delete packageJSONContents.scripts
fs.writeFileSync(path.join(process.cwd(), args.folder, 'package.json'), JSON.stringify(packageJSONContents, null, 2))