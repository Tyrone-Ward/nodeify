import 'dotenv/config'
import { readFileSync } from 'node:fs'
import express from 'express'
import http from 'node:http'
import https from 'https'

const keyDir = `/etc/letsencrypt/live/${process.env.siteURL}`
const dbName = process.env.Database_Name

if (process.env.NODE_ENV === 'production') {
  const credentials = {
    key: readFileSync(`${keyDir}/privkey.pem`, 'utf8'),
    cert: readFileSync(`${keyDir}/cert.pem`, 'utf8'),
    ca: readFileSync(`${keyDir}/tyroneward.dev/chain.pem`, 'utf8')
  }
}

const app = express()

const expressServer = process.env.NODE_ENV === 'production' ? https.createServer(credentials, app) : http.createServer(app)
const PORT = process.env.NODE_ENV === 'development' ? 8080 : 80

export { app, expressServer, PORT }
