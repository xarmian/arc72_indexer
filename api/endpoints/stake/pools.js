/**
 * @swagger
 * /nft-indexer/v1/stake/pools:
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

export const stakePoolsEndpoint = async (req, res, db) => {
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
  const poolId = req.query.poolId;
  const minContractId = req.query["min-contract-id"] ?? 0;
  const maxContractId = req.query["max-contract-id"];
  const tokenId = req.query["tokenId"]; // stake token id
  const createRound = req.query["create-round"];
  const minCreateRound = req.query["mint-min-round"] ?? 0;
  const maxCreateRound = req.query["mint-max-round"];
  const minStart = req.query["min-start"] ?? 0;
  const maxStart = req.query["max-start"];
  const minEnd = req.query["min-end"] ?? 0;
  const maxEnd = req.query["max-end"];

  const creator = req.query.creator;
  const next = req.query.next ?? 0;
  const limit = req.query.limit;

  const sortBy = req.query.sort_by || "poolId"; // Default sort field
  const sortOrder = req.query.sort_order || "desc"; // Default sort order

  // Sanitize input to prevent SQL injection
  const validSortFields = ["poolId", "createRound", "contractId"];
  if (!validSortFields.includes(sortBy)) {
    return res.status(400).send("Invalid sort field");
  }

  if (!["asc", "desc"].includes(sortOrder)) {
    return res.status(400).send("Invalid sort order");
  }

  // Construct SQL query

  let query = "";
  let conditions = [];
  let params = {};

  query += `
SELECT 
    p.contractId,
    p.poolId,
    p.poolProviderAddress as creator,
    p.poolStakeTokenId as stakeTokenId,
    p.poolStakedAmount as stakeAmount,
    p.poolStart as start,
    p.poolEnd as end,
    GROUP_CONCAT(sr.rewardTokenId, ', ') AS rewardTokenIds,
    GROUP_CONCAT(sr.rewardAmount, ', ') AS rewardAmounts,
    GROUP_CONCAT(sr.rewardRemaining, ', ') AS rewardRemainings
FROM 
    stake_pools p
INNER JOIN 
    stake_rewards sr
ON 
    p.contractId = sr.contractId AND p.poolId = sr.poolId
    `;

  if (contractId) {
    conditions.push(`p.contractId = $contractId`);
    params.$contractId = contractId;
  }

  if (poolId) {
    conditions.push(`p.poolId = $poolId`);
    params.$poolId = poolId;
  }

  if (minContractId > 0) {
    conditions.push(`p.contractId >= $minContractId`);
    params.$minContractId = minContractId;
  }

  if (maxContractId > 0) {
    conditions.push(`p.contractId <= $maxContractId`);
    params.$maxContractId = maxContractId;
  }

  if (createRound) {
    conditions.push(`p.createRound = $createRound`);
    params.$createRound = createRound;
  }

  if (minCreateRound > 0) {
    conditions.push(`p.createRound >= $minCreateRound`);
    params.$minCreateRound = minCreateRound;
  }

  if (maxCreateRound) {
    conditions.push(`p.createRound <= $maxCreateRound`);
    params.$maxCreateRound = maxCreateRound;
  }

  if (minStart > 0) {
    conditions.push(`p.startRound >= $minStart`);
    params.$minStart = minStart;
  }

  if (maxStart) {
    conditions.push(`p.startRound <= $maxStart`);
    params.$maxStart = maxStart;
  }

  if (minEnd > 0) {
    conditions.push(`p.endRound >= $minEnd`);
    params.$minEnd = minEnd;
  }

  if (maxEnd) {
    conditions.push(`p.endRound <= $maxEnd`);
    params.$maxEnd = maxEnd;
  }

  if (tokenId) {
    conditions.push(`p.poolStakeTokenId = $tokenId`);
    params.$tokenId = tokenId;
  }

  if (creator) {
    conditions.push(`c.poolProviderAddress = $creator`);
    params.$creator = creator;
  }

  if (next) {
    conditions.push(`c.createRound >= $next`);
    params.$next = next;
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += `
	GROUP BY 
    	p.contractId, p.poolId;
  `;

  query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

  if (limit) {
    query += ` LIMIT $limit`;
    params.$limit = limit;
  }

  // Execute query
  const rows = await db.all(query, params);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    row.contractId = Number(row.contractId);
    row.poolId = Number(row.poolId);
    row.createRound = Number(row.createRound);
  }

  // get round of last row
  let maxRound = 0;
  if (rows.length > 0) {
    maxRound = rows[rows.length - 1].createRound;
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