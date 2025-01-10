const { Pool } = require('pg');

// Create a new pool instance with your database configuration
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'raid_tool',
    password: 'ETNERPASSRNIWANISA',
    port: 5432, // Default PostgreSQL port
});

// Export the pool to use it in other files
module.exports = {
    query: (text, params) => pool.query(text, params),
};
