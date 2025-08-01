import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { pool } from './db.js';

const app = express();
app.use(express.json());

// Needed for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for "/" explicitly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/destination', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'destination.html'));
});
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});
app.get('/sumatra', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sumatra.html'));
});
app.get('/kalimantan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kalimantan.html'));
});
app.get('/sulawesi', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sulawesi.html'));
});
app.get('/papua', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'papua.html'));
});
app.get('/jawa', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jawa.html'));
});

// Serve pricing.json at /pricing
app.get('/pricing', (req, res) => {
  const filePath = path.join(__dirname, 'pricing.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading pricing.json:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  });
});

// 1. GET /destinations
//    Returns id, name, type, lat, lon, and latest crowd_score
app.get('/destinations', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        d.id, 
        d.name, 
        d.location,
        d.type, 
        d.latitude, 
        d.longitude,
        d.max_people,
        cm.raw_count,
        ROUND(cm.raw_count / d.max_people * 10, 2) AS busyness_score
      FROM destinations d
      JOIN (
        SELECT destination_id, raw_count
        FROM crowd_metrics cm1
        WHERE ts = (
          SELECT MAX(ts)
          FROM crowd_metrics cm2
          WHERE cm2.destination_id = cm1.destination_id
        )
      ) AS cm ON cm.destination_id = d.id;
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch destinations' });
  }
});

// 2. GET /destinations/:id/metrics?hours=24
//    Returns time‑series of crowd_score for the last N hours
app.get('/destinations/:id/metrics', async (req, res) => {
  const id    = parseInt(req.params.id, 10);
  const hours = parseInt(req.query.hours, 10) || 24;

  try {
    // First fetch max_people for this destination
    const [[{ max_people }]] = await pool.query(
      `SELECT max_people FROM destinations WHERE id = ?`,
      [id]
    );
    if (max_people == null) {
      return res.status(404).json({ error: 'Destination not found or no capacity set' });
    }

    // Then fetch time‑series
    const [rows] = await pool.query(`
      SELECT 
        dt.id,
        dt.name,
        dt.location,
        cm.ts, 
        cm.raw_count,
        ROUND(cm.raw_count / ? * 10, 2) AS busyness_score
      FROM crowd_metrics cm
      JOIN destinations dt ON dt.id = cm.destination_id
      WHERE cm.destination_id = ?
        AND cm.ts >= NOW() - INTERVAL ? HOUR
      ORDER BY cm.ts ASC;
    `, [max_people, id, hours]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Boot the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Read‑only API listening on http://localhost:${PORT}`);
});
