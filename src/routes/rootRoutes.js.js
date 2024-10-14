import { Router } from 'express'
import { authCheck } from '../middlewares/auth.js'
import { root, test, health } from '../controllers/rootController.js'

const rootRouter = Router()

rootRouter.get('/', authCheck, root)
rootRouter.get('/test', test)
rootRouter.get('/health', health)

export default rootRouter
