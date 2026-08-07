import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("nexus.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'money', 'mood', 'health', 'food', 'activity'
    value REAL,
    category TEXT,
    note TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user TEXT NOT NULL -- 'partner1' or 'partner2'
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    category TEXT DEFAULT 'photo',
    location TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    card_width INTEGER DEFAULT 220,
    card_height INTEGER DEFAULT 280,
    text_size INTEGER DEFAULT 14,
    font_family TEXT DEFAULT 'Caveat',
    text_color TEXT DEFAULT '#000000',
    bg_color TEXT DEFAULT '#f8f8f8'
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    category TEXT,
    target INTEGER,
    current INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS capsules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    type TEXT,
    unlock_date DATETIME,
    is_locked BOOLEAN DEFAULT 1,
    content_url TEXT
  );

  CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS widgets (
    id TEXT PRIMARY KEY,
    size TEXT NOT NULL, -- 'small', 'wide', 'tall', 'large'
    display_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Seed Initial Data
  INSERT OR IGNORE INTO tracking (type, value, category, note, user, timestamp) VALUES 
  ('money', 45.50, 'Dinner', 'Date night at the sushi place', 'Partner 1', '2026-03-01 19:00:00'),
  ('mood', 9, 'Happy', 'Great day together', 'Partner 2', '2026-03-01 22:00:00'),
  ('activity', 1, 'Outdoor', 'Walk in the park', 'Partner 1', '2026-03-02 10:00:00'),
  ('food', 1, 'Coffee', 'Morning latte', 'Partner 2', '2026-03-03 08:30:00'),
  ('activity', 1, 'Movie', 'Watched Dune 2', 'Partner 1', '2026-03-04 20:00:00'),
  ('mood', 10, 'Amazing', 'Best day ever', 'Partner 2', '2026-03-05 23:00:00'),
  ('activity', 1, 'Gym', 'Workout session', 'Partner 1', '2026-03-06 07:00:00');

  INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'INR'), ('timezone', 'IST');

  INSERT OR IGNORE INTO goals (title, category, target, current) VALUES 
  ('Cook together 4 times', 'cooking', 4, 2),
  ('Visit 2 new cafes', 'adventure', 2, 1);

  INSERT OR IGNORE INTO capsules (title, type, unlock_date) VALUES 
  ('Our First Year Letter', 'letter', '2027-01-01');

  INSERT OR IGNORE INTO insights (title, content, type) VALUES 
  ('Weekend Dinners', 'Weekend dinners are your most common activity.', 'pattern'),
  ('Mood Peak', 'Shared travel days correlate with your highest mood levels.', 'trend');

  INSERT OR IGNORE INTO widgets (id, size, display_order) VALUES 
  ('calendar', 'small', 1),
  ('memories', 'wide', 2),
  ('insight', 'tall', 3),
  ('stats', 'small', 4),
  ('capsule', 'small', 5),
  ('activity', 'wide', 6);

  -- Migration: Merge 'score' into 'calendar' if it exists
  DELETE FROM widgets WHERE id = 'score' AND EXISTS (SELECT 1 FROM widgets WHERE id = 'calendar');
  UPDATE widgets SET id = 'calendar' WHERE id = 'score' AND NOT EXISTS (SELECT 1 FROM widgets WHERE id = 'calendar');
`);

try {
  db.exec(`ALTER TABLE memories ADD COLUMN card_width INTEGER DEFAULT 220;`);
  db.exec(`ALTER TABLE memories ADD COLUMN card_height INTEGER DEFAULT 280;`);
  db.exec(`ALTER TABLE memories ADD COLUMN text_size INTEGER DEFAULT 14;`);
  db.exec(`ALTER TABLE memories ADD COLUMN font_family TEXT DEFAULT 'Caveat';`);
  db.exec(`ALTER TABLE memories ADD COLUMN text_color TEXT DEFAULT '#000000';`);
  db.exec(`ALTER TABLE memories ADD COLUMN bg_color TEXT DEFAULT '#f8f8f8';`);
  db.exec(`ALTER TABLE memories ADD COLUMN border_style TEXT DEFAULT 'none';`);
  db.exec(`ALTER TABLE memories ADD COLUMN border_width INTEGER DEFAULT 0;`);
  db.exec(`ALTER TABLE memories ADD COLUMN border_color TEXT DEFAULT '#000000';`);
  db.exec(`ALTER TABLE memories ADD COLUMN shadow_effect TEXT DEFAULT 'xl';`);
  db.exec(`ALTER TABLE memories ADD COLUMN bg_image_overlay TEXT;`);
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get("/api/tracking", (req, res) => {
    const data = db.prepare("SELECT * FROM tracking ORDER BY timestamp DESC LIMIT 100").all();
    res.json(data);
  });

  app.post("/api/tracking", (req, res) => {
    const { type, value, category, note, user } = req.body;
    const info = db.prepare(
      "INSERT INTO tracking (type, value, category, note, user) VALUES (?, ?, ?, ?, ?)"
    ).run(type, value, category, note, user);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/stats", (req, res) => {
    const money = db.prepare("SELECT SUM(value) as total FROM tracking WHERE type = 'money'").get();
    const mood = db.prepare("SELECT AVG(value) as avg FROM tracking WHERE type = 'mood'").get();
    const activities = db.prepare("SELECT category, COUNT(*) as count FROM tracking WHERE type = 'activity' GROUP BY category").all();
    const memories = db.prepare("SELECT COUNT(*) as count FROM memories").get();
    
    res.json({
      totalMoney: money.total || 0,
      avgMood: mood.avg || 0,
      activities,
      totalMemories: memories.count || 0,
      connectionScore: 84 // Mock score for now
    });
  });

  app.get("/api/goals", (req, res) => {
    const data = db.prepare("SELECT * FROM goals").all();
    res.json(data);
  });

  app.post("/api/goals", (req, res) => {
    const { title, category, target, current } = req.body;
    const info = db.prepare(
      "INSERT INTO goals (title, category, target, current) VALUES (?, ?, ?, ?)"
    ).run(title, category, target, current || 0);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/goals/:id", (req, res) => {
    const { current } = req.body;
    db.prepare("UPDATE goals SET current = ? WHERE id = ?").run(current, req.params.id);
    res.json({ status: "ok" });
  });

  app.get("/api/capsules", (req, res) => {
    const data = db.prepare("SELECT * FROM capsules").all();
    res.json(data);
  });

  app.post("/api/capsules", (req, res) => {
    const { title, type, unlock_date, content_url } = req.body;
    const info = db.prepare(
      "INSERT INTO capsules (title, type, unlock_date, content_url) VALUES (?, ?, ?, ?)"
    ).run(title, type, unlock_date, content_url || null);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/insights", (req, res) => {
    const data = db.prepare("SELECT * FROM insights ORDER BY timestamp DESC").all();
    res.json(data);
  });

  app.get("/api/widgets", (req, res) => {
    const data = db.prepare("SELECT * FROM widgets ORDER BY display_order ASC").all();
    res.json(data);
  });

  app.post("/api/widgets", (req, res) => {
    const { widgets } = req.body;
    const update = db.prepare("INSERT OR REPLACE INTO widgets (id, size, display_order) VALUES (?, ?, ?)");
    const transaction = db.transaction((items) => {
      for (const item of items) update.run(item.id, item.size, item.order);
    });
    transaction(widgets);
    res.json({ status: "ok" });
  });

  app.get("/api/memories", (req, res) => {
    const data = db.prepare("SELECT * FROM memories ORDER BY timestamp DESC").all();
    res.json(data);
  });

  app.post("/api/memories", (req, res) => {
    const { title, description, image_url, card_width, card_height, text_size, font_family, text_color, bg_color, border_style, border_width, border_color, shadow_effect, bg_image_overlay } = req.body;
    const info = db.prepare(
      "INSERT INTO memories (title, description, image_url, card_width, card_height, text_size, font_family, text_color, bg_color, border_style, border_width, border_color, shadow_effect, bg_image_overlay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(title, description, image_url, card_width || 220, card_height || 280, text_size || 14, font_family || 'Caveat', text_color || '#000000', bg_color || '#f8f8f8', border_style || 'none', border_width || 0, border_color || '#000000', shadow_effect || 'xl', bg_image_overlay || null);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/memories/:id", (req, res) => {
    const { title, description, image_url, card_width, card_height, text_size, font_family, text_color, bg_color, border_style, border_width, border_color, shadow_effect, bg_image_overlay } = req.body;
    db.prepare(
      "UPDATE memories SET title = ?, description = ?, image_url = ?, card_width = ?, card_height = ?, text_size = ?, font_family = ?, text_color = ?, bg_color = ?, border_style = ?, border_width = ?, border_color = ?, shadow_effect = ?, bg_image_overlay = ? WHERE id = ?"
    ).run(title, description, image_url, card_width, card_height, text_size, font_family, text_color, bg_color, border_style, border_width, border_color, shadow_effect, bg_image_overlay, req.params.id);
    res.json({ status: "ok" });
  });

  app.delete("/api/memories/:id", (req, res) => {
    db.prepare("DELETE FROM memories WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
  });

  app.get("/api/settings", (req, res) => {
    const currency = db.prepare("SELECT value FROM settings WHERE key = 'currency'").get();
    const timezone = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get();
    res.json({
      currency: currency?.value || "USD",
      timezone: timezone?.value || "UTC"
    });
  });

  app.post("/api/settings", (req, res) => {
    const { currency, timezone } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency', ?), ('timezone', ?)").run(currency, timezone);
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nexus Server running on http://localhost:${PORT}`);
  });
}

startServer();
