import express from 'express';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { swaggerOptions } from './swagger.js';
import minimist from 'minimist'; // import minimist to parse command line arguments
import fs from 'fs';
import Database from '../backend/database.js';

const db = new Database('./../backend/db.sqlite');

const app = express();
const args = minimist(process.argv.slice(2));
const port = process.env.SERVER_PORT || args.p || 3000;

// populate swaggerOptions version with the version from package.json, read file
const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));
swaggerOptions.swaggerDefinition.info.version = packageJson.version;

swaggerOptions.swaggerDefinition.servers.push({ url: `http://localhost:${port}`, description: 'Local Server' });

const swaggerDocs = swaggerJsDoc(swaggerOptions);
//app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Connect to SQLite database
/*const db = new sqlite3.Database('../backend/db.sqlite', sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the ARC72 database.');
});*/

app.get('/nft-indexer/v1/tokens', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Response-Type', 'application/json');
    
    let response = {};

    db.db.get(`SELECT value FROM info WHERE key='syncRound'`, [], (err, row) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // Construct response
        response = {
            currentRound: Number(row.value),
        };
    });

    // Extract query parameters
    const round = req.query.round;
    const next = req.query.next??0;
    const limit = req.query.limit;
    const contractId = req.query.contractId;
    const tokenId = req.query.tokenId;
    const tokenIds = req.query.tokenIds;
    const approved = req.query.approved;
    const owner = req.query.owner;
    let mintMinRound = req.query['mint-min-round']??0;
    const mintMaxRound = req.query['mint-max-round'];

    if (next.length > 0) mintMinRound = Math.max(Number(next), Number(mintMinRound));

    // Construct SQL query
    let query = `SELECT * FROM tokens`;
    let conditions = [];
    let params = {};

    if (round) {
        conditions.push(`mintRound = $round`);
        params.$round = round;
    }
    if (contractId) {
        conditions.push(`contractId = $contractId`);
        params.$contractId = contractId;
    }
    if (tokenId) {
        conditions.push(`tokenId = $tokenId`);
        params.$tokenId = tokenId;
    }
    if (owner) {
        if (Array.isArray(owner)) {
            // If owner is an array, use the IN operator
            const placeholders = owner.map((_, i) => `$owner${i}`);
            conditions.push(`owner IN (${placeholders.join(', ')})`);
            owner.forEach((addr, i) => {
                params[`$owner${i}`] = addr;
            });
        } else {
            // If owner is a single value, use the = operator
            conditions.push(`owner = $owner`);
            params.$owner = owner;
        }
    }
    if (tokenIds) {
        const ids = tokenIds.split(',');
        if (Array.isArray(ids)) {
            conditions.push(`(contractId || '_' || tokenId) IN (${ids.map((_, i) => `$tokenId${i}`).join(',')})`);
            ids.forEach((t, i) => {
                params[`$tokenId${i}`] = t;
            });
        }
    }
    if (approved) {
        conditions.push(`approved = $approved`);
        params.$approved = approved;
    }
    if (mintMinRound > 0) {
        conditions.push(`mintRound >= $mintMinRound`);
        params.$mintMinRound = mintMinRound;
    }
    if (mintMaxRound) {
        conditions.push(`mintRound <= $mintMaxRound`);
        params.$mintMaxRound = mintMaxRound;
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY mintRound ASC`;

    if (limit) {
        query += ` LIMIT $limit`;
        params.$limit = limit;
    }

    // Execute query
    db.db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // for all rows, change remove tokenIndex and change mintRound to mint-round
        rows.forEach((row) => {
            delete row.tokenIndex;
            row.contractId = Number(row.contractId);
            row.tokenId = Number(row.tokenId);
            row['mint-round'] = row.mintRound;
            delete row.mintRound;

            /*try {
                row.metadata = JSON.parse(row.metadata);
            } catch (err) {
                // leave metadata as a string
            }*/
        });

        // get round of last row
        let maxRound = 0;
        if (rows.length > 0) {
            maxRound = rows[rows.length-1]['mint-round'];
        }
        
        // Format and send response
        response.tokens = rows;
        response['next-token'] = maxRound+1;
        res.status(200).json(response);

        // Log date/time, ip address, query
        const date = new Date();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`);
    });
});

app.get('/nft-indexer/v1/transfers', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Response-Type', 'application/json');

    // Extract query parameters
    const round = req.query.round;
    const next = req.query.next??0;
    const limit = req.query.limit;
    const contractId = req.query.contractId;
    const tokenId = req.query.tokenId;
    const user = req.query.user;
    const from = req.query.from;
    const to = req.query.to;
    let minRound = req.query['min-round']??0;
    const maxRound = req.query['max-round'];

    if (next.length > 0) minRound = Math.max(Number(next), Number(minRound));
    
    // Base query
    let query = `SELECT * FROM transfers`;

    // Conditions array
    let conditions = [];
    let params = {};

    // Add conditions based on query parameters
    if (round) {
        conditions.push(`round = $round`);
        params.$round = round;
    }
    if (contractId) {
        conditions.push(`contractId = $contractId`);
        params.$contractId = contractId;
    }
    if (tokenId) {
        conditions.push(`tokenId = $tokenId`);
        params.$tokenId = tokenId;
    }
    if (user) {
        conditions.push(`(fromAddr = $user OR toAddr = $user)`);
        params.$user = user;
    }
    if (from) {
        conditions.push(`fromAddr = $from`);
        params.$from = from;
    }
    if (to) {
        conditions.push(`toAddr = $to`);
        params.$to = to;
    }
    if (minRound) {
        conditions.push(`round >= $minRound`);
        params.$minRound = minRound;
    }
    if (maxRound) {
        conditions.push(`round <= $maxRound`);
        params.$maxRound = maxRound;
    }

    // Append conditions to the query
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY round ASC';

    // Add limit and pagination logic (if applicable)
    if (limit) {
        query += ' LIMIT $limit';
        params.$limit = limit;
    }

    // Execute query
    db.db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ message: "Error in database operation" });
        } else {
            rows.forEach((row) => {
                row.contractId = Number(row.contractId);
                row.tokenId = Number(row.tokenId);
                delete row.amount;
            }); 

            // get round of last row
            let maxRound = 0;
            if (rows.length > 0) {
                maxRound = rows[rows.length-1].round;
            }

            const response = {
                transfers: rows,
                currentRound: round,
            };
            response['next-token'] = maxRound+1;

            res.status(200).json(response);
        }

        // Log date/time, ip address, query
        const date = new Date();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`);

    });
});

app.get('/nft-indexer/v1/collections', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Response-Type', 'application/json');

    let response = {};

    db.db.get(`SELECT value FROM info WHERE key='syncRound'`, [], (err, row) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // Construct response
        response = {
            ['current-round']: Number(row.value),
        };
    });

    // Extract query parameters
    const contractId = req.query.contractId;
    const mintRound = req.query['mint-round'];
    const minTotalSupply = req.query['min-total-supply'];
    const maxTotalSupply = req.query['max-total-supply'];
    const mintMinRound = req.query['mint-min-round']??0;
    const mintMaxRound = req.query['mint-max-round'];
    const creator = req.query.creator;
    const next = req.query.next??0;
    const limit = req.query.limit;

    // "includes" is a query parameter that can be used to include additional data in the response
    const includes = req.query.includes?.split(',')??[];

    // Construct SQL query
    let query = `SELECT * FROM collections`;
    let conditions = [];
    let params = {};

    if (contractId) {
        conditions.push(`contractId = $contractId`);
        params.$contractId = contractId;
    }

    if (mintRound) {
        conditions.push(`createRound = $mintRound`);
        params.$mintRound = mintRound;
    }

    if (mintMinRound > 0) {
        conditions.push(`createRound >= $mintMinRound`);
        params.$mintMinRound = mintMinRound;
    }

    if (mintMaxRound) {
        conditions.push(`createRound <= $mintMaxRound`);
        params.$mintMaxRound = mintMaxRound;
    }

    if (minTotalSupply) {
        conditions.push(`totalSupply >= $minTotalSupply`);
        params.$minTotalSupply = minTotalSupply;
    }

    if (maxTotalSupply) {
        conditions.push(`totalSupply <= $maxTotalSupply`);
        params.$maxTotalSupply = maxTotalSupply;
    }

    if (creator) {
        conditions.push(`creator = $creator`);
        params.$creator = creator;
    }

    if (next) {
        conditions.push(`createRound >= $next`);
        params.$next = next;
    }

    conditions.push(`isBlacklisted = '0'`);

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY createRound ASC`;

    if (limit) {
        query += ` LIMIT $limit`;
        params.$limit = limit;
    }

    // Execute query
    const rows = await db.all(query, params);

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        row.contractId = Number(row.contractId);
        row.totalSupply = Number(row.totalSupply);
        row.mintRound = Number(row.createRound);
        row.globalState = JSON.parse(row?.globalState??"{}");
        delete row.lastSyncRound;
        delete row.createRound;

        const tokens = await db.get(`SELECT * FROM tokens WHERE contractId = ? AND tokenIndex = 0`, [row.contractId]);
        if (tokens) {
            row.firstToken = {
                contractId: Number(tokens.contractId),
                tokenId: Number(tokens.tokenId),
                owner: tokens.owner,
                metadataURI: tokens.metadataURI,
                metadata: tokens.metadata,
                approved: tokens.approved,
            };
        }
        else {
            row.firstToken = null;
        }

        if (includes.includes('unique-owners')) {
            const uniqueOwners = await db.get(`SELECT COUNT(DISTINCT owner) as uniqueOwners FROM tokens WHERE contractId = ?`, [row.contractId]);
            row.uniqueOwners = uniqueOwners.uniqueOwners;
        }
    }

    // get round of last row
    let maxRound = 0;
    if (rows.length > 0) {
        maxRound = rows[rows.length-1].mintRound;
    }

    response['collections'] = rows;
    response['next-token'] = maxRound+1;
    res.status(200).json(response);

    // Log date/time, ip address, query
    const date = new Date();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`);

});

app.get('/nft-indexer/v1/mp/markets', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Response-Type', 'application/json');

    // Extract query parameters
    const mpContractId = req.query.mpContractId;
    const version = req.query.version;
    const next = req.query.next??0;
    const limit = req.query.limit;

    // Construct SQL query
    let query = `SELECT * FROM markets`;
    let conditions = [];
    let params = {};

    if (mpContractId) {
        conditions.push(`mpContractId = $mpContractId`);
        params.$mpContractId = mpContractId;
    }

    if (version) {
        conditions.push(`version = $version`);
        params.$version = version;
    }

    if (next) {
        conditions.push(`createRound >= $next`);
        params.$next = next;
    }

    conditions.push(`isBlacklisted = '0'`);

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY createRound ASC`;

    if (limit) {
        query += ` LIMIT $limit`;
        params.$limit = limit;
    }

    // Execute query
    db.db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // for all rows, change remove tokenIndex and change mintRound to mint-round
        rows.forEach((row) => {
            row.mpContractId = Number(row.mpContractId);
            row.mpListingId = Number(row.mpListingId);
            row.contractId = Number(row.contractId);
            row.createRound = Number(row.createRound);
            row.version = Number(row.version);
            delete row.lastSyncRound;
        });

        // get round of last row
        let maxRound = 0;
        if (rows.length > 0) {
            maxRound = rows[rows.length-1].createRound;
        }

        const response = {
            markets: rows,
        };
        response['next-token'] = maxRound+1;

        res.status(200).json(response);
    });

    // Log date/time, ip address, query
    const date = new Date();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`);
});

app.get('/nft-indexer/v1/mp/listings', async (req, res) => {
    
    let response = {};

    db.db.get(`SELECT value FROM info WHERE key='syncRound'`, [], (err, row) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // Construct response
        response = {
            ['current-round']: Number(row.value),
        };
    });

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Response-Type', 'application/json');

    // Extract query parameters
    const transactionId = req.query.transactionId;
    const mpContractId = req.query.mpContractId;
    const mpListingId = req.query.mpListingId;
    const collectionId = req.query.collectionId;
    const tokenId = req.query.tokenId;
    const seller = req.query.seller;
    const escrowAddr = req.query['escrow-addr'];
    const minRound = req.query['min-round']??0;
    const maxRound = req.query['max-round'];
    const minPrice = req.query['min-price'];
    const maxPrice = req.query['max-price'];
    const minTime = req.query['min-time'];
    const maxTime = req.query['max-time'];
    const currency = req.query.currency;
    const active = req.query['active'];
    const sold = req.query['sold'];
    const deleted = req.query['deleted'];
    const next = req.query.next??0;
    const limit = req.query.limit;

    // Construct SQL query
    let query = `SELECT l.*,m.escrowAddr FROM listings l LEFT JOIN markets m ON l.mpContractId = m.mpContractId`;
    let conditions = [];
    let params = {};

    if (transactionId) {
        conditions.push(`transactionId = $transactionId`);
        params.$transactionId = transactionId;
    }

    if (mpContractId) {
        conditions.push(`l.mpContractId = $contractId`);
        params.$contractId = mpContractId;

        if (mpListingId) {
            conditions.push(`mpListingId = $listingId`);
            params.$listingId = mpListingId;
        }
    }

    if (collectionId) {
        conditions.push(`contractId = $collectionId`);
        params.$collectionId = collectionId;

        if (tokenId) {
            conditions.push(`tokenId = $tokenId`);
            params.$tokenId = tokenId;
        }
    }

    if (seller) {
        if (Array.isArray(seller)) {
            conditions.push(`seller IN (${seller.map((_, i) => `$seller${i}`).join(',')})`);
            seller.forEach((s, i) => {
                params[`$seller${i}`] = s;
            });
        } else {
            conditions.push(`seller = $seller`);
            params.$seller = seller;
        }
    }

    if (escrowAddr) {
        conditions.push(`m.escrowAddr = $escrowAddr`);
        params.$escrowAddr = escrowAddr;
    }

    if (minRound) {
        conditions.push(`l.createRound >= $minRound`);
        params.$minRound = minRound;
    }

    if (maxRound) {
        conditions.push(`l.createRound <= $maxRound`);
        params.$maxRound = maxRound;
    }

    if (minPrice) {
        conditions.push(`price >= $minPrice`);
        params.$minPrice = minPrice;
    }

    if (maxPrice) {
        conditions.push(`price <= $maxPrice`);
        params.$maxPrice = maxPrice;
    }

    if (minTime) {
        conditions.push(`createTimestamp >= $minTime`);
        params.$minTime = minTime;
    }

    if (maxTime) {
        conditions.push(`createTimestamp <= $maxTime`);
        params.$maxTime = maxTime;
    }

    if (currency) {
        conditions.push(`currency = $currency`);
        params.$currency = currency;
    }

    if (active == 'true') {
        conditions.push(`sales_id IS NULL AND delete_id IS NULL`);
    }
    else if (active == 'false') {
        conditions.push(`(sales_id IS NOT NULL OR delete_id IS NOT NULL)`);
    }

    if (sold == 'true') {
        conditions.push(`sales_id IS NOT NULL`);
    }
    else if (sold == 'false') {
        conditions.push(`sales_id IS NULL`);
    }

    if (deleted == 'true') {
        conditions.push(`delete_id IS NOT NULL`);
    }
    else if (deleted == 'false') {
        conditions.push(`delete_id IS NULL`);
    }

    if (next) {
        conditions.push(`l.createRound >= $next`);
        params.$next = next;
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY createRound ASC`;

    if (limit) {
        query += ` LIMIT $limit`;
        params.$limit = limit;
    }

    // Execute query
    const rows = await db.all(query, params);

    // for all rows, change remove tokenIndex and change mintRound to mint-round
    let listings = [];
    for(let i = 0; i < rows.length; i++) {
        const row = rows[i];

        row.token = await db.get(`SELECT * FROM tokens WHERE contractId = ? AND tokenId = ? AND owner = ? AND approved = ?`, [row.contractId, row.tokenId, row.seller, row.escrowAddr]);
        if (!row.token) {
            continue;
        }

        row.mpContractId = Number(row.mpContractId);
        row.mpListingId = Number(row.mpListingId);
        row.collectionId = Number(row.contractId);
        row.createRound = Number(row.createRound);
        row.tokenId = Number(row.tokenId);
        row.price = Number(row.price);
        row.currency = Number(row.currency);
        row.createRound = Number(row.createRound);

        row.sale = await db.get(`SELECT * FROM sales WHERE transactionId = ?`, [row.sales_id]);
        row.delete = await db.get(`SELECT * FROM deletes WHERE transactionId = ?`, [row.delete_id]);

        delete row.sales_id;
        delete row.delete_id;
        delete row.contractId;

        listings.push(row);
    }

    let mRound = 0;
    if (listings.length > 0) {
        mRound = listings[listings.length-1].createRound;
    }

    response['listings'] = listings;
    response['next-token'] = mRound+1;
    res.status(200).json(response);

    // Log date/time, ip address, query
    const date = new Date();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`);
});

app.get('/nft-indexer/v1/mp/sales', async (req, res) => {

    let response = {};

    db.db.get(`SELECT value FROM info WHERE key='syncRound'`, [], (err, row) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // Construct response
        response = {
            ['current-round']: Number(row.value),
        };
    });

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Response-Type', 'application/json');

    // Extract query parameters
    const transactionId = req.query.transactionId;
    const mpContractId = req.query.mpContractId;
    const mpListingId = req.query.mpListingId;
    const collectionId = req.query.collectionId;
    const tokenId = req.query.tokenId;
    const seller = req.query.seller;
    const buyer = req.query.buyer;
    const minRound = req.query['min-round']??0;
    const maxRound = req.query['max-round'];
    const minPrice = req.query['min-price'];
    const maxPrice = req.query['max-price'];
    const minTime = req.query['min-time'];
    const maxTime = req.query['max-time'];
    const currency = req.query.currency;
    const next = req.query.next??0;
    const limit = req.query.limit;
    const sort = req.query.sort;

    // Construct SQL query
    let query = `SELECT * FROM sales`;
    let conditions = [];
    let params = {};

    if (transactionId) {
        conditions.push(`transactionId = $transactionId`);
        params.$transactionId = transactionId;
    }

    if (mpContractId) {
        conditions.push(`mpContractId = $mpContractId`);
        params.$mpContractId = mpContractId;

        if (mpListingId) {
            conditions.push(`mpListingId = $mpListingId`);
            params.$mpListingId = mpListingId;
        }
    }

    if (collectionId) {
        conditions.push(`contractId = $collectionId`);
        params.$collectionId = collectionId;

        if (tokenId) {
            conditions.push(`tokenId = $tokenId`);
            params.$tokenId = tokenId;
        }
    }

    if (seller) {
        if (Array.isArray(seller)) {
            conditions.push(`seller IN (${seller.map((_, i) => `$seller${i}`).join(',')})`);
            seller.forEach((s, i) => {
                params[`$seller${i}`] = s;
            });
        } else {
            conditions.push(`seller = $seller`);
            params.$seller = seller;
        }
    }

    if (buyer) {
        if (Array.isArray(buyer)) {
            conditions.push(`buyer IN (${buyer.map((_, i) => `$buyer${i}`).join(',')})`);
            buyer.forEach((b, i) => {
                params[`$buyer${i}`] = b;
            });
        } else {
            conditions.push(`buyer = $buyer`);
            params.$buyer = buyer;
        }
    }
    
    if (minRound) {
        conditions.push(`round >= $minRound`);
        params.$minRound = minRound;
    }

    if (maxRound) {
        conditions.push(`round <= $maxRound`);
        params.$maxRound = maxRound;
    }

    if (minPrice) {
        conditions.push(`price >= $minPrice`);
        params.$minPrice = minPrice;
    }

    if (maxPrice) {
        conditions.push(`price <= $maxPrice`);
        params.$maxPrice = maxPrice;
    }

    if (minTime) {
        conditions.push(`timestamp >= $minTime`);
        params.$minTime = minTime;
    }

    if (maxTime) {
        conditions.push(`timestamp <= $maxTime`);
        params.$maxTime = maxTime;
    }

    if (currency) {
        conditions.push(`currency = $currency`);
        params.$currency = currency;
    }

    if (next) {
        conditions.push(`round >= $next`);
        params.$next = next;
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    const allowedColumns = ['round'];

    if (sort) {
        let direction = 'ASC';
        let column = sort;

        // If the sort string starts with a hyphen, remove it and set direction to 'DESC'
        if (sort.startsWith('-')) {
            column = sort.substring(1);
            direction = 'DESC';
        }

        if (allowedColumns.includes(column)) {
            query += ` ORDER BY ${column} ${direction}`;
        } else {
            ` ORDER BY round ASC`;
        }
    } else {
        query += ` ORDER BY round ASC`;
    }

    if (limit) {
        query += ` LIMIT $limit`;
        params.$limit = limit;
    }

    // Execute query
    const rows = await db.all(query, params);

    // for all rows, change remove tokenIndex and change mintRound to mint-round
    for(let i = 0; i < rows.length; i++) {
        const row = rows[i];

        row.mpContractId = Number(row.mpContractId);
        row.mpListingId = Number(row.mpListingId);
        row.collectionId = Number(row.contractId);
        row.tokenId = Number(row.tokenId);
        row.price = Number(row.price);
        row.currency = Number(row.currency);
        row.round = Number(row.round);
        
        row.listing = await db.get(`SELECT * FROM listings WHERE sales_id = ?`, [row.transactionId]);
        if (row.listing) {
            row.listing.mpContractId = Number(row.listing.mpContractId);
            row.listing.mpListingId = Number(row.listing.mpListingId);
            row.listing.collectionId = Number(row.listing.contractId);
            row.listing.createRound = Number(row.listing.createRound);
            row.listing.tokenId = Number(row.listing.tokenId);
            row.listing.price = Number(row.listing.price);
            row.listing.currency = Number(row.listing.currency);
            row.listing.createRound = Number(row.listing.createRound);
    
            delete row.listing.sales_id;
            delete row.listing.delete_id;
            delete row.listing.contractId;
        }

        delete row.contractId;
    }

    let mRound = 0;
    if (rows.length > 0) {
        mRound = rows[rows.length-1].round;
    }

    response.sales = rows
    response['next-token'] = mRound+1;
    res.status(200).json(response);

    // Log date/time, ip address, query
    const date = new Date();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`);
});

app.get('/stats', (req, res) => {
    db.db.all(`SELECT 
            c.contractId, 
            c.totalSupply, 
            c.createRound,
            COUNT(t.transactionId) AS totalTransfers, 
            COUNT(DISTINCT t.toAddr) AS uniqueOwners,
            (SELECT COUNT(*) FROM tokens WHERE contractId = c.contractId AND mintRound IS NOT NULL) AS totalMinted
        FROM 
            collections c
        LEFT JOIN 
            transfers t ON c.contractId = t.contractId
        GROUP BY 
            c.contractId`, [], (err, rows) => {
        
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // create an html table of stats and write to page
        let html = `<head>
                        <title>VoiNet ARC72 NFT Stats</title>
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                color: #333;
                                background-color: #f5f5f5;
                            }

                            table {
                                width: 100%;
                                border-collapse: collapse;
                                margin: 20px 0;
                                font-size: 0.9em;
                                min-width: 400px;
                                box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
                            }

                            table thead tr {
                                background-color: #009879;
                                color: #ffffff;
                                text-align: left;
                            }

                            table th, table td {
                                padding: 12px 15px;
                                text-align: left;
                            }

                            table tbody tr {
                                border-bottom: 1px solid #dddddd;
                            }

                            table tbody tr:nth-of-type(even) {
                                background-color: #f3f3f3;
                            }

                            table tbody tr:last-of-type {
                                border-bottom: 2px solid #009879;
                            }
                        </style>
                    </head>
                    <h1>VoiNet ARC72 NFT Stats</h1>`;

        html += `<table>
                <tr>
                    <th>Contract ID</th>
                    <th>Created</th>
                    <th>Total Supply</th>
                    <th>Tokens Minted</th>
                    <th>Total Transfers</th>
                    <th>Unique Owners</th>
                </tr>
                ${rows.map((collection) => {
                    return `
                        <tr>
                            <td><a href='https://voi.observer/explorer/application/${collection.contractId}/transactions' target='_blank'>${collection.contractId}</a></td>
                            <td><a href='https://voi.observer/explorer/block/${collection.createRound}' target='_blank'>${collection.createRound}</td>
                            <td>${collection.totalSupply}</a></td>
                            <td><a href='/nft-indexer/v1/tokens/?contractId=${collection.contractId}' target='_blank'>${collection.totalMinted}</a></td>
                            <td><a href='/nft-indexer/v1/transfers/?contractId=${collection.contractId}' target='_blank'>${collection.totalTransfers}</a></td>
                            <td>${collection.uniqueOwners}</td>
                        </tr>
                    `;
                }).join('')}
            </table>`;

        // get last sync round
        db.db.get(`SELECT value FROM info WHERE key='syncRound'`, [], (err, row) => {
            const syncRound = Number(row.value);
            html += `<p>Last sync round: ${syncRound}</p>`;
            res.send(html);
        });

    });
});

// /address endpoint showing list of all addresses that own tokens and the number of tokens they own
app.get('/address', (req, res) => {
    db.db.all(`SELECT owner, COUNT(*) AS total FROM tokens GROUP BY owner ORDER BY total DESC`, [], (err, rows) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // sort rows by total descending
        rows.sort((a, b) => {
            return b.total - a.total;
        });

        // create an html table of stats and write to page
        let html = `<head>
                        <title>VoiNet ARC72 NFT Owners</title>
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                color: #333;
                                background-color: #f5f5f5;
                            }

                            table {
                                width: 100%;
                                border-collapse: collapse;
                                margin: 20px 0;
                                font-size: 0.9em;
                                min-width: 400px;
                                box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
                            }

                            table thead tr {
                                background-color: #009879;
                                color: #ffffff;
                                text-align: left;
                            }

                            table th, table td {
                                padding: 12px 15px;
                                text-align: left;
                            }

                            table tbody tr {
                                border-bottom: 1px solid #dddddd;
                            }

                            table tbody tr:nth-of-type(even) {
                                background-color: #f3f3f3;
                            }

                            table tbody tr:last-of-type {
                                border-bottom: 2px solid #009879;
                            }
                        </style>
                    </head>
                    <h1>VoiNet ARC72 NFT Owners</h1>`;

        html += `<table>
                <tr>
                    <th>Address</th>
                    <th>Total Tokens Owned</th>
                </tr>
                ${rows.map((address) => {
                    return `
                        <tr>
                            <td><a href='/address/${address.owner}' target='_blank'>${address.owner}</a></td>
                            <td>${address.total}</td>
                        </tr>
                    `;
                }).join('')}
            </table>`;

        res.send(html);
    });
});

// /address:address endpoint to return an html page containing a table of all tokens owned by the address
app.get('/address/:address', (req, res) => {
    // get address from route parameters
    const address = req.params.address;

    // get all tokens owned by address
    db.db.all(`SELECT * FROM tokens WHERE owner = ?`, [address], (err, rows) => {
        if (err) {
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // create an html table of tokens and write to page
        let html = `<head>
                        <title>ARC-72 NFTs owned by Wallet: ${address}</title>
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                color: #333;
                                background-color: #f5f5f5;
                            }

                            table {
                                width: 100%;
                                border-collapse: collapse;
                                margin: 20px 0;
                                font-size: 0.9em;
                                min-width: 400px;
                                box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
                            }

                            table thead tr {
                                background-color: #009879;
                                color: #ffffff;
                                text-align: left;
                            }

                            table th, table td {
                                padding: 12px 15px;
                                text-align: left;
                            }

                            table tbody tr {
                                border-bottom: 1px solid #dddddd;
                            }

                            table tbody tr:nth-of-type(even) {
                                background-color: #f3f3f3;
                            }

                            table tbody tr:last-of-type {
                                border-bottom: 2px solid #009879;
                            }
                        </style>
                    </head>
                    <h1>ARC-72 NFTs owned by Wallet: ${address}</h1>`;

        html += `<table>
                <tr>
                    <th>Contract ID</th>
                    <th>Token ID</th>
                    <th>Image</th>
                </tr>
                ${rows.map((token) => {
                    const metadata = JSON.parse(token.metadata);
                    return `
                        <tr>
                            <td><a href='https://voi.observer/explorer/application/${token.contractId}/transactions' target='_blank'>${token.contractId}</a></td>
                            <td>${token.tokenId}</td>
                            <td><img src='${metadata.image}' height='300'/></td>
                        </tr>
                    `;
                }
                ).join('')}
            </table>`;
        res.send(html);
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Indexer API Server listening at http://localhost:${port}`);
    console.log(`API Docs: http://localhost:${port}/api-docs`);
    console.log(`Tokens Endpoint: http://localhost:${port}/nft-indexer/v1/tokens`);
    console.log(`Transfers Endpoint: http://localhost:${port}/nft-indexer/v1/transfers`);
});
