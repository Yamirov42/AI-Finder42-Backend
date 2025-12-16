// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Добавлено для решения проблем с CORS при обращении с Frontend
const db = require('./db');   // Импорт пула PostgreSQL

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Разрешаем запросы с других доменов (с вашего GitHub Pages)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Базовый маршрут
app.get('/', (req, res) => {
    res.send('AI Finder API is running!');
});

const API_VERSION = '/api/v1';

// --- Маршруты для авторизации (Auth) ---

// 1. Вход пользователя
app.post(`${API_VERSION}/auth/login`, async (req, res) => {
    const { email, password } = req.body;
    
    // В реальном приложении: проверка email и хэширование пароля!
    // Здесь используем простой SELECT для демонстрации
    const query = 'SELECT user_id, username, password_hash FROM Users WHERE email = $1 AND password_hash = $2';
    
    try {
        const result = await db.query(query, [email, password]);
        const rows = result.rows; 
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }
        
        const user = rows[0];
        // В реальном приложении: генерация JWT токена
        res.json({ 
            message: 'Авторизация успешна', 
            user_id: user.user_id,
            username: user.username
        });

    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера при входе.' });
    }
});

// 2. Регистрация пользователя
app.post(`${API_VERSION}/auth/register`, async (req, res) => {
    const { email, password, username } = req.body;
    
    // В реальном приложении: проверка на существующий email, хэширование пароля!
    const query = 'INSERT INTO Users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING user_id';
    
    try {
        const result = await db.query(query, [email, password, username]);
        const user_id = result.rows[0].user_id;

        res.status(201).json({ 
            message: 'Регистрация успешна', 
            user_id: user_id
        });
    } catch (error) {
        if (error.code === '23505') { // Код ошибки уникальности в PostgreSQL
             return res.status(409).json({ error: 'Пользователь с таким email уже существует.' });
        }
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера при регистрации.' });
    }
});


// --- Маршруты для работы с данными (Data) ---

// 3. Получение всех категорий
app.get(`${API_VERSION}/categories`, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM Neuro_Categories ORDER BY category_name');
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка получения категорий:', error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

// 4. Получение всех нейросетей (или по категории/поиску)
app.get(`${API_VERSION}/networks`, async (req, res) => {
    const { category_id, search } = req.query;
    let query = `
        SELECT nn.*, nc.category_name 
        FROM Neural_Networks nn
        JOIN Neuro_Categories nc ON nn.category_id = nc.category_id
    `;
    const params = [];

    if (category_id) {
        params.push(category_id);
        query += ` WHERE nn.category_id = $${params.length}`;
    } else if (search) {
        params.push(`%${search}%`);
        // Используем ILIKE для поиска без учета регистра в PostgreSQL
        query += ` WHERE nn.name ILIKE $${params.length} OR nn.description ILIKE $${params.length}`;
    }

    query += ' ORDER BY nn.name';

    try {
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка получения нейросетей:', error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

// 5. Получение одной нейросети по ID
app.get(`${API_VERSION}/networks/:neuro_id`, async (req, res) => {
    const neuroId = req.params.neuro_id;
    const query = `
        SELECT nn.*, nc.category_name 
        FROM Neural_Networks nn
        JOIN Neuro_Categories nc ON nn.category_id = nc.category_id
        WHERE nn.neuro_id = $1
    `;
    
    try {
        const result = await db.query(query, [neuroId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Нейросеть не найдена.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка получения нейросети:', error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

// --- Запуск сервера ---
app.listen(port, () => {
    console.log(`Сервер AI-Finder API запущен на порту ${port}`);
    // Проверка подключения к БД (опционально)
    db.query('SELECT NOW()')
        .then(() => console.log('Подключение к PostgreSQL успешно установлено!'))
        .catch(err => console.error('Ошибка подключения к PostgreSQL:', err.message));

});
// --- ИЗБРАННОЕ: НЕЙРОСЕТИ ---

// Добавить в избранное
app.post(`${API_VERSION}/favorites/networks`, async (req, res) => {
    const { user_id, neuro_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO User_Favorites (user_id, neuro_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user_id, neuro_id]
        );
        res.status(201).json({ message: 'Добавлено в избранное' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Получить избранное пользователя
app.get(`${API_VERSION}/favorites/networks/:user_id`, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT nn.*, nc.category_name 
            FROM Neural_Networks nn
            JOIN User_Favorites uf ON nn.neuro_id = uf.neuro_id
            JOIN Neuro_Categories nc ON nn.category_id = nc.category_id
            WHERE uf.user_id = $1
        `, [req.params.user_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ИЗБРАННОЕ: КАТЕГОРИИ ---

app.post(`${API_VERSION}/favorites/categories`, async (req, res) => {
    const { user_id, category_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO Favorite_Categories (user_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user_id, category_id]
        );
        res.status(201).json({ message: 'Категория сохранена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
