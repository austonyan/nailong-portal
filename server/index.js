import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roleRoutes from './routes/roles.js';
import serviceRoutes from './routes/services.js';
import visaRoutes from './routes/visa.js';
import visaAdminRoutes from './routes/visaAdmin.js';
import visaInterRoutes from './routes/visaInter.js';
import docsRoutes from './routes/docs.js';
import immigrationRoutes from './immigration/routes.js';
import immigrationAdminRoutes from './immigration/admin.js';
import dipRoutes from './dip/routes.js';
import dipAdminRoutes from './dip/admin.js';
import dipInterRoutes from './dip/inter.js';
import { ApiError } from './http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'nailong-portal', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/visa/admin', visaAdminRoutes);
app.use('/api/visa/inter', visaInterRoutes);
app.use('/api/visa', visaRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/immigration/admin', immigrationAdminRoutes);
app.use('/api/immigration', immigrationRoutes);
// 外交署:inter → admin → 用户路由(顺序与其他署一致)
app.use('/api/dip/inter', dipInterRoutes);
app.use('/api/dip/admin', dipAdminRoutes);
app.use('/api/dip', dipRoutes);

app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Unknown API endpoint' }));

// In production, serve the built SPA and fall back to index.html for client
// side routes.
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }
  console.error('[nailong] unexpected error:', err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[nailong] portal API listening on http://localhost:${port}`);
});
