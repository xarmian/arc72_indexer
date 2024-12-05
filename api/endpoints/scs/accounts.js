/**
 * @swagger
 * /v1/scs/accounts:
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
 *       name: creator
 *       schema:
 *         type: string
 *         description: Include results where the given wallet address is the creator of the contract
 *     - in: query
 *       name: funder
 *       schema:
 *         type: string
 *         description: Include results where the given wallet address is the funder of the contract
 *     - in: query
 *       name: owner
 *       schema:
 *         type: string
 *         description: Include results where the given wallet address is the owner of the contract
 *     - in: query
 *       name: deleted
 *       schema:
 *         type: integer
 *         description: Include results where the given contract is deleted
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

export const scsAccountsEndpoint = async (req, res, db) => {
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
  const contractAddress = req.query.contractAddress;
  const parentId = req.query.parentId;
  const creator = req.query.creator;
  const funder = req.query.funder;
  const owner = req.query.owner;
  const delegate = req.query.delegate;
  const deployer = req.query.deployer;
  const operator = req.query.operator; // owner or delegate
  const createRound = req.query["create-round"];
  const minCreateRound = req.query["min-create-round"] ?? 0;
  const maxCreateRound = req.query["max-create-round"];
  const minDeadline = req.query["min-deadline"] ?? 0
  const maxDeadline = req.query["max-deadline"];
  const deleted = req.query.deleted;

  const next = req.query.next ?? 0;
  const limit = req.query.limit;

  const sortBy = req.query.sort_by || "contractId"; // Default sort field
  const sortOrder = req.query.sort_order || "desc"; // Default sort order

  // Sanitize input to prevent SQL injection
  const validSortFields = ["contractId"];
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
    c.*
FROM 
    contract_scsc c
    `;

  if (contractId) {
    conditions.push(`c.contractId = $contractId`);
    params.$contractId = contractId;
  }

  if (contractAddress) {
    conditions.push(`c.contractAddress = $contractAddress`);
    params.$contractAddress = contractAddress;
  }

  if (createRound) {
    conditions.push(`c.createRound = $createRound`);
    params.$createRound = createRound;
  }

  if (minCreateRound > 0) {
    conditions.push(`c.createRound >= $minCreateRound`);
    params.$minCreateRound = minCreateRound;
  }

  if (maxCreateRound) {
    conditions.push(`c.createRound <= $maxCreateRound`);
    params.$maxCreateRound = maxCreateRound;
  }

  if (minDeadline > 0) {
    conditions.push(`c.global_deadline >= $minDeadline`);
    params.$minDeadline = minDeadline;
  }

  if (maxDeadline) {
    conditions.push(`c.global_deadline <= $maxDeadline`);
    params.$maxCreateRound = maxCreateRound;
  }

  if (creator) {
    conditions.push(`c.creator = $creator`);
    params.$creator = creator;
  }

  if (parentId) {
    conditions.push(`c.global_parent_id = $parentId`);
    params.$parentId = parentId;
  }

  if (funder) {
    conditions.push(`c.global_funder = $funder`);
    params.$funder = funder;
  }

  if (owner) {
    conditions.push(`c.global_owner = $owner`);
    params.$owner = owner;
  }

  if (delegate) {
    conditions.push(`c.global_delegate = $delegate`);
    params.$delegate = delegate;
  }

  if (deployer) {
    conditions.push(`c.global_deployer = $deployer`);
    params.$deployer = deployer;
  }

  if (operator) {
    conditions.push(`(c.global_owner = $operator OR c.global_delegate = $operator)`);
    params.$operator = operator;
  }

  if (deleted == '1') {
  	conditions.push(`c.deleted = 1`);
  } else {

	conditions.push(`(c.deleted IS NULL OR c.deleted = 0)`);
  }

  if (next) {
    conditions.push(`c.createRound >= $next`);
    params.$next = next;
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  // if group by

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
    row.createRound = Number(row.createRound);
  }

  // get round of last row
  let maxRound = 0;
  if (rows.length > 0) {
    maxRound = rows[rows.length - 1].createRound;
  }

  response["accounts"] = rows;
  response["next-token"] = maxRound + 1;
  res.status(200).json(response);

  // Log date/time, ip address, query
  const date = new Date();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.error(
    `${date.toISOString()}: ${ip} ${query} ${JSON.stringify(params)}`
  );
};
