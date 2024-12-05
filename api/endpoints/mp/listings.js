/**
 * @swagger
 * /nft-indexer/v1/mp/listings:
 *  get:
 *   summary: Retrieves marketplace listings
 *   description: Fetch marketplace listing details based on query parameters (this is a NON-STANDARD endpoint)
 *   parameters:
 *     - in: query
 *       name: mpContractId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given Marketplace contractId
 *     - in: query
 *       name: mpListingId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given Marketplace listingId (requires mpContractId)
 *     - in: query
 *       name: collectionId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given collectionId (also accepts array of integers)
 *     - in: query
 *       name: tokenId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given tokenId (requires collectionId) (also accepts array of integers)
 *     - in: query
 *       name: seller
 *       schema:
 *         type: string
 *         description: Limit to only the listings with the given seller
 *     - in: query
 *       name: escrow-addr
 *       schema:
 *         type: string
 *         description: Limit to only the listings on marketplaces with the given escrow address
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
 *         description: Limit to only the listings with the price greater than or equal to the given price
 *     - in: query
 *       name: max-price
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the price less than or equal to the given price
  *     - in: query
 *       name: min-time
 *       schema:
 *         type: integer
 *         description: Limit to only the listings which occurred on or after the given timestamp
 *     - in: query
 *       name: max-time
 *       schema:
 *         type: integer
 *         description: Limit to only the listings which occurred on or before the given timestamp
*     - in: query
 *       name: currency
 *       schema:
 *         type: string
 *         description: Limit to only the listings with the given currency
 *     - in: query
 *       name: active
 *       schema:
 *         type: boolean
 *         description: Limit to only the active listings
 *     - in: query
 *       name: sold
 *       schema:
 *         type: boolean
 *         description: Limit to only sold listings
 *     - in: query
 *       name: deleted
 *       schema:
 *         type: boolean
 *         description: Limit to only deleted listings
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
 *                   $ref: '#/components/schemas/Listing'
 *               current-round:
 *                 type: integer
 *               next-token:
 *                 type: string
 *     400:
 *       description: Bad request
 *     500:
 *       description: Server error 
 */
export const listingsEndpoint = async (req, res, db) => {
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

        row.token = await db.get(`SELECT * FROM tokens WHERE contractId = ? AND tokenId = ? AND owner = ? AND approved = ?`, [row.contractId, row.tokenId, row.seller, row.escrowAddr]) ?? null;
        if (active == 'true' &&  !row.token) {
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

        row.sale = await db.get(`SELECT * FROM sales WHERE transactionId = ?`, [row.sales_id]) ?? null;
        row.delete = await db.get(`SELECT * FROM deletes WHERE transactionId = ?`, [row.delete_id]) ?? null;
	row.staking = await db.get(`SELECT * FROM contract_scsc WHERE contractId = ?`, [row.tokenId]) ?? null;

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
}
