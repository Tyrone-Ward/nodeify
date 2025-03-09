import Database from 'better-sqlite3'
import prettyBytes from 'pretty-bytes'
import { statSync } from 'node:fs'
import { uptime } from 'node:process'
import { getAuth } from '@clerk/express'

const db = new Database('./database/messages.db')

const test = (req, res) => {
  const auth = getAuth(req)
  console.log('Auth: ', auth)
  res.send('hello')
}
const health = (req, res) => {
  const dbSize = prettyBytes(statSync('./database/messages.db').size)
  const dbHealth = db.pragma('integrity_check')[0].integrity_check

  res.status(200)
  res.json({
    databaseHealth: dbHealth,
    databaseSize: dbSize,
    uptime: `${Math.floor(uptime())} seconds`
  })
}

export { test, health }
