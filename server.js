const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const API_VERSION = '/api/v1';

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- АВТОРИЗАЦИЯ (с учетом password_hash) ---

app.post(`${API_VERSION}/auth/register`, async (req, res) => {
    const { email, password, username } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO Users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING user_id',
            [email, password, username]
        );
        res.status(201).json({ user_id: result.rows[0].user_id });
    } catch (err) {
        if (err.code === '23505') res.status(400).json({ error: 'Email уже занят' });
        else res.status(500).json({ error: err.message });
    }
});

app.post(`${API_VERSION}/auth/login`, async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (result.rows.length > 0 && result.rows[0].password_hash === password) {
            res.json({ user_id: result.rows[0].user_id, username: result.rows[0].username });
        } else {
            res.status(401).json({ error: 'Неверные данные' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- НЕЙРОСЕТИ (Добавлена цена и рейтинг) ---

app.get(`${API_VERSION}/networks`, async (req, res) => {
    const { category_id, search } = req.query;
    let query = `
        SELECT nn.*, nc.category_name 
        FROM Neural_Networks nn 
        JOIN Neuro_Categories nc ON nn.category_id = nc.category_id 
        WHERE 1=1`;
    const params = [];

    if (category_id) {
        params.push(category_id);
        query += ` AND nn.category_id = $${params.length}`;
    }
    if (search) {
        params.push(`%${search}%`);
        query += ` AND (nn.name ILIKE $${params.length} OR nn.description ILIKE $${params.length})`;
    }

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// НОВОЕ: Оценка нейросети пользователем
app.post(`${API_VERSION}/networks/:id/rate`, async (req, res) => {
    const neuroId = req.params.id;
    const { user_id, rating } = req.body;

    try {
        // 1. Добавляем или обновляем оценку
        await pool.query(
            `INSERT INTO User_Ratings (user_id, neuro_id, rating_value) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (user_id, neuro_id) DO UPDATE SET rating_value = $3`,
            [user_id, neuroId, rating]
        );

        // 2. Считаем средний рейтинг
        const avgResult = await pool.query(
            'SELECT AVG(rating_value) as avg FROM User_Ratings WHERE neuro_id = $1',
            [neuroId]
        );
        
        const newAvg = avgResult.rows[0].avg;

        // 3. Обновляем средний рейтинг в таблице сетей
        await pool.query(
            'UPDATE Neural_Networks SET average_rating = $1 WHERE neuro_id = $2',
            [newAvg, neuroId]
        );

        res.json({ success: true, newAverage: parseFloat(newAvg).toFixed(1) });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка при сохранении оценки' });
    }
});

// --- ИЗБРАННОЕ ---

app.post(`${API_VERSION}/favorites/networks`, async (req, res) => {
    const { user_id, neuro_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO User_Favorites (user_id, neuro_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user_id, neuro_id]
        );
        res.status(201).json({ message: 'Добавлено' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get(`${API_VERSION}/favorites/networks/:user_id`, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT nn.*, nc.category_name FROM Neural_Networks nn
            JOIN User_Favorites uf ON nn.neuro_id = uf.neuro_id
            JOIN Neuro_Categories nc ON nn.category_id = nc.category_id
            WHERE uf.user_id = $1`, [req.params.user_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get(`${API_VERSION}/categories`, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Neuro_Categories');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
