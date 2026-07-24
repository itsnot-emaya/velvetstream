import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
const { Pool } = pg;
const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
if (!email || password.length < 12) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars).');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'disable' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
try {
  const hash = await bcrypt.hash(password, 12);
  await pool.query(`insert into users(email,password_hash,role) values($1,$2,'admin')
    on conflict(email) do update set password_hash=excluded.password_hash, role='admin'`, [email, hash]);
  console.log(`Admin ready: ${email}`);
} finally { await pool.end(); }
