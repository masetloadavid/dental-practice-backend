// =============================================================================
// auth.js — Love2Smile Dental Suites Authentication
// =============================================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const router = express.Router();

// JWT secret
// IMPORTANT: Set JWT_SECRET in Railway environment variables before production.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set. Login will not work until it is configured.');
}

// =============================================================================
// LOGIN
// POST /api/auth/login
// =============================================================================

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required.'
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        full_name,
        username,
        password_hash,
        role,
        branch,
        is_active
      FROM users
      WHERE username = $1
      LIMIT 1
      `,
      [username.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
    }

    const user = result.rows[0];

    // Prevent inactive accounts from logging in.
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'This account has been deactivated. Please contact the Manager.'
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        error: 'Authentication is not configured on the server.'
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        branch: user.branch
      },
      JWT_SECRET,
      {
        expiresIn: '8h'
      }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        role: user.role,
        branch: user.branch
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
});

module.exports = router;