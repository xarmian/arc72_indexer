const zeroAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

/**
 * @swagger
 * /nft-indexer/v1/tokens:
 *   get:
 *     summary: Retrieves NFT token data
 *     description: Fetch details of NFT tokens based on various query parameters
 *     parameters:
 *       - in: query
 *         name: round
 *         schema:
 *           type: integer
 *         description: Include the owner at the specified round and tokens minted on or after the specified round. Approved and other metadata is not round specific.
 *       - in: query
 *         name: next
 *         schema:
 *           type: string
 *         description: Token for the next page of results. Use the next-token provided by the previous page of results.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum number of results to return. There could be additional pages even if the limit is not reached.
 *       - in: query
 *         name: contractId
 *         schema:
 *           type: integer
 *         description: Limit results to NFTs implemented by the given contract ID.
 *       - in: query
 *         name: tokenId
 *         schema:
 *           type: integer
 *         description: Limit results to NFTs with the given token ID.
 *       - in: query
 *         name: owner
 *         schema:
 *           type: string
 *         description: Limit results to NFTs owned by the given owner.
 *       - in: query
 *         name: approved
 *         schema:
 *           type: string
 *         description: The address of the user that is approved to transfer the NFT.
 *       - in: query
 *         name: mint-min-round
 *         schema:
 *           type: integer
 *         description: Limit results to NFTs minted on or after the given round.
 *       - in: query
 *         name: mint-max-round
 *         schema:
 *           type: integer
 *         description: Limit results to NFTs minted on or before the given round.
 *     responses:
 *       200:
 *         description: A successful response with an array of tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Token'
 *                 current-round:
 *                   type: integer
 *                 next-token:
 *                   type: string
 *       400:
 *         description: Bad request due to invalid query parameters
 *       500:
 *         description: Server error
 */
export const tokensEndpoint = async (req, res, db) => {
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
    let query = `SELECT * FROM tokens t`;
    let conditions = [];
    let params = {};

    if (round) {
        query = `SELECT t.*,tr.toAddr FROM tokens t`;
        query += ` LEFT JOIN transfers tr ON t.contractId = tr.contractId AND t.tokenId = tr.tokenId
                    AND tr.round = (SELECT MAX(round) FROM transfers trx WHERE trx.contractId = t.contractId AND trx.tokenId = t.tokenId AND (trx.round <= $round) )`;

        conditions.push(`t.mintRound <= $round`);
        params.$round = round;
    }

    if (contractId) {
        conditions.push(`t.contractId = $contractId`);
        params.$contractId = contractId;
    }
    if (tokenId) {
        conditions.push(`t.tokenId = $tokenId`);
        params.$tokenId = tokenId;
    }
    if (owner) {
        if (Array.isArray(owner)) {
            // If owner is an array, use the IN operator
            const placeholders = owner.map((_, i) => `$owner${i}`);
            conditions.push(`t.owner IN (${placeholders.join(', ')})`);
            owner.forEach((addr, i) => {
                params[`$owner${i}`] = addr;
            });
        } else {
            // If owner is a single value, use the = operator
            conditions.push(`t.owner = $owner`);
            params.$owner = owner;
        }
    }
    if (tokenIds) {
        const ids = tokenIds.split(',');
        if (Array.isArray(ids)) {
            conditions.push(`(t.contractId || '_' || t.tokenId) IN (${ids.map((_, i) => `$tokenId${i}`).join(',')})`);
            ids.forEach((t, i) => {
                params[`$tokenId${i}`] = t;
            });
        }
    }
    if (approved) {
        conditions.push(`t.approved = $approved`);
        params.$approved = approved;
    }
    if (mintMinRound > 0) {
        conditions.push(`t.mintRound >= $mintMinRound`);
        params.$mintMinRound = mintMinRound;
    }
    if (mintMaxRound) {
        conditions.push(`t.mintRound <= $mintMaxRound`);
        params.$mintMaxRound = mintMaxRound;
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY t.mintRound ASC, t.contractId ASC, t.tokenId ASC`;

    if (limit) {
        query += ` LIMIT $limit`;
        params.$limit = limit;
    }

	
    // Execute query
    db.db.all(query, params, async (err, rows) => {
        if (err) {
            console.log(err);
            res.status(500).json({ message: 'Error querying the database' });
            return;
        }

        // for all rows, change remove tokenIndex and change mintRound to mint-round
	// Process each row asynchronously
    	for (const row of rows) {
        //rows.forEach((row) => {
            delete row.tokenIndex;
            row.contractId = Number(row.contractId);
            row.tokenId = Number(row.tokenId);
            row['mint-round'] = row.mintRound;
            delete row.mintRound;

    	    const staking = await db.get(`SELECT * FROM contract_scsc WHERE contractId = ?`, [row.tokenId]) ?? null;

	    const metadata = JSON.parse(row.metadata || "{}");
	    const collectionName = metadata.name ? String(metadata.name).replace(/[ ]?[#]?[0-9]*$/, "") : "Unknown";
	    row.collectionName = collectionName;

            // if a round is provided, find the owner at that round based on the last transfer that occurred on or before `round`
            if (round && row.toAddr) {
                row.owner = row.toAddr;
                delete row.toAddr;
            }

            row.isBurned = (row.owner == zeroAddress && (row.approved == null || row.approved == zeroAddress));

        }

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

};
