import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from './config/env';
import { query } from './config/database';
import { calculateSHA512, signRelease, verifySignature } from './utils/crypto';
import { generateLatestYml } from './latest-yml';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Serve release files statically
const releasesDir = path.resolve(env.releasesDir);
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir, { recursive: true });
}
app.use('/releases', express.static(releasesDir));

// Multer for file uploads
const upload = multer({
  dest: path.join(releasesDir, 'temp'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

// Admin API key middleware
function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['x-admin-api-key'] as string;
  if (apiKey !== env.adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * GET /update/:platform/latest.yml
 * Serves the latest.yml for electron-updater
 */
app.get('/update/:platform/latest.yml', async (req, res) => {
  try {
    const { platform } = req.params;
    const result = await query(
      "SELECT * FROM software_releases WHERE is_active = true ORDER BY created_at DESC LIMIT 1"
    );

    if (result.rows.length === 0) {
      return res.status(404).send('No releases found');
    }

    const release = result.rows[0];
    const ymlPath = path.join(releasesDir, 'latest.yml');

    // Verify the release file still exists
    if (!fs.existsSync(release.file_path)) {
      return res.status(404).send('Release file not found');
    }

    // Verify signature integrity
    if (!verifySignature(release.file_hash, release.version, release.signature)) {
      return res.status(500).send('Release signature verification failed');
    }

    const fileStats = fs.statSync(release.file_path);
    const fileName = path.basename(release.file_path);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const ymlContent = generateLatestYml({
      version: release.version,
      fileName,
      fileHash: release.file_hash,
      fileSize: fileStats.size,
      signature: release.signature,
      baseUrl,
    });

    // Cache the latest.yml
    fs.writeFileSync(ymlPath, ymlContent, 'utf8');

    res.type('text/yaml').send(ymlContent);
  } catch (error: any) {
    console.error('Error serving latest.yml:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /update/:platform/latest-mac.yml
 * Alias for macOS (not currently supported but included for electron-updater)
 */
app.get('/update/:platform/latest-mac.yml', (req, res) => {
  res.redirect(`/update/${req.params.platform}/latest.yml`);
});

/**
 * POST /api/releases/upload
 * Upload a new release version (admin only)
 */
app.post('/api/releases/upload', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const { version, changelog } = req.body;
    const file = req.file;

    if (!version || !file) {
      return res.status(400).json({ error: 'Version and file are required' });
    }

    // Check if version already exists
    const existing = await query(
      'SELECT id FROM software_releases WHERE version = $1',
      [version]
    );
    if (existing.rows.length > 0) {
      // Clean up uploaded temp file
      fs.unlinkSync(file.path);
      return res.status(409).json({ error: 'Version already exists' });
    }

    // Move file to final location
    const ext = path.extname(file.originalname || '.exe');
    const finalFileName = `AtendIA-Setup-${version}${ext}`;
    const finalPath = path.join(releasesDir, finalFileName);
    fs.renameSync(file.path, finalPath);

    // Calculate SHA-512 hash
    const fileHash = await calculateSHA512(finalPath);

    // Sign the release
    const signature = signRelease(fileHash, version);

    // Save to database
    const result = await query(
      `INSERT INTO software_releases (version, changelog, file_path, file_hash, signature, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [version, changelog || '', finalPath, fileHash, signature]
    );

    // Regenerate latest.yml
    const fileStats = fs.statSync(finalPath);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const ymlContent = generateLatestYml({
      version,
      fileName: finalFileName,
      fileHash,
      fileSize: fileStats.size,
      signature,
      baseUrl,
    });
    fs.writeFileSync(path.join(releasesDir, 'latest.yml'), ymlContent, 'utf8');

    // Deactivate older releases
    await query(
      'UPDATE software_releases SET is_active = false WHERE version != $1',
      [version]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id,
        version,
        fileHash,
        signature,
        fileName: finalFileName,
      },
    });
  } catch (error: any) {
    console.error('Error uploading release:', error);
    // Clean up temp file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/releases
 * List all releases (admin only)
 */
app.get('/api/releases', adminAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, version, changelog, file_hash, is_active, created_at FROM software_releases ORDER BY created_at DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Error listing releases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/releases/:id/activate
 * Activate a specific release version (admin only)
 */
app.patch('/api/releases/:id/activate', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const check = await query('SELECT id FROM software_releases WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Release not found' });
    }

    await query('UPDATE software_releases SET is_active = false WHERE id != $1', [id]);
    await query('UPDATE software_releases SET is_active = true WHERE id = $1', [id]);

    res.json({ success: true, message: 'Release activated' });
  } catch (error: any) {
    console.error('Error activating release:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/releases/:id
 * Delete a release version (admin only)
 */
app.delete('/api/releases/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT file_path FROM software_releases WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const filePath = result.rows[0].file_path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await query('DELETE FROM software_releases WHERE id = $1', [id]);

    res.json({ success: true, message: 'Release deleted' });
  } catch (error: any) {
    console.error('Error deleting release:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(env.port, () => {
  console.log(`AtendIA Update Server running on port ${env.port}`);
  console.log(`Releases directory: ${releasesDir}`);
});

export default app;
