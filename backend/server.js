// server.js - Minimal Express server, loads .env, prepares JWT authentication
require('dotenv').config();
// Prefer IPv4 to avoid undici fetch failures when IPv6 is misconfigured
try { require('dns').setDefaultResultOrder('ipv4first'); } catch { }
const express = require('express');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');


const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4000;


function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  try {
    const payload = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

const usersRouter = require('./api/users');
const vaultsRouter = require('./api/vaults');
const itemsRouter = require('./api/items');
const auditRouter = require('./api/audit');
const adminRouter = require('./api/admin');

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.use('/api/users', authenticateToken, usersRouter);
app.use('/api/vaults', authenticateToken, vaultsRouter);
app.use('/api/vaults/:vaultId/items', authenticateToken, itemsRouter);
app.use('/api/audit', authenticateToken, auditRouter);
app.use('/api/admin', authenticateToken, adminRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});