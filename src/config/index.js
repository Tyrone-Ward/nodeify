import 'dotenv/config'
import { readFileSync } from 'node:fs'

const privateKey = () => {
  if (process.env.NODE_ENV === 'development') {
    return readFileSync('privkey.pem', 'utf8')
  }
}
const certificate = () => {
  if (process.env.NODE_ENV === 'production') {
    return readFileSync('cert.pem', 'utf8')
  }
}
const ca = () => {
  if (process.env.NODE_ENV === 'production') {
    return readFileSync('chain.pem', 'utf8')
  }
}

export { privateKey, certificate, ca }
