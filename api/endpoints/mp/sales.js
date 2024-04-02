/**
 * @swagger
 * /nft-indexer/v1/mp/sales:
 *  get:
 *   summary: Retrieves marketplace sales
 *   description: Fetch marketplace sales details based on query parameters (this is a NON-STANDARD endpoint)
 *   parameters:
 *     - in: query
 *       name: mpContractId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given Marketplace contractId
 *     - in: query
 *       name: mpListingId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given Marketplace listingId (requires mpContractId)
 *     - in: query
 *       name: collectionId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given collectionId (also accepts array of integers)
 *     - in: query
 *       name: tokenId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given tokenId (requires collectionId) (also accepts array of integers)
 *     - in: query
 *       name: seller
 *       schema:
 *         type: string
 *         description: Limit to only the sales with the given seller (also accepts array of strings)
 *     - in: query
 *       name: buyer
 *       schema:
 *         type: string
 *         description: Limit to only the sales with the given buyer (also accepts array of strings)
 *     - in: query
 *       name: min-round
 *       schema:
 *         type: integer
 *         description: Include results to listings created on or after the given round.
 *     - in: query
 *       name: max-round
 *       schema:
 *         type: integer
 *         description: Include results to listings created on or before the given round.
 *     - in: query
 *       name: min-price
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the price greater than or equal to the given price
 *     - in: query
 *       name: max-price
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the price less than or equal to the given price
 *     - in: query
 *       name: min-time
 *       schema:
 *         type: integer
 *         description: Limit to only the sales which occurred on or after the given timestamp
 *     - in: query
 *       name: max-time
 *       schema:
 *         type: integer
 *         description: Limit to only the sales which occurred on or before the given timestamp
 *     - in: query
 *       name: sort
 *       schema:
 *         type: string
 *         description: "Sort by a given field, currently supports 'round'. Use '-' to sort in descending order. Example: sort=-round. NOTE: next token does not work with this option."
 *     - in: query
 *       name: currency
 *       schema:
 *         type: string
 *         description: Limit to only the sales with the given currency
 *     - in: query
 *       name: next
 *       schema:
 *         type: string
 *         description: Token for the next page of results. Use the next-token provided by the previous page of results.
 *   responses:
 *     200:
 *       description: A successful response
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               listings:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Sale'
 *               current-round:
 *                 type: integer
 *               next-token:
 *                 type: string
 *     400:
 *       description: Bad request
 *     500:
 *       description: Server error 
 */
export const salesEndpoint = async (req, res, db) => {
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
        if (Array.isArray(collectionId)) {
            conditions.push(`contractId IN (${collectionId.map((_, i) => `$collectionId${i}`).join(',')})`);
            collectionId.forEach((c, i) => {
                params[`$collectionId${i}`] = c;
            });
        } else {
            conditions.push(`contractId = $collectionId`);
            params.$collectionId = collectionId;
        }

        if (tokenId) {
            if (Array.isArray(tokenId)) {
                conditions.push(`tokenId IN (${tokenId.map((_, i) => `$tokenId${i}`).join(',')})`);
                tokenId.forEach((t, i) => {
                    params[`$tokenId${i}`] = t;
                });
            }
            else {
                conditions.push(`tokenId = $tokenId`);
                params.$tokenId = tokenId;
            }
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
}