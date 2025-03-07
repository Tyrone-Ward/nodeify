#!/usr/bin/node

import 'dotenv/config'
import express from 'express'
import info from './package.json' assert { type: 'json' }
import { networkInterfaces } from 'node:os'
import WebSocket, { WebSocketServer } from 'ws'
import cors from 'cors'
import { uuidv7 } from 'uuidv7'
import { nanoid } from 'nanoid'
import { engine } from 'express-handlebars'
import Database from 'better-sqlite3'
import * as argon2 from 'argon2'
import session from 'express-session'
import sqlite3_session_store from 'better-sqlite3-session-store'
import { randomBytes } from 'node:crypto'
import moment from 'moment'
import logger from './src/utils/logger.js'
import morganMiddleware from './src/middlewares/httpLpgger.js'
import { app, expressServer, PORT } from './src/config/index.js'

// Routes
import rootRouter from './src/routes/rootRoutes.js.js'

// TODO: Setup MVC folder structure
// TODO: Tests!
// TODO: Generate a signed cert for https and wss.

const db = new Database('./database/messages.db')
const SqliteStore = sqlite3_session_store(session)

const sql = 'INSERT INTO messages( _id, message, recipient, sender, date, delivered) VALUES (?, ?, ?, ?, ?, ?)'
const clientTokenAddSql = 'INSERT INTO clientTokens(clientToken, name) VALUES (?, ?)'
const clientTokenRemoveSql = 'DELETE FROM clientTokens WHERE clientToken = (?)'
const clientTokenRetrievalSql = 'SELECT * FROM clientTokens WHERE clientToken = (?)'
const allClientTokenRetrievalSql = 'SELECT * FROM clientTokens'
const getAllMessagesSql = 'SELECT * FROM messages ORDER BY date DESC'
const undeliveredMessagesSql = 'SELECT * FROM messages WHERE recipient IS (?) AND delivered IS 0'
const updateDeliveredStatusSql = 'UPDATE messages SET delivered = 1 WHERE _id = (?)'
const createUserSql = 'INSERT INTO users(email, name, password) VALUES (?, ?, ?)'
const queryUserSql = 'SELECT * FROM users WHERE email=(?)'
const clientTokenFromName = 'SELECT name FROM clientTokens WHERE clientToken is (?)'

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
  logger.info('Created messages table.')
} catch (err) {
  if (err.message === 'table messages already exists') {
    logger.warn('Table messages already exists')
  }
}

try {
  db.prepare(
    `CREATE TABLE clientTokens(
      clientToken text primary key not null,
      name TEXT NOT NULL UNIQUE
    )`
  ).run()
  logger.info('Created clientTokens table.')
} catch (err) {
  if (err.message === 'table clientTokens already exists') {
    logger.warn('Table clientTokens already exists')
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
  logger.info('Created users table.')
} catch (err) {
  if (err.message === 'table users already exists') {
    logger.warn('Table users already exists')
  }
}

// const app = express()
// const PORT = process.env.NODE_ENV === 'development' ? 8080 : 80

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
      },
      deliveredStatus: function (messageDeliveredStatus) {
        if (messageDeliveredStatus === 0) {
          return 'Not delivered'
        } else {
          return 'Delivered'
        }
      }
    }
  })
)
app.set('view engine', 'handlebars')
app.set('views', './src/views')

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(cors())

// HTTP logger
app.use(morganMiddleware)

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

const hashPassword = async (password) => {
  try {
    const salt = randomBytes(32)
    return await argon2.hash(password, salt)
  } catch (e) {
    logger.error('Error hashing password with argon2', e)
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
    logger.error('Error argon2 verification', e)
  }
}

const authCheck = (req, res, next) => {
  if (!req.session.isLoggedIn || !req.session.user.user_id) {
    res.status(401)
    res.send('You are not authorized. <a href="/login">Login</a>')
    return
  }
  next()
}
app.use((req, res, next) => {
  // Make `app name` and `version` available in templates
  res.locals.appName = info.name.charAt(0).toUpperCase() + info.name.slice(1)
  res.locals.version = info.version
  next()
})
// Routes
// TODO: Decouple UI from api

app.use('/', rootRouter)

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
    logger.info('no users')
    return res.redirect('/register')
  }
  res.locals.noHeader = true
  res.render('login')
})
app.post('/login', async (req, res) => {
  const { email, password } = req.body
  logger.info(`email: ${email}`)
  const rows = await db.prepare(queryUserSql).get(email)

  if (!rows) {
    res.status(422)
    return res.json({ error: 'user not found' })
    // res.redirect('/login')
  }

  // Implement flash messages

  if (rows) {
    const hashedPassword = rows.password
    const isMatch = await comparePassword(password, hashedPassword)
    if (!isMatch) {
      res.status(422)
      return res.json({ error: 'Please enter correct password.' })
    }
    // Regenerate session when signing in
    // to prevent fixation
    req.session.regenerate(() => {
      req.session.isLoggedIn = true
      req.session.user = { user_id: rows.email }
      res.status(200)
      res.json({ message: 'user authorized' })
      // res.redirect('http://localhost:5173/')
    })
  }

  // we will use this flag to determine if a user is still logged in
})
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login')
  })
})
app.post('/client/add', async (req, res) => {
  const clientTokenData = [nanoid(10), req.body.clientName]
  db.prepare(clientTokenAddSql).run(clientTokenData)
  logger.info('Row inserted.')
  res.redirect('/clients')
})
app.post('/client/remove', (req, res) => {
  const clientTokenData = req.body.clientToken
  db.prepare(clientTokenRemoveSql).run(clientTokenData)
  logger.info('Row removed.')
  res.redirect('/clients')
})
app.post('/register', async (req, res) => {
  // DONE: Add user to users table
  // TODO: Validate input?
  const { name, email, password } = req.body
  const hashedPassword = await hashPassword(password)
  db.prepare(createUserSql).run(email, name, hashedPassword)
  res.redirect('/login')
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
      logger.info(`message: ${req.body.message} sent to ${req.body.recipient}`)
      // Terminate connection after sending message
      await ws.terminate()
    }
    res.send('delivered')
  }
})

app.use(express.static('public'))

// const expressServer = process.env.NODE_ENV === 'production' ? https.createServer(app) : http.createServer(app)
const server = new WebSocketServer({ server: expressServer })

// shut down server "gracefully"
let SHUTDOWN = false

process.on('SIGINT', () => {
  if (!SHUTDOWN) {
    SHUTDOWN = true
    server.close(() => logger.info('Shutting down server.'))
    db.close(() => logger.info('Closing database.'))
    setTimeout(process.exit, 2000, 1)
  }
})

// Store a list of unique clients
const connectedClients = new Set()

server.on('connection', (socket, req) => {
  socket.id = req.url.slice(1)
  const rows = db.prepare(clientTokenRetrievalSql).get(socket.id)
  if (rows === undefined) {
    socket.send(JSON.stringify({ error: 'incorrect credentials' }))
    socket.close()
    return logger.info(`${socket.id} denied. Invalid credentials.`)
  }
  const clientName = db.prepare(clientTokenFromName).get(socket.id)['name']
  console.log(clientName)
  connectedClients.add(clientName)

  // DONE: Create a proper logger

  // DONE: Check to see if there are any queued up messages. If so, send them to the client.
  server.clients.forEach(async (client) => {
    if (db.prepare(clientTokenFromName).get(client.id)['name'] === clientName) {
      const undeliveredMessages = db.prepare(undeliveredMessagesSql).all(clientName)
      // probably not to check for undefined
      if (undeliveredMessages) {
        undeliveredMessages.forEach((m) => {
          socket.send(JSON.stringify({ message: m.message, sender: m.sender, sent: m.date })) //change m.sender to seneder name
          db.prepare(updateDeliveredStatusSql).run(m._id)
        })
      }
    }
  })

  socket.on('message', async (message) => {
    const p = JSON.parse(message)
    const rows = db.prepare(clientTokenRetrievalSql).get(p.clientId)
    if (rows === undefined) {
      return logger.warn('denied')
    }
    if (rows !== undefined) {
      logger.info(`${rows.name} is approved and connected.`)
      const parsedMessage = {}
      parsedMessage._id = uuidv7()
      // parsedMessage.title = p.title
      parsedMessage.message = p.message
      parsedMessage.recipient = p.recipient
      parsedMessage.sender = db.prepare(clientTokenFromName).get(socket.id)['name']
      parsedMessage.date = moment().format()
      parsedMessage.delivered = null
      logger.info(connectedClients)

      // console.log(`message: ${message} from ${socket.id}`)
      if (connectedClients.has(parsedMessage.recipient)) {
        server.clients.forEach(async (client) => {
          if (parsedMessage.recipient === db.prepare(clientTokenFromName).get(client.id)['name']) {
            parsedMessage.delivered = 1
            db.prepare(sql).run(parsedMessage._id, parsedMessage.message, parsedMessage.recipient, parsedMessage.sender, parsedMessage.date, parsedMessage.delivered)
            delete parsedMessage.recipient
            client.send(JSON.stringify(parsedMessage))
          }
        })
      } else {
        logger.info(`${parsedMessage.recipient} is not connected. Saving message.`)
        // Update db with message
        parsedMessage.delivered = 0
        logger.info(parsedMessage)
        db.prepare(sql).run(parsedMessage._id, parsedMessage.message, parsedMessage.recipient, parsedMessage.sender, parsedMessage.date, parsedMessage.delivered)
        logger.info('Row inserted.')
      }
    }
  })

  socket.on('close', () => {
    connectedClients.delete(clientName)
    logger.info(`${socket.id} has been disconnected.`)
  })
})

// TODO: Handle errors better

app.use(function (req, res, next) {
  res.status(404)
  logger.error('Not found')

  res.format({
    html: function () {
      res.locals.noHeader = true
      res.render('404', { url: req.url })
    },
    json: function () {
      res.json({ error: 'Not found' })
    },
    default: function () {
      res.type('txt').send('Not found')
    }
  })
})

app.use(function (err, req, res, next) {
  // we may use properties of the error object
  // here and next(err) appropriately, or if
  // we possibly recovered from the error, simply next().
  res.locals.noHeader = true
  res.status(err.status || 500)
  logger.error(err)
  res.render('500', { error: err })
})

const localIp = Object.values(networkInterfaces())
  .flat()
  .filter((item) => !item.internal && item.family === 'IPv4')
  .find(Boolean).address

expressServer.listen(PORT, () => {
  const appName = info.name.charAt(0).toUpperCase() + info.name.slice(1)
  const ipAddr = process.env.NODE_ENV === 'development' ? 'localhost' : localIp
  logger.info(`${appName} server listening at http://${ipAddr}:${PORT}`)
})
