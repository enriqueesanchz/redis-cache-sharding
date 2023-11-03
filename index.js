const knex = require('knex');
const express = require('express')
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const Redis = require('ioredis');

const app = express();
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const db = knex({
    client: 'pg',
    connection: {
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        host: process.env.POSTGRES_IP,
        port: process.env.POSTGRES_PORT
    }
});

// Configura la conexión al clúster Redis
const cluster = new Redis.Cluster([
    { host: process.env.REDIS_1_IP, port: 6379 },
    { host: process.env.REDIS_2_IP, port: 6379 },
    { host: process.env.REDIS_3_IP, port: 6379 },
    // Agrega más nodos del clúster según sea necesario
], {
    scaleReads: 'all', // Envia lecturas a todos los nodos
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: Get the 20 highest kw records with caching
 *     description: Get the 20 highest kw records with caching
 *     responses:
 *       200:
 *         description: Succesfully obtained
 */
app.get('/', async (req, res) => {
    const cache = await cluster.get('highest-production');

    if (cache) {
        return res.send({ highestProduction: JSON.parse(cache) });
    }

    const highestProduction = await db('solar_plants').orderBy('kw', 'desc').limit(20);
    await cluster.set('highest-production', JSON.stringify(highestProduction), 'EX', 5); //setting an expiring time of 5 seconds to this cache

    res.send({ highestProduction });
});

/**
 * @swagger
 * /no-redis:
 *   get:
 *     summary: Get the 20 highest kw records without caching
 *     description: Get the 20 highest kw records without caching
 *     responses:
 *       200:
 *         description: Succesfully obtained
 */
app.get('/no-redis', async (req, res) => {
    const highestProduction = await db('solar_plants').orderBy('kw', 'desc').limit(20);
    res.send({ highestProduction });
});

/**
 * @swagger
 * /:
 *   post:
 *     summary: Create a new record
 *     description: Create a new record in the database
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Solar plant id
 *               kw:
 *                 type: number
 *                 description: Kilowatts
 *               temp:
 *                 type: number
 *                 description: Celsius degrees
 *     responses:
 *       201:
 *         description: Succesfully created
 *       400:
 *         description: Required fields are missing
 *       500:
 *         description: Server error while creating
 */
app.post('/', async (req, res) => {
    try {
        const timestamp = new Date();
        const { id, kw, temp } = req.body;

        if (typeof (id) === 'undefined' || typeof (kw) === 'undefined' || typeof (temp) === 'undefined') {
            return res.status(400).json({ error: 'Required fields are missing' });
        }

        await db('solar_plants').insert({ timestamp, id, kw, temp });

        res.status(201).json({ message: 'Succesfully created' });
    } catch (error) {
        console.error('Server error while creating', error);
        res.status(500).json({ error: 'Server error while creating' });
    }
});

/**
 * @swagger
 * /no-redis/filter:
 *   get:
 *     summary: Get filtered random records without caching
 *     description: Retrieve random records from the database based on kw and temp criteria without caching
 *     responses:
 *       200:
 *         description: Successful response with filtered records.
 *       400:
 *         description: Bad request due to missing parameters.
 *       500:
 *         description: Server error while filtering records.
 */
app.get('/no-redis/filter', async (req, res) => {
    const kw = Math.floor(Math.random() * 10);
    const temp = Math.floor(25 + (Math.random() - 0.5) * 5);

    const filteredRecords = await db('solar_plants')
        .where('kw', '>=', kw)
        .where('temp', '<=', temp)
        .select('*')
        .orderBy('kw', 'desc')
        .limit(20);

    res.status(200).json(filteredRecords);

});

/**
 * @swagger
 * /filter:
 *   get:
 *     summary: Get filtered random records with caching
 *     description: Retrieve random records from the database based on kw and temp criteria with caching
 *     responses:
 *       200:
 *         description: Successful response with filtered records.
 *       400:
 *         description: Bad request due to missing parameters.
 *       500:
 *         description: Server error while filtering records.
 */
app.get('/filter', async (req, res) => {
    const kw = Math.floor(Math.random() * 9);
    const temp = Math.floor(25 + (Math.random() - 0.5) * 5);

    const cache = await cluster.get(`${kw}-${temp}`);

    if (cache) {
        return res.send({ filteredRecords: JSON.parse(cache) });
    }

    const filteredRecords = await db('solar_plants')
        .where('kw', '>=', kw)
        .where('temp', '<=', temp)
        .select('*')
        .orderBy('kw', 'desc')
        .limit(20);

    await cluster.set(`${kw}-${temp}`, JSON.stringify(filteredRecords), 'EX', 10); //setting an expiring time of 10 seconds to this cache

    res.status(200).json(filteredRecords);

});

app.listen(3000, async () => {
    console.log('Listening on port 3000')
});
