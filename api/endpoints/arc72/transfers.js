/**
 * @swagger
 * /nft-indexer/v1/transfers:
 *   get:
 *     summary: Retrieves transfer data
 *     description: Fetch transfer details based on query parameters
 *     parameters:
 *       - in: query
 *         name: round
 *         schema:
 *           type: integer
 *         description: Include results for the specified round.
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
 *         name: user
 *         schema:
 *           type: string
 *         description: Limit results to transfers where the user is either the sender or receiver.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *         description: Limit results to transfers where the user is the sender.
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *         description: Limit results to transfers where the user is the receiver.
 *       - in: query
 *         name: min-round
 *         schema:
 *           type: integer
 *         description: Limit results to transfers made on or after the given round.
 *       - in: query
 *         name: max-round
 *         schema:
 *           type: integer
 *         description: Limit results to transfers made on or before the given round.
 *       - in: query
 *         name: min-time
 *         schema:
 *           type: integer
 *         description: Limit results to transfers which occurred on or after the given timestamp.
 *       - in: query
 *         name: max-time
 *         schema:
 *           type: integer
 *         description: Limit results to transfers which occurred on or before the given timestamp.
 *       - in: query
 *         name: includes
 *         schema:
 *           type: string
 *         description: Comma separated list of additional properties to include in the response (e.g. token).
 *     responses:
 *       200:
 *         description: A successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transfers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transfer'
 *                 current-round:
 *                   type: integer
 *                 next-token:
 *                   type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
export const transfersEndpoint = async (req, res, db) => {
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
    const minTime = req.query['min-time'];
    const maxTime = req.query['max-time'];
    const sort = (req.query['sort']??'ASC').toUpperCase();
    const includes = req.query.includes;

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
    if (minTime) {
        conditions.push(`timestamp >= $minTime`);
        params.$minTime = minTime;
    }
    if (maxTime) {
        conditions.push(`timestamp <= $maxTime`);
        params.$maxTime = maxTime;
    }

    // Append conditions to the query
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY round ${sort === 'DESC' ? 'DESC' : 'ASC'}`;

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
                row.tokenId = row.tokenId;
                delete row.amount;
            }); 

            // get round of last row
            let maxRound = 0;
            if (rows.length > 0) {
                maxRound = rows[rows.length-1].round;
            }

            if (includes && includes.includes('token')) {
                const tokens = rows.map(row => ({ tokenId: row.tokenId, contractId: row.contractId }));
                db.db.all(`SELECT * FROM tokens WHERE tokenId IN (${tokens.map(token => token.tokenId).join(',')}) AND contractId IN (${tokens.map(token => token.contractId).join(',')})`, [], (err, tokenRows) => {
                    if (err) {
                        res.status(500).json({ message: "Error in database operation" });
                    } else {
                        const tokenMap = {};
                        tokenRows.forEach((row) => {
                            tokenMap[`${row.tokenId}-${row.contractId}`] = {
                                contractId: Number(row.contractId),
                                tokenId: Number(row.tokenId),
                                tokenIndex: Number(row.tokenIndex),
                                owner: row.owner,
                                metadataURI: row.metadataURI,
                                metadata: row.metadata,
                                approved: row.approved,
                            };
                        });

                        rows.forEach((row) => {
                            row.token = tokenMap[`${row.tokenId}-${row.contractId}`];
                        });

                        res.status(200).json({
                            transfers: rows,
                            currentRound: round,
                            'next-token': maxRound+1,
                        });
                    }
                });
                return;
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
}