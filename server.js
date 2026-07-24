import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || '';
const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_BYTES || 536870912);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4','video/webm','video/quicktime']);

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const storageConfigured = Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_BUCKET);
const s3 = storageConfigured ? new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
}) : null;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(__dirname, { extensions: ['html'] }));

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const clean = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const tokenFor = user => jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d', issuer: 'velvetstream' });

function auth(required = true) {
  return (req, res, next) => {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
    if (!token) return required ? res.status(401).json({ error: 'Authentication required.' }) : next();
    try { req.user = jwt.verify(token, JWT_SECRET, { issuer: 'velvetstream' }); next(); }
    catch { return required ? res.status(401).json({ error: 'Invalid or expired session.' }) : next(); }
  };
}
function adminOnly(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' }); next(); }

app.get('/api/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true, database: true, storage: storageConfigured }); }
  catch { res.status(503).json({ ok: false, database: false, storage: storageConfigured }); }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || '');
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Password must be 10–128 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('insert into users(email,password_hash) values($1,$2) returning id,email,role,created_at', [email, hash]);
    res.status(201).json({ user: rows[0], token: tokenFor(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
    console.error(e); res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || '');
  const { rows } = await pool.query('select id,email,password_hash,role,created_at from users where email=$1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  delete user.password_hash;
  res.json({ user, token: tokenFor(user) });
});

app.get('/api/me', auth(), async (req, res) => {
  const { rows } = await pool.query('select id,email,role,created_at from users where id=$1', [req.user.sub]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: rows[0] });
});

app.post('/api/uploads/presign', auth(), async (req, res) => {
  if (!storageConfigured) return res.status(503).json({ error: 'Object storage is not configured.' });
  const contentType = clean(req.body.contentType, 100).toLowerCase();
  const size = Number(req.body.size || 0);
  if (!ALLOWED_VIDEO_TYPES.has(contentType)) return res.status(400).json({ error: 'Unsupported video format.' });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES) return res.status(400).json({ error: `Video must be smaller than ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.` });
  const ext = contentType === 'video/mp4' ? 'mp4' : contentType === 'video/webm' ? 'webm' : 'mov';
  const objectKey = `pending/${req.user.sub}/${crypto.randomUUID()}.${ext}`;
  const command = new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  res.json({ uploadUrl, objectKey, expiresIn: 900 });
});

app.post('/api/submissions', auth(), async (req, res) => {
  if (!storageConfigured) return res.status(503).json({ error: 'Object storage is not configured.' });
  const title = clean(req.body.title, 80), category = clean(req.body.category, 40), description = clean(req.body.description, 1000), objectKey = clean(req.body.objectKey, 500);
  if (!title || !category || !objectKey) return res.status(400).json({ error: 'Title, category and uploaded object are required.' });
  if (!objectKey.startsWith(`pending/${req.user.sub}/`)) return res.status(400).json({ error: 'Invalid upload reference.' });
  if (!(req.body.adultVerified && req.body.consentConfirmed && req.body.rightsConfirmed)) return res.status(400).json({ error: 'All age, consent and rights confirmations are required.' });
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
    const type = String(head.ContentType || '').toLowerCase();
    const size = Number(head.ContentLength || 0);
    if (!ALLOWED_VIDEO_TYPES.has(type) || !size || size > MAX_VIDEO_BYTES) {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
      return res.status(400).json({ error: 'Uploaded object failed file validation.' });
    }
  } catch (e) {
    console.error('Upload verification failed', e);
    return res.status(400).json({ error: 'Uploaded object could not be verified.' });
  }
  try {
    const { rows } = await pool.query(`insert into submissions(user_id,title,category,description,object_key,adult_verified,consent_confirmed,rights_confirmed)
      values($1,$2,$3,$4,$5,true,true,true) returning id,title,category,status,created_at`, [req.user.sub,title,category,description,objectKey]);
    res.status(201).json({ submission: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Could not create submission.' });
  }
});

app.get('/api/my/submissions', auth(), async (req, res) => {
  const { rows } = await pool.query('select id,title,category,status,rejection_reason,created_at,updated_at from submissions where user_id=$1 order by created_at desc', [req.user.sub]);
  res.json({ submissions: rows });
});

app.get('/api/videos', async (_req, res) => {
  const { rows } = await pool.query(`select id,title,category,description,created_at from submissions where status='approved' order by created_at desc limit 100`);
  res.json({ videos: rows });
});

app.get('/api/videos/:id/play', async (req, res) => {
  if (!storageConfigured) return res.status(503).json({ error: 'Object storage is not configured.' });
  const { rows } = await pool.query(`select object_key from submissions where id=$1 and status='approved'`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Video not found.' });
  const command = new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: rows[0].object_key });
  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  res.json({ url, expiresIn: 300 });
});

app.post('/api/reports', auth(false), async (req, res) => {
  const contentRef = clean(req.body.contentRef, 500), reason = clean(req.body.reason, 100), details = clean(req.body.details, 2000);
  if (!contentRef || !reason || !details) return res.status(400).json({ error: 'Content reference, reason and details are required.' });
  await pool.query('insert into reports(reporter_user_id,content_ref,reason,details) values($1,$2,$3,$4)', [req.user?.sub || null,contentRef,reason,details]);
  res.status(201).json({ ok: true });
});

app.get('/api/admin/submissions', auth(), adminOnly, async (_req, res) => {
  const { rows } = await pool.query(`select s.id,s.title,s.category,s.description,s.status,s.created_at,s.rejection_reason,u.email as submitter
    from submissions s join users u on u.id=s.user_id order by s.created_at desc limit 250`);
  res.json({ submissions: rows });
});

app.patch('/api/admin/submissions/:id', auth(), adminOnly, async (req, res) => {
  const status = clean(req.body.status, 20).toLowerCase();
  const reason = clean(req.body.rejectionReason, 500);
  if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'Status must be approved or rejected.' });
  const { rows } = await pool.query(`update submissions set status=$1,rejection_reason=$2,moderated_by=$3,moderated_at=now(),updated_at=now() where id=$4 returning id,title,status,rejection_reason`, [status,status==='rejected'?reason:null,req.user.sub,req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Submission not found.' });
  res.json({ submission: rows[0] });
});

app.delete('/api/admin/submissions/:id', auth(), adminOnly, async (req, res) => {
  const { rows } = await pool.query('delete from submissions where id=$1 returning object_key', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Submission not found.' });
  if (storageConfigured) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: rows[0].object_key })); } catch (e) { console.error('Object delete failed', e); }
  }
  res.json({ ok: true });
});

app.get('/api/admin/reports', auth(), adminOnly, async (_req, res) => {
  const { rows } = await pool.query('select id,content_ref,reason,details,status,created_at from reports order by created_at desc limit 250');
  res.json({ reports: rows });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((req, res, next) => { if (req.method === 'GET') return res.sendFile(path.join(__dirname, 'index.html')); next(); });

app.listen(PORT, () => console.log(`VelvetStream listening on http://localhost:${PORT}`));
