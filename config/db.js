import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect()
    .then(client => {
        console.log("✓ Conectado a la base de datos PostgreSQL");
        client.release();
    })
    .catch(err => console.error("✗ Error conectando a la base de datos:", err.message));

export default pool;