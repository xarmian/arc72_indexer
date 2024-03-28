export const marketsEndpoint = async (req, res, db) => {
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
}