#!/usr/bin/node

import 'dotenv/config'
import express from 'express'
import info from './package.json' assert { type: 'json' }
import { networkInterfaces } from 'node:os'
import fs from 'node:fs'
import { createServer } from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import { uuidv7 } from 'uuidv7'
import c from 'ansi-colors'
import { nanoid } from 'nanoid'
import { engine } from 'express-handlebars'
import prettyBytes from 'pretty-bytes'
import Database from 'better-sqlite3'
import * as argon2 from 'argon2'
import session from 'express-session'
import sqlite3_session_store from 'better-sqlite3-session-store'
import { randomBytes } from 'node:crypto'
import moment from 'moment'
import { uptime } from 'node:process'
// TODO: Setup MVC folder structure
// TODO: Tests!
/*
TODO: Create a signed cert for https and wss.
https://itnext.io/node-express-letsencrypt-generate-a-free-ssl-certificate-and-run-an-https-server-in-5-minutes-a730fbe528ca
*/
// import { createServer } from https

const db = new Database('./database/messages.db')
const SqliteStore = sqlite3_session_store(session)

const sql = 'INSERT INTO messages( _id, message, recipient, sender, date, delivered) VALUES (?, ?, ?, ?, ?, ?)'
const clientTokenAddSql = 'INSERT INTO clientTokens(clientToken, name) VALUES (?, ?)'
const clientTokenRemoveSql = 'DELETE FROM clientTokens WHERE clientToken = (?)'
const clientTokenRetrievalSql = 'SELECT * FROM clientTokens WHERE clientToken = (?)'
const allClientTokenRetrievalSql = 'SELECT * FROM clientTokens'
const getAllMessagesSql = 'SELECT * FROM messages ORDER BY date DESC'
const undeliveredMessagesSql = 'SELECT * FROM messages WHERE recipient IS (?) AND delivered IS 0'
const decodedClientIdSql = 'SELECT name FROM clientTokens WHERE clientToken IS (?)'
const updateDeliveredStatusSql = 'UPDATE messages SET delivered = 1 WHERE _id = (?)'
const createUserSql = 'INSERT INTO users(email, name, password) VALUES (?, ?, ?)'
const queryUserSql = 'SELECT * FROM users WHERE email=(?)'

// Create tables. Silently pass if it already exist
// TODO: Move to first run process in /scripts
// https://stackoverflow.com/questions/11744975/enabling-https-on-express-js#:~:text=17-,Including%20Points%3A,-SSL%20setup

try {
  db.prepare(
    `CREATE TABLE messages(
        _id text primary key not null,
        message text not null,
        recipient text not null,
        sender text not null,
        date text not null,
        delivered int
      )`
  ).run()
  console.log('Created messages table.')
} catch (err) {
  if (err.message === 'table messages already exists') {
    console.log('Table messages already exists')
  }
}

try {
  db.prepare(
    `CREATE TABLE clientTokens(
      clientToken text primary key not null,
      name TEXT NOT NULL UNIQUE
    )`
  ).run()
  console.log('Created clientTokens table.')
} catch (err) {
  if (err.message === 'table clientTokens already exists') {
    console.log('Table clientTokens already exists')
  }
}

try {
  db.prepare(
    `CREATE TABLE users(
      email text primary key not null,
      name text not null,
      password text
    )`
  ).run()
  console.log('Created users table.')
} catch (err) {
  if (err.message === 'table users already exists') {
    console.log('Table users already exists')
  }
}

const app = express()
const PORT = process.env.NODE_ENV === 'development' ? 8080 : 80

app.engine(
  'handlebars',
  engine({
    helpers: {
      // Function to do basic mathematical operation in handlebar
      math: function (lvalue, operator, rvalue) {
        lvalue = parseFloat(lvalue)
        rvalue = parseFloat(rvalue)
        return {
          '+': lvalue + rvalue,
          '-': lvalue - rvalue,
          '*': lvalue * rvalue,
          '/': lvalue / rvalue,
          '%': lvalue % rvalue
        }[operator]
      },
      relativeDate: function (dateTime) {
        return moment(dateTime, 'YYYY-MM-DDTHH:mm:ss').fromNow()
      },
      link: function (text) {
        if (text.slice(0, 4) === 'http') {
          return `<a href="${text}"> ${text}</a>`
        }
        return text
      }
    }
  })
)
app.set('view engine', 'handlebars')
app.set('views', './views')

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

// Sessions!
app.use(
  session({
    store: new SqliteStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: 900000 // 15min
      }
    }),
    // TODO: make session secret an .env var
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    name: 'sessions',
    maxAge: 24 * 60 * 60 * 1000
  })
)

// What even is this? A terrible logger
app.use((req, res, next) => {
  res.on('finish', () => {
    const statusCode =
      res.statusCode >= 200 && res.statusCode <= 400
        ? c.white.bgGreen(res.statusCode.toString().padStart(4, ' ').padEnd(5, ' '))
        : c.white.bgRed(res.statusCode.toString().padStart(4, ' ').padEnd(5, ' '))
    console.log(`${moment().format()} |${statusCode}| ${req.ip.padStart(17, ' ').padEnd(23, ' ')} |${c.white.bgBlue(req.method.padStart(7, ' ').padEnd(11, ' '))}| ${req.originalUrl}`)
  })
  next()
})

const hashPassword = async (password) => {
  try {
    const salt = randomBytes(32)
    return await argon2.hash(password, salt)
  } catch (e) {
    console.log('Error hashing password with argon2', e)
  }
}

const comparePassword = async (password, hashedPassword) => {
  try {
    const correct = await argon2.verify(hashedPassword, password)
    if (correct) {
      return true
    }
    return false
  } catch (e) {
    console.log('Error argon2 verification', e)
  }
}

const authCheck = (req, res, next) => {
  if (!req.session.isLoggedIn || !req.session.user.user_id) {
    res.status(401)
    res.send('You are not authorized. <a href="/login">Login</a>')
    return
    // res.redirect('/login')
  }
  next()
}
app.use((req, res, next) => {
  // Make `app name` and `version` available in templatesS
  res.locals.appName = info.name.charAt(0).toUpperCase() + info.name.slice(1)
  res.locals.version = info.version
  next()
})
// Routes
app.get('/', authCheck, async (req, res) => {
  const rows = db.prepare(getAllMessagesSql).all()
  const clientObject = {}
  const clientList = db.prepare('SELECT * FROM clientTokens').all()
  clientList.forEach((c) => (clientObject[c.clientToken] = { name: c.name }))

  res.render('index', { messageCount: rows.length, messages: rows, listExists: true, userId: req.session.user.user_id, clientObject })
})
app.get('/register', (req, res) => {
  res.render('register')
})
app.get('/clients', authCheck, (req, res) => {
  const rows = db.prepare(allClientTokenRetrievalSql).all()
  res.render('clients', { users: rows, message: 'User has been created!', userId: req.session.user.user_id })
})
app.get('/login', (req, res) => {
  const users = db.prepare('SELECT * FROM users').all()
  if (users.length === 0) {
    console.log('no users')
    return res.redirect('/register')
  }
  res.locals.noHeader = true
  res.render('login')
})
app.post('/login', async (req, res) => {
  const { email, password } = req.body
  const rows = await db.prepare(queryUserSql).get(email)
  console.log('email:', email)

  if (!rows) {
    res.status(422)
    res.json({ error: 'user not found' })
    // res.redirect('/login')
  }

  if (rows) {
    const hashedPassword = rows.password
    const isMatch = await comparePassword(password, hashedPassword)
    if (!isMatch) {
      res.status(422)
      res.json({ error: 'Please enter correct password.' })
    }
    // Regenerate session when signing in
    // to prevent fixation
    req.session.regenerate(() => {
      req.session.isLoggedIn = true
      // we can also store additional user data
      req.session.user = { user_id: rows.email }
      res.redirect('/')
    })
  }

  // we will use this flag to determine if a user is still logged in
})
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login')
  })
})
app.get('/test', (req, res) => {
  res.render('clients')
})
app.post('/client/add', async (req, res) => {
  const clientTokenData = [nanoid(10), req.body.clientName]
  db.prepare(clientTokenAddSql).run(clientTokenData)
  console.log('Row inserted.')
  res.redirect('/clients')
})
app.post('/client/remove', (req, res) => {
  const clientTokenData = req.body.clientToken
  db.prepare(clientTokenRemoveSql).run(clientTokenData)
  console.log('Row removed.')
  res.redirect('/clients')
})
app.post('/register', async (req, res) => {
  // DONE: Add user to users table
  // TODO: Validate input?
  // console.log(`username: ${req.body.name}, password: ${req.body.password}, email: ${req.body.email}`)
  const { name, email, password } = req.body
  const hashedPassword = await hashPassword(password)
  db.prepare(createUserSql).run(email, name, hashedPassword)
  res.redirect('/login')
})
app.get('/health', (req, res) => {
  const dbSize = prettyBytes(fs.statSync('./database/messages.db').size)

  res.status(200)
  res.json({
    database: 'green',
    databaseSize: dbSize,
    health: 'green',
    uptime: `${Math.floor(uptime())} seconds`
  })
})
app.post('/message', async (req, res) => {
  const rows = db.prepare(clientTokenRetrievalSql).get(req.body.clientId)
  if (rows === undefined) {
    res.status(401)
    res.json({
      error: 'Unauthorized',
      errorCode: 401,
      errorDescription: 'you need to provide a valid access token or user credentials to access this api'
    })
  }
  if (rows) {
    const ws = new WebSocket(`ws://localhost:${PORT}/${req.body.clientId}`)
    ws.onopen = async () => {
      // connection opened
      ws.send(JSON.stringify({ message: req.body.message, recipient: req.body.recipient, clientId: req.body.clientId }))
      console.log(`message: ${req.body.message} sent to ${req.body.recipient}`)
      // Terminate connection after sending message
      await ws.terminate()
    }
    res.send('delivered')
  }
})

app.use(express.static('public'))

const expressServer = createServer(app)
const server = new WebSocketServer({ server: expressServer })

// shut down server gracefully
process.on('SIGINT', () => {
  server.close(() => console.log('Shut down server.'))
  db.close(() => console.log('Closed database.'))
  setTimeout(process.exit, 2000, 1)
})

// Store a list of unique clients
const connectedClients = new Set()

server.on('connection', (socket, req) => {
  socket.id = req.url.slice(1)
  connectedClients.add(socket.id)
  // TODO: Create a proper logger
  console.log(`${moment().format()} | ${200} | ${req.socket.remoteAddress.padStart(17, ' ').padEnd(23, ' ')} | ${'GET'.padStart(6, ' ').padEnd(9, ' ')} | ${socket.id}`)

  // DONE: Check to see if there are any queued up messages. If so, send them to the client.
  server.clients.forEach(async (client) => {
    if (client.id === socket.id) {
      const undeliveredMessages = db.prepare(undeliveredMessagesSql).all(socket.id)
      // probably not to check for undefined
      if (undeliveredMessages) {
        undeliveredMessages.forEach((m) => {
          socket.send(JSON.stringify({ message: m.message, recipient: socket.id, clientId: m.sender }))
          db.prepare(updateDeliveredStatusSql).run(m._id)
        })
      }
    }
  })

  socket.on('message', async (message) => {
    const p = JSON.parse(message)
    const rows = db.prepare(clientTokenRetrievalSql).get(p.clientId)
    if (rows === undefined) {
      return console.log('denied')
    }
    if (rows !== undefined) {
      console.log(`${rows.name} is approved and connected.`)
      const parsedMessage = {}
      parsedMessage._id = uuidv7()
      // parsedMessage.title = p.title
      parsedMessage.message = p.message
      parsedMessage.recipient = p.recipient
      parsedMessage.sender = socket.id // db.prepare(decodedClientIdSql).get(socket.id).name || 'unknown'
      parsedMessage.date = moment().format()
      parsedMessage.delivered = null
      console.log(connectedClients)

      // console.log(`message: ${message} from ${socket.id}`)
      if (connectedClients.has(parsedMessage.recipient)) {
        server.clients.forEach(async (client) => {
          if (parsedMessage.recipient === client.id) {
            client.send(JSON.stringify(parsedMessage))
            parsedMessage.delivered = 1
            db.prepare(sql).run(parsedMessage._id, parsedMessage.message, parsedMessage.recipient, parsedMessage.sender, parsedMessage.date, parsedMessage.delivered)
          }
        })
      } else {
        console.log(`${parsedMessage.recipient} is not connected. Saving message.`)
        // Update db with message
        parsedMessage.delivered = 0
        console.log(parsedMessage)
        db.prepare(sql).run(parsedMessage._id, parsedMessage.message, parsedMessage.recipient, parsedMessage.sender, parsedMessage.date, parsedMessage.delivered)
        console.log('Row inserted.')
      }
    }
  })

  socket.on('close', () => {
    connectedClients.delete(socket.id)
    console.log(`${socket.id} has been disconnected.`)
  })
})

const localIp = Object.values(networkInterfaces())
  .flat()
  .filter((item) => !item.internal && item.family === 'IPv4')
  .find(Boolean).address

expressServer.listen(PORT, () => {
  const appName = info.name.charAt(0).toUpperCase() + info.name.slice(1)
  const ipAddr = process.env.NODE_ENV === 'development' ? 'localhost' : localIp
  console.log(`${appName} server listening at http://${ipAddr}:${PORT}`)
})
