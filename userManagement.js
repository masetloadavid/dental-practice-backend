// ============================================================
// userManagement.js
// Love2Smile Dental Suites - User Management
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const router = express.Router();

// Authentication middleware
const {
  authenticateToken,
  requireManager
} = require('./authMiddleware');


// ============================================================
// GET /api/users
// Manager can view all staff accounts
// ============================================================

router.get(
  '/',
  authenticateToken,
  requireManager,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          id,
          full_name,
          username,
          role,
          branch,
          is_active,
          created_at,
          updated_at
        FROM users
        ORDER BY id ASC
      `);

      res.json({
        success: true,
        users: result.rows
      });

    } catch (error) {
      console.error('GET /api/users error:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to fetch users.'
      });
    }
  }
);

// ============================================================
// POST /api/users
// Manager can create receptionist accounts
// ============================================================

router.post(
  '/',
  authenticateToken,
  requireManager,
  async (req, res) => {
    try {
      const {
        full_name,
        username,
        password,
        branch
      } = req.body;

      // Validate required fields
      if (!full_name || !username || !password || !branch) {
        return res.status(400).json({
          success: false,
          error: 'Full name, username, password and branch are required.'
        });
      }

      // Validate branch
      const validBranches = [
        'Love2Smile With Braces',
        'Love2Smile at Reitz',
        'Love2Smile Cullinan'
      ];

      if (!validBranches.includes(branch)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid surgery selected.'
        });
      }

      // Receptionist password must be at least 8 characters
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters long.'
        });
      }

      // Check whether username already exists
      const existing = await pool.query(
        'SELECT id FROM users WHERE username = $1 LIMIT 1',
        [username]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'That username already exists.'
        });
      }

      // Securely hash the password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create receptionist account
      const result = await pool.query(
        `
        INSERT INTO users
          (full_name, username, password_hash, role, branch, is_active)
        VALUES
          ($1, $2, $3, 'RECEPTIONIST', $4, true)
        RETURNING
          id,
          full_name,
          username,
          role,
          branch,
          is_active,
          created_at
        `,
        [
          full_name.trim(),
          username.trim(),
          passwordHash,
          branch
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Receptionist account created successfully.',
        user: result.rows[0]
      });

    } catch (error) {
      console.error('POST /api/users error:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to create receptionist account.'
      });
    }
  }
);

// Activate or deactivate a receptionist account
router.patch(
'/:id/status',
authenticateToken,
requireManager,
async (req, res) => {
try {
const userId = Number(req.params.id);
const { is_active } = req.body;

if (!Number.isInteger(userId) || userId <= 0) {
return res.status(400).json({
success: false,
error: 'Invalid user ID.'
});
}

if (typeof is_active !== 'boolean') {
return res.status(400).json({
success: false,
error: 'is_active must be true or false.'
});
}

// Prevent the manager from deactivating their own account
if (
!is_active &&
Number(req.user.userId) === userId
) {
return res.status(400).json({
success: false,
error: 'You cannot deactivate your own account.'
});
}

const result = await pool.query(
`UPDATE users
SET is_active = $1, updated_at = NOW()
WHERE id = $2 AND role = 'RECEPTIONIST'
RETURNING id, full_name, username, role, branch, is_active`,
[is_active, userId]
);

if (result.rows.length === 0) {
return res.status(404).json({
success: false,
error: 'Receptionist account not found.'
});
}

return res.json({
success: true,
message: is_active
? 'Receptionist account activated successfully.'
: 'Receptionist account deactivated successfully.',
user: result.rows[0]
});
} catch (error) {
console.error('PATCH /api/users/:id/status error:', error);

return res.status(500).json({
success: false,
error: 'Failed to update account status.'
});
}
}
);

module.exports = router;