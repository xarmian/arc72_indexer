const zeroAddress =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

function intersect(a, b) {
  var setB = new Set(b);
  return [...new Set(a)].filter(x => setB.has(x));
}

/**
 * @swagger
 * /nft-indexer/v1/arc200/tokens:
 *  get:
 *   summary: Retrieves arc200 token data
 *   description: Fetch arc200 token details based on query parameters (this is a NON-STANDARD endpoint)
 *   parameters:
 *     - in: query
 *       name: contractId
 *       schema:
 *         type: integer
 *         description: Limit to only results with the given contractId
 *     - in: query
 *       name: holder
 *       schema:
 *         type: string
 *         description: Include results where the given wallet address is the holder of the token
 *     - in: query
 *       name: mint-min-round
 *       schema:
 *         type: integer
 *         description: Include results minted on or after the given round.
 *     - in: query
 *       name: mint-min-round
 *       schema:
 *         type: integer
 *         description: Include results minted on or before the given round.
 *     - in: query
 *       name: next
 *       schema:
 *         type: string
 *         description: Token for the next page of results. Use the next-token provided by the previous page of results.
 *     - in: query
 *       name: limit
 *       schema:
 *         type: integer
 *         description: Maximum number of results to return. There could be additional pages even if the limit is not reached.
 *     - in: query
 *       name: includes
 *       schema:
 *         type: string
 *         description: Comma separated list of additional properties to include in the response.
 *     - in: query
 *       name: creator
 *       schema:
 *         type: string
 *         description: Wallet address of the creator of the collection
 *   responses:
 *     200:
 *       description: A successful response
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               collection:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Collection'
 *               current-round:
 *                 type: integer
 *               next-token:
 *                 type: string
 *     400:
 *       description: Bad request
 *     500:
 *       description: Server error
 */

// SELECT contracts_0200.*, 
//   COUNT(accounts_0200.accountId) AS accounts,
//   COUNT(transfers_0200.transactionId) AS transfers,
//   COUNT(approvals_0200.transactionId) AS approvals
// FROM contracts_0200
// LEFT JOIN accounts_0200 ON contracts_0200.contractId = accounts_0200.contractId
// LEFT JOIN transfers_0200 ON contracts_0200.contractId = transfers_0200.contractId
// LEFT JOIN approvals_0200 ON contracts_0200.contractId = approvals_0200.contractId
// GROUP BY contracts_0200.contractId;

export const contracts0200Endpoint = async (req, res, db) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Response-Type", "application/json");

  let response = {};

  db.db.get(`SELECT value FROM info WHERE key='syncRound'`, [], (err, row) => {
    if (err) {
      res.status(500).json({ message: "Error querying the database" });
      return;
    }

    // Construct response
    response = {
      ["current-round"]: Number(row.value),
    };
  });

  // Extract query parameters
  const contractId = req.query.contractId;
  const holder = req.query.holder;
  const mintRound = req.query["mint-round"];
  const mintMinRound = req.query["mint-min-round"] ?? 0;
  const mintMaxRound = req.query["mint-max-round"];
  const creator = req.query.creator;
  const next = req.query.next ?? 0;
  const limit = req.query.limit;

  // "includes" is a query parameter that can be used to include additional data in the response
  const includes = req.query.includes?.split(",") ?? [];

  const prefixes = ['accounts', 'transfers', 'approvals'];

  // Construct SQL query

  let query = "";
  let conditions = [];
  let params = {};

  if (!intersect(includes, prefixes)) {
    query += `SELECT * FROM contracts_0200 `;
  } else {
    query += "SELECT contracts_0200.* "
    prefixes.forEach(prefix => {
      if (includes.some(str => [prefix, 'all'].includes(str))) {
        query += `, COUNT(${prefix}_0200.contractId) AS ${prefix} `
      }
    })
    query += " FROM contracts_0200 "
    prefixes.forEach(prefix => {
      if (includes.some(str => [prefix, 'all'].includes(str))) {
        query += ` LEFT JOIN ${prefix}_0200 ON contracts_0200.contractId = ${prefix}_0200.contractId `
      }
    })
  }

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
    query += ` WHERE ` + conditions.join(" AND ");
  }

  if (intersect(includes, prefixes)) {
    query += ` GROUP BY contracts_0200.contractId`;
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
    row.mintRound = Number(row.createRound);
    row.globalState = JSON.parse(row?.globalState ?? "{}");
    delete row.lastSyncRound;
    delete row.createRound;
  }

  // get round of last row
  let maxRound = 0;
  if (rows.length > 0) {
    maxRound = rows[rows.length - 1].mintRound;
  }

  response["tokens"] = rows;
  response["next-token"] = maxRound + 1;
  res.status(200).json(response);

  // Log date/time, ip address, query
  const date = new Date();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log(
    `${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`
  );
};
