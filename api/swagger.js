export const swaggerOptions = {
    swaggerDefinition: {
      openapi: '3.0.0',
      info: {
        title: 'ARC-72 NFT Indexer API',
        description: 'API for accessing ARC-72 NFT data based on ARC-74 indexer specification at https://arc.algorand.foundation/ARCs/arc-0074',
      },
      servers: [
        {
          url: 'https://arc72-idx.voirewards.com',
          description: 'Prototype Server',
        },
      ],
      components: {
          schemas: {
            Token: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'The current owner of the NFT.'
                },
                approved: {
                  type: 'string',
                  description: 'The address that is approved to transfer the NFT.'
                },
                contractId: {
                  type: 'integer',
                  description: 'The ID of the ARC-72 contract that defines the NFT.'
                },
                tokenId: {
                  type: 'integer',
                  description: 'The tokenID of the NFT, which along with the contractId addresses a unique ARC-72 token.'
                },
                mintRound: {
                  type: 'integer',
                  description: 'The round at which the NFT was minted.'
                },
                metadataURI: {
                  type: 'string',
                  description: 'The URI given for the token by the metadataURI API of the contract.'
                },
              }
            },
            Transfer: {
              type: 'object',
              properties: {
                contractId: {
                  type: 'string',
                  description: 'The ID of the ARC-72 contract that defines the NFT.'
                },
                tokenId: {
                  type: 'string',
                  description: 'The tokenID of the NFT, which along with the contractId addresses a unique ARC-72 token.'
                },
                from: {
                  type: 'string',
                  description: 'The sender of the transaction.'
                },
                to: {
                  type: 'string',
                  description: 'The receiver of the transaction.'
                },
                round: {
                  type: 'integer',
                  description: 'The round of the transfer.'
                },
                transactionId: {
                  type: 'string',
                  description: 'The unique identifier of the transaction.'
                },
                timestamp: {
                  type: 'integer',
                  format: 'int64',
                  description: 'Timestamp of the transaction.'
                },
              }
            },
            Collection: {
              type: 'object',
              properties: {
                contractId: {
                  type: 'string',
                  description: 'The ID of the ARC-72 contract that defines the NFT collection.'
                },
                totalSupply: {
                  type: 'integer',
                  description: 'The total number of tokens minted by the contract.'
                },
                mintRound: {
                  type: 'integer',
                  description: 'The round at which the NFT collection contract was created.'
                },
              }
            }
          }
      }
    },
    apis: ['./swagger.js'],
  };
  
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
 *         description: Include results for the specified round. For performance reasons, this parameter may be disabled on some configurations.
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
 *         description: Include results for the specified round. For performance reasons, this parameter may be disabled on some configurations.
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

/**
 * @swagger
 * /nft-indexer/v1/collections:
 *  get:
 *   summary: Retrieves collection data
 *   description: Fetch collection details based on query parameters (this is a NON-STANDARD endpoint)
 *   parameters:
 *     - in: query
 *       name: contractId
 *       schema:
 *         type: integer
 *         description: Limit to only the collection with the given contractId
 *     - in: query
 *       name: min-mint-round
 *       schema:
 *         type: integer
 *         description: Include results to collections minted on or after the given round.
 *     - in: query
 *       name: max-mint-round
 *       schema:
 *         type: integer
 *         description: Include results to collections minted on or before the given round.
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
