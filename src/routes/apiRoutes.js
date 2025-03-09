import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { test, health } from '../controllers/apiController.js'

const apiRouter = Router()

apiRouter.get('/', requireAuth(), test)
apiRouter.get('/test', test)
apiRouter.get('/health', health)

export default apiRouter
