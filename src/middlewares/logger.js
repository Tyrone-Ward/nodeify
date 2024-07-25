import 'dotenv/config'
import morgan from 'morgan'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'

// const logger = () => (process.env.NODE_ENV === 'development' ? morgan('dev') : morgan('common', { stream: accessLogStream }))

const logger = () => {
  if (process.env.NODE_ENV === 'development') {
    return morgan('dev')
  } else {
    try {
      if (!existsSync('/src/logs')) {
        mkdirSync('/src/logs')
      }
    } catch {
      console.log('folder already exists')
    } finally {
      const accessLogStream = createWriteStream('access.log', { flags: 'a' })
    }
    return morgan('common', { stream: accessLogStream })
  }
}

export default logger
