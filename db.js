// db.js
const { Pool } = require('pg');

// Render автоматически предоставляет Internal Connection String 
// через переменную окружения DATABASE_URL.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    // В случае ошибки при деплое на Render
    console.error("DATABASE_URL не найдена. Критическая ошибка конфигурации.");
    // В случае локального тестирования (необходимо заменить)
    // throw new Error("DATABASE_URL is not set."); 
}

// Создаем пул подключений к PostgreSQL
const pool = new Pool({
    connectionString: connectionString,
    // Настройки SSL необходимы для публичных хостингов, таких как Render
    ssl: {
        rejectUnauthorized: false 
    }
});

// Экспортируем пул для использования в server.js

module.exports = pool;
