const zeroAddress =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

function intersect(a, b) {
  var setB = new Set(b);
  return [...new Set(a)].filter(x => setB.has(x));
}

/**
 * @swagger
 * /nft-indexer/v1/dex/pools:
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

export const dexPoolsEndpoint = async (req, res, db) => {
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
  const minContractId = req.query["min-contract-id"] ?? 0;
  const maxContractId = req.query["max-contract-id"];
  const tokenId = req.query["tokenId"];
  const mintRound = req.query["mint-round"];
  const mintMinRound = req.query["mint-min-round"] ?? 0;
  const mintMaxRound = req.query["mint-max-round"];
  const creator = req.query.creator;
  const next = req.query.next ?? 0;
  const limit = req.query.limit;

  const sortBy = req.query.sort_by || 'tvl'; // Default sort field
  const sortOrder = req.query.sort_order || 'desc'; // Default sort order

  // Sanitize input to prevent SQL injection
  const validSortFields = ['tvl', 'createRound', 'contractId'];
  if (!validSortFields.includes(sortBy)) {
        return res.status(400).send('Invalid sort field');
  }

  if (!['asc', 'desc'].includes(sortOrder)) {
        return res.status(400).send('Invalid sort order');
  }


  // Construct SQL query

  let query = "";
  let conditions = [];
  let params = {};
 
    query += `
SELECT 
    p.*,
    CASE
     WHEN CAST(tvlA AS REAL) < CAST(tvlB AS REAL) THEN CAST(tvlA as REAL) * 2
     ELSE CAST(tvlB as REAL) * 2
    END AS tvl,
    c.createRound as createRound,
    c.creator as creator
FROM 
    dex_pool p
INNER JOIN 
    contracts_0200 c
ON 
    p.contractId = c.contractId
    `;

  if (contractId) {
    conditions.push(`p.contractId = $contractId`);
    params.$contractId = contractId;
  }

  if (minContractId > 0) {
    conditions.push(`p.contractId >= $minContractId`);
    params.$minContractId = minContractId;
  }

  if (maxContractId > 0) {
    conditions.push(`p.contractId <= $maxContractId`);
    params.$maxContractId = maxContractId;
  }

  if (mintRound) {
    conditions.push(`c.createRound = $mintRound`);
    params.$mintRound = mintRound;
  }

  if (mintMinRound > 0) {
    conditions.push(`c.createRound >= $mintMinRound`);
    params.$mintMinRound = mintMinRound;
  }

  if (mintMaxRound) {
    conditions.push(`c.createRound <= $mintMaxRound`);
    params.$mintMaxRound = mintMaxRound;
  }

  if (tokenId) {
    conditions.push(`(p.tokAId = $tokenId OR p.tokBId = $tokenId)`);
    params.$tokenId = tokenId;
  }

  if (creator) {
    conditions.push(`c.creator = $creator`);
    params.$creator = creator;
  }

  if (next) {
    conditions.push(`c.createRound >= $next`);
    params.$next = next;
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`

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
    delete row.lastSyncRound;
    delete row.createRound;
  }

  // get round of last row
  let maxRound = 0;
  if (rows.length > 0) {
    maxRound = rows[rows.length - 1].mintRound;
  }

  response["pools"] = rows;
  response["next-token"] = maxRound + 1;
  res.status(200).json(response);

  // Log date/time, ip address, query
  const date = new Date();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.error(
    `${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`
  );
};
