const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const API_VERSION = '/api/v1';

// Настройка CORS для работы с GitHub Pages
app.use(cors());
app.use(express.json());

// Подключение к базе данных Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Проверка подключения к БД при запуске
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Ошибка подключения к БД:', err.stack);
    }
    console.log('Успешное подключение к базе данных PostgreSQL');
    release();
});

// --- АВТОРИЗАЦИЯ ---

// Регистрация: используем password_hash как в вашей БД
app.post(`${API_VERSION}/auth/register`, async (req, res) => {
    const { email, password, username } = req.body;
    if (!email || !password || !username) {
        return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO Users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING user_id',
            [email, password, username]
        );
        res.status(201).json({ user_id: result.rows[0].user_id });
    } catch (err) {
        console.error('Ошибка регистрации:', err.message);
        if (err.code === '23505') {
            res.status(400).json({ error: 'Этот Email уже зарегистрирован' });
        } else {
            res.status(500).json({ error: 'Ошибка сервера при регистрации' });
        }
    }
});

// Вход: сравниваем с колонкой password_hash
app.post(`${API_VERSION}/auth/login`, async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT user_id, username, password_hash FROM Users WHERE email = $1', 
            [email]
        );
        
        if (result.rows.length > 0 && result.rows[0].password_hash === password) {
            res.json({ 
                user_id: result.rows[0].user_id, 
                username: result.rows[0].username 
            });
        } else {
            res.status(401).json({ error: 'Неверный email или пароль' });
        }
    } catch (err) {
        console.error('Ошибка входа:', err.message);
        res.status(500).json({ error: 'Техническая ошибка на сервере' });
    }
});

// --- НЕЙРОСЕТИ И КАТЕГОРИИ ---

app.get(`${API_VERSION}/categories`, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Neuro_Categories ORDER BY category_name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

// --- ИЗБРАННОЕ ---

// Добавить нейросеть в избранное
app.post(`${API_VERSION}/favorites/networks`, async (req, res) => {
    const { user_id, neuro_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO User_Favorites (user_id, neuro_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', 
            [user_id, neuro_id]
        );
        res.status(201).json({ message: 'Добавлено в избранное' });
    } catch (err) {
        console.error('Ошибка избранного (сети):', err.message);
        res.status(500).json({ error: 'Не удалось сохранить в избранное' });
    }
});

// Получить избранные сети пользователя
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

// Сохранить категорию
app.post(`${API_VERSION}/favorites/categories`, async (req, res) => {
    const { user_id, category_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO Favorite_Categories (user_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', 
            [user_id, category_id]
        );
        res.status(201).json({ message: 'Категория сохранена' });
    } catch (err) {
        console.error('Ошибка избранного (категории):', err.message);
        res.status(500).json({ error: 'Не удалось сохранить категорию' });
    }
});

// Получить избранные категории
app.get(`${API_VERSION}/favorites/categories/:user_id`, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT nc.* FROM Neuro_Categories nc
            JOIN Favorite_Categories fc ON nc.category_id = fc.category_id
            WHERE fc.user_id = $1`, [req.params.user_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`API доступно по адресу: ${API_VERSION}`);
});
