#!/usr/bin/node

const { Command } = require('commander')
const program = new Command()

program.requiredOption('-r, --recipient <name>', 'recipient id')
program.requiredOption('-m, --message <message>', 'message to send')

program.parse(process.argv)

const options = program.opts()
if (options.recipient) {
  console.log(`recipient is ${options.recipient}`)
}
if (options.message) {
  console.log(`message: ${options.message}`)
}
