const authMiddleware = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    req.user = { username: req.session.username };
    return next();
  }
  
  return res.status(401).json({ message: 'Not authenticated' });
};
  
module.exports = { authMiddleware };
