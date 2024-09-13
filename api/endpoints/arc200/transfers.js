/**
 * @swagger
 * /nft-indexer/v1/arc200/transfers:
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
 *         description: Limit results to arc200 token with matching contract ID.
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
 *         name: min-timestamp
 *         schema:
 *           type: integer
 *         description: Limit results to transfers made on or after the given timestamp.
 *       - in: query
 *         name: max-timestamp
 *         schema:
 *           type: integer
 *         description: Limit results to transfers made on or before the given timestamp.
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
export const arc200TransfersEndpoint = async (req, res, db) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Response-Type', 'application/json');

    // Extract query parameters
    const round = req.query.round;
    const next = req.query.next??0;
    const limit = req.query.limit??1000;
    const contractId = req.query.contractId;
    const user = req.query.user;
    const from = req.query.from;
    const to = req.query.to;
    let minRound = req.query['min-round']??0;
    const maxRound = req.query['max-round'];
    let minTimestamp = req.query['min-timestamp']??0;
    const maxTimestamp = req.query['max-timestamp'];

    if (next.length > 0) minRound = Math.max(Number(next), Number(minRound));
    
    // Base query
    let query = `SELECT * FROM transfers_0200`;

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
    if (user) {
        conditions.push(`(sender = $user OR receiver = $user)`);
        params.$user = user;
    }
    if (from) {
        conditions.push(`sender = $from`);
        params.$from = from;
    }
    if (to) {
        conditions.push(`receiver = $to`);
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
    if (minTimestamp) {
        conditions.push(`timestamp >= $minTimestamp`);
        params.$minTimestamp = minTimestamp;
    }
    if (maxTimestamp) {
        conditions.push(`timestamp <= $maxTimestamp`);
        params.$maxTimestamp = maxTimestamp;
    }

    // Append conditions to the query
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY round ASC';

    // Add limit and pagination logic (if applicable)
    if (limit > 0) {
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
		/*
                delete row.amount;
		*/
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
}
