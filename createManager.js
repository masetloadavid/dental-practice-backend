// =============================================================================
// createManager.js — Create the first Love2Smile Manager account
// =============================================================================

require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);

    const stdin = process.stdin;
    let password = '';

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    function onData(char) {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u0003') {
        // Ctrl+C
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        process.exit(1);
      } else if (char === '\b' || char === '\x7f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += char;
        process.stdout.write('*');
      }
    }

    stdin.on('data', onData);
  });
}

async function createManager() {
  try {
    console.log('');
    console.log('==========================================');
    console.log(' Love2Smile Manager Account Setup');
    console.log('==========================================');
    console.log('');

    const fullName = await ask('Manager full name: ');
    const username = await ask('Manager username: ');

    if (!fullName || !username) {
      throw new Error('Full name and username are required.');
    }

    const password = await askPassword('Manager password: ');
    const confirmPassword = await askPassword('Confirm password: ');

    if (!password) {
      throw new Error('Password cannot be empty.');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    // Check whether this username already exists.
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1 LIMIT 1',
      [username]
    );

    if (existing.rows.length > 0) {
      throw new Error('That username already exists.');
    }

    // Generate a secure bcrypt password hash.
    const passwordHash = await bcrypt.hash(password, 12);

    // Managers have access to all surgeries, so branch is NULL.
    const result = await pool.query(
      `
      INSERT INTO users
        (full_name, username, password_hash, role, branch, is_active)
      VALUES
        ($1, $2, $3, 'MANAGER', NULL, true)
      RETURNING id, full_name, username, role, branch, is_active
      `,
      [fullName, username, passwordHash]
    );

    console.log('');
    console.log('==========================================');
    console.log(' Manager account created successfully!');
    console.log('==========================================');
    console.log('');
    console.log(result.rows[0]);
    console.log('');
    console.log('The password was stored only as a secure bcrypt hash.');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Could not create Manager account:');
    console.error(error.message);
    console.error('');
  } finally {
    rl.close();
    await pool.end();
  }
}

createManager();