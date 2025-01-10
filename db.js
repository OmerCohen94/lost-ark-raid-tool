require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
    host: process.env.SUPABASE_DB_HOST, // Supabase Host
    user: process.env.SUPABASE_DB_USER, // Supabase User
    password: process.env.SUPABASE_DB_PASS, // Supabase Password
    database: process.env.SUPABASE_DB_NAME, // Supabase Database
    port: process.env.SUPABASE_DB_PORT || 5432, // Supabase Port
    ssl: {
        rejectUnauthorized: false, // Supabase requires SSL
    },
});

module.exports = db;
