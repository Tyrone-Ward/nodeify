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

export { hashPassword, comparePassword, authCheck }
