import express from 'express';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { swaggerOptions } from './swagger.js';
import minimist from 'minimist'; // import minimist to parse command line arguments
import fs from 'fs';
import Database from './database.js';
import { tokensEndpoint } from './endpoints/arc72/tokens.js';
import { transfersEndpoint } from './endpoints/arc72/transfers.js';
import { collectionsEndpoint } from './endpoints/arc72/collections.js';
import { marketsEndpoint } from './endpoints/mp/markets.js';
import { listingsEndpoint } from './endpoints/mp/listings.js';
import { salesEndpoint } from './endpoints/mp/sales.js';
import { deletesEndpoint } from './endpoints/mp/deletes.js';
import { statsEndpoint } from './endpoints/stats.js';
import dotenv from 'dotenv';
dotenv.config();

const DB_PATH = process.env.DB_PATH || '../db/db.sqlite';
const db = new Database(DB_PATH);

const app = express();
const args = minimist(process.argv.slice(2));
const port = args.p || process.env.API_SERVER_PORT || 3000;

const endpoints = [
    {
        path: '/nft-indexer/v1/tokens',
        handler: tokensEndpoint,
    },
    {
        path: '/nft-indexer/v1/transfers',
        handler: transfersEndpoint,
    },
    {
        path: '/nft-indexer/v1/collections',
        handler: collectionsEndpoint,
    },
    {
        path: '/nft-indexer/v1/mp/markets',
        handler: marketsEndpoint,
    },
    {
        path: '/nft-indexer/v1/mp/listings',
        handler: listingsEndpoint,
    },
    {
        path: '/nft-indexer/v1/mp/sales',
        handler: salesEndpoint,
    },
    {
        path: '/nft-indexer/v1/mp/deletes',
        handler: deletesEndpoint,
    },
    {
        path: '/stats',
        handler: statsEndpoint,
    }
]

// populate swaggerOptions version with the version from package.json, read file
const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));
swaggerOptions.swaggerDefinition.info.version = packageJson.version;

swaggerOptions.swaggerDefinition.servers.push({ url: `http://localhost:${port}`, description: 'Local Server' });

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// listen to all endpoints defined in endpoints array
endpoints.forEach((endpoint) => {
    app.get(endpoint.path, (req, res) => endpoint.handler(req, res, db));
});

// Start the server
app.listen(port, () => {
    console.log(`Indexer API Server listening at http://localhost:${port}`);
    console.log(`API Docs: http://localhost:${port}/api-docs`);
    console.log(`Tokens Endpoint: http://localhost:${port}/nft-indexer/v1/tokens`);
    console.log(`Transfers Endpoint: http://localhost:${port}/nft-indexer/v1/transfers`);
});
