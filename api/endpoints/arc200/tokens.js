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
  const verified = req.query.verified;

  // "includes" is a query parameter that can be used to include additional data in the response
  const includes = req.query.includes?.split(",") ?? [];

  // Construct SQL query

  let query = "";
  let conditions = [];
  let params = {};
 
    query += `
SELECT 
  c.contractId,
  c.name,
  c.symbol,
  c.decimals,
  c.totalSupply,
  c.creator,
  c.createRound,
  c.deleted
`;
if(includes.includes('all') || includes.includes("prices")) {
query += `
    ,p.price
`
}

if(includes.includes('all') || includes.includes("tokens")) {
query += `
    ,t.tokenId                         
`
}
if(includes.includes('all') || includes.includes("verify")) {
query += `
    ,v.verified
`
}
query += `
FROM 
    contracts_0200 c
`;
if(includes.includes('all') || includes.includes("tokens")) {
query += `
LEFT JOIN 
    (SELECT 
        t.contractId, 
        group_concat(t.tokenId) as tokenId
     FROM
        contract_tokens_0200 t 
     GROUP BY  
        t.contractId) t 
ON 
    c.contractId = t.contractId
`
}

if(includes.includes('all') || includes.includes("prices")) {
query += `
LEFT JOIN 
    prices_0200 p 
ON 
    c.contractId = p.contractId
`;
}
if(includes.includes('all') || includes.includes("verify")) {
query += `
LEFT JOIN 
    verification_requests v
ON 
    CAST(c.contractId AS TEXT) = v.assetId
`;
}

  if (contractId) {
    conditions.push(`c.contractId = $contractId`);
    params.$contractId = contractId;
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

  if (creator) {
    conditions.push(`c.creator = $creator`);
    params.$creator = creator;
  }

  if (next) {
    conditions.push(`c.createRound >= $next`);
    params.$next = next;
  }

  conditions.push(`isBlacklisted = '0'`);

  if((includes.includes('all') || includes.includes("verify")) && verified) {
    conditions.push(`v.verified = $verified`);
    params.$verified = verified;
  }

  conditions.push(`c.totalSupply <> '0'`);

  conditions.push(`c.deleted = 0`);

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += ` GROUP BY c.contractId`;

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


    row.change_1h = await db.get(`
WITH PriceData AS (
    SELECT 
        timestamp,
        price,
        ROW_NUMBER() OVER (ORDER BY timestamp DESC) AS rn
    FROM 
        price_history_0200
    WHERE 
        timestamp >= (strftime('%s', 'now') - 3600) AND contractId = ? 
)
SELECT 
    MAX(price) AS latest_price,
    MIN(price) AS earliest_price,
    CASE 
        WHEN MIN(price) IS NOT NULL AND MAX(price) IS NOT NULL 
        THEN (MAX(price) - MIN(price)) / MIN(price) * 100 
        ELSE NULL 
    END AS percent_change
FROM 
    PriceData;
`, [row.contractId]) ?? null;

    row.change_24h = await db.get(`
WITH PriceData AS (
    SELECT 
        timestamp,
        price,
        ROW_NUMBER() OVER (ORDER BY timestamp DESC) AS rn
    FROM 
        price_history_0200
    WHERE 
        timestamp >= (strftime('%s', 'now') - 86400) AND contractId = ? 
)
SELECT 
    MAX(price) AS latest_price,
    MIN(price) AS earliest_price,
    CASE 
        WHEN MIN(price) IS NOT NULL AND MAX(price) IS NOT NULL 
        THEN (MAX(price) - MIN(price)) / MIN(price) * 100 
        ELSE NULL 
    END AS percent_change
FROM 
    PriceData;
`, [row.contractId]) ?? null;


    row.change_7d = await db.get(`
WITH PriceData AS (
    SELECT 
        timestamp,
        price,
        ROW_NUMBER() OVER (ORDER BY timestamp DESC) AS rn
    FROM 
        price_history_0200
    WHERE 
        timestamp >= (strftime('%s', 'now') - 7 * 86400) AND contractId = ? 
)
SELECT 
    MAX(price) AS latest_price,
    MIN(price) AS earliest_price,
    CASE 
        WHEN MIN(price) IS NOT NULL AND MAX(price) IS NOT NULL 
        THEN (MAX(price) - MIN(price)) / MIN(price) * 100 
        ELSE NULL 
    END AS percent_change
FROM 
    PriceData;
`, [row.contractId]) ?? null;
    

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
