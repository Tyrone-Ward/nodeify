import { app, db } from './server'

app.get('/login', (req, res) => {
  const users = db.prepare('SELECT * FROM users').all()
  if (users.length === 0) {
    console.log('no users')
    return res.redirect('/register')
  }
  res.render('login')
})
