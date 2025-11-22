import { type Compiler, type Configuration, webpack } from 'webpack'
import MemoryFS from 'memory-fs'

export const proxyFilesystem = (originalFilesystem: Compiler['inputFileSystem']) => {
  // Inspired by: https://stackoverflow.com/questions/38779924/compiling-webpack-in-memory-but-resolving-to-node-modules-on-disk
  const memFs = new MemoryFS()
  const statOrig = memFs.stat.bind(memFs)
  const readFileOrig = memFs.readFile.bind(memFs)
  memFs.stat = (filePath, cb) => {
    statOrig(filePath, (err: Error, result: any) => {
      if (err) {
        return originalFilesystem.stat(filePath, cb)
      }
      return cb(err, result)
    })
  }
  memFs.readFile = (filePath, cb) => {
    readFileOrig(filePath, (err: Error, result: any) => {
      if (err) {
        return originalFilesystem.readFile(filePath, cb)
      }
      return cb(err, result)
    })
  }

  return memFs
}

export const patchCompilerFileSystem = (originalCompiler: Compiler, allowProxy = true) => {
  const transformedCompiler = originalCompiler as unknown as Omit<Compiler, 'inputFileSystem' | 'outputFileSystem'> & {
    inputFileSystem: MemoryFS
    outputFileSystem: MemoryFS
  }
  transformedCompiler.inputFileSystem = allowProxy ? proxyFilesystem(originalCompiler.inputFileSystem) : new MemoryFS()
  transformedCompiler.outputFileSystem = new MemoryFS()

  return transformedCompiler
}

export const getInMemoryCompiler = (webpackConfig: Configuration, allowProxy = true) => {
  return patchCompilerFileSystem(webpack(webpackConfig), allowProxy)
}
