import Database from 'better-sqlite3'
import prettyBytes from 'pretty-bytes'
import { statSync } from 'node:fs'
import { uptime } from 'node:process'

const db = new Database('./database/messages.db')

const getAllMessagesSql = 'SELECT * FROM messages ORDER BY date DESC'
const allClientTokenRetrievalSql = 'SELECT * FROM clientTokens'

const root = (req, res) => {
  // res.render('index', { username: 'gameplace123' })
  const rows = db.prepare(getAllMessagesSql).all()
  const clientObject = {}
  const clientList = db.prepare(allClientTokenRetrievalSql).all()
  clientList.forEach((c) => (clientObject[c.clientToken] = { name: c.name }))

  res.render('index', { messageCount: rows.length, messages: rows, listExists: true, userId: req.session.user.user_id, clientObject })
}

const test = (req, res) => {
  res.send('hello')
}

const health = (req, res) => {
  const dbSize = prettyBytes(statSync('./database/messages.db').size)

  res.status(200)
  res.json({
    database: 'green',
    databaseSize: dbSize,
    health: 'green',
    uptime: `${Math.floor(uptime())} seconds`
  })
}

export { root, test, health }
