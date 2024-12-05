const appApprovalHash = "d71decf73ba8c1c5e34f7a124e1e7b393667fcae2d0f76f9d7b7217d53d5eab4";

/**
 * @swagger
 * /nft-indexer/v1/arc200/stubs/token:
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

export const arc200TokenStubEndpoint = async (req, res, db) => {
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
  const hash = req.query["hash"]; // app approval hash
  const active = req.query.active;
  const creator = req.query.creator;
  const next = req.query.next ?? 0;
  const limit = req.query.limit;

  const sortBy = req.query.sort_by || 'contractId'; // Default sort field
  const sortOrder = req.query.sort_order || 'desc'; // Default sort order

  // Sanitize input to prevent SQL injection
  const validSortFields = ['contractId', 'creator'];
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
    select p.*
    from contract_stubs p
    `;

  if (contractId) {
    conditions.push(`p.contractId = $contractId`);
    params.$contractId = contractId;
  }

  if (hash) {
    conditions.push(`p.hash = $hash`);
    params.$hash = hash;
  } else {
    conditions.push(`p.hash like $appApprovalHash`);
    params.$appApprovalHash = appApprovalHash;
  }

  if (active) {
    conditions.push(`p.active = $active`);
    params.$active = active;
  }

  if (creator) {
    conditions.push(`p.creator = $creator`);
    params.$creator = creator;
  }

  if (next) {
    conditions.push(`p.createRound >= $next`);
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
  }

  // get round of last row
  let maxRound = 0;
  if (rows.length > 0) {
    maxRound = rows[rows.length - 1].mintRound;
  }

  response["stubs"] = rows;
  response["next-token"] = maxRound + 1;
  res.status(200).json(response);

  // Log date/time, ip address, query
  const date = new Date();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.error(
    `${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`
  );
};
