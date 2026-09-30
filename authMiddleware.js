// authMiddleware.js — Love2Smile Dental Suites Authentication Middleware

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not configured.');
}

// Verify that the user has a valid login token
function authenticateToken(req, res, next) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        error: 'Authentication is not configured on the server.'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();

  } catch (error) {
    console.error('Authentication error:', error.message);

    return res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token.'
    });
  }
}


// Allow only Manager accounts
function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }

  if (req.user.role !== 'MANAGER') {
    return res.status(403).json({
      success: false,
      error: 'Manager access required.'
    });
  }

  next();
}


// Allow Manager or Receptionist accounts
function requireStaff(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }

  if (
    req.user.role !== 'MANAGER' &&
    req.user.role !== 'RECEPTIONIST'
  ) {
    return res.status(403).json({
      success: false,
      error: 'Staff access required.'
    });
  }

  next();
}


module.exports = {
  authenticateToken,
  requireManager,
  requireStaff
};