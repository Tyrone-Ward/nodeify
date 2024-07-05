#!/usr/bin/node

const Database = require('better-sqlite3')
const db = new Database('./database/messages.db')

const decodedClientIdSql = `SELECT * FROM messages WHERE recipient IS (?) AND delivered IS 0`

const getClientName = db.prepare(decodedClientIdSql).get('sp7')
// const getAllUndeliveredMessages = db.prepare(`SELECT * FROM messages WHERE delivered IS 0`).all()

console.log(getClientName)
// console.log(getAllUndeliveredMessages)
