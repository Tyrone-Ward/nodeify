#!/usr/bin/node

const { spawn } = require('child_process')
const WebSocket = require('ws')
const { Command } = require('commander')
const program = new Command()
const axios = require('axios')

axios.defaults.baseURL = 'http://localhost:8080'
// TODO: get URL from .env

program.option('-l, --listen', 'listen for command')
program.option('-s, --send <message>', 'message to send')
program.option('-r, --recipient <name>', 'recipient id')
program.parse(process.argv)

const options = program.opts()

const clientId = 'sp7'

const startWebsocket = () => {
  let socket = new WebSocket(`ws://localhost:8080/${clientId}`)

  socket.onopen = () => {
    // connection opened
    console.log('connected to server.')
  }

  // Listen for messages
  socket.onmessage = ({ data }) => {
    parsedData = JSON.parse(data)
    if (parsedData.message.slice(0, 4).toLowerCase() === 'http') {
      spawn('xdg-open', [parsedData.message])
    }
    // console.log(`Message from ${parsedData.sender}: ${parsedData.message}`)
    console.log(parsedData)
  }

  socket.onerror = () => {
    console.log('error')
  }

  socket.onclose = () => {
    console.log('socket connection terminated. Attemptting reconnect in 5 seconds')
    socket = null
    setTimeout(startWebsocket, 5000)
  }
}

if (options.listen) {
  startWebsocket()
}

if (options.send) {
  console.log(`message: ${options.send}`)
  axios
    .post('/message', {
      message: options.send,
      recipient: 'surface-pro-7', // recipient: options.recipient,
      clientId: 'uMfKHLagXh'
    })
    .then((response) => {
      console.log(response.data)
    })
}
