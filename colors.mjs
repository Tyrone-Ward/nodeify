import c from 'ansi-colors'
import { networkInterfaces } from 'node:os'

console.log(c.red('This is a red string!'))
console.log(c.green('This is a red string!'))
console.log(c.white.bgRed('This is a white string wtth a red background!'))
console.log(c.yellow('This is a yellow string!'))

const localIp = Object.values(networkInterfaces())
  .flat()
  .filter((item) => !item.internal && item.family === 'IPv4')
  .find(Boolean).address

console.log(localIp)
