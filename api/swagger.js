export const swaggerOptions = {
    swaggerDefinition: {
      openapi: '3.0.0',
      info: {
        title: 'ARC-72 NFT Indexer API',
        description: `<p>This is an API for accessing ARC-72 NFT data based on the ARC-74 indexer specification at 
                      <a href="https://arc.algorand.foundation/ARCs/arc-0074" target="_blank">https://arc.algorand.foundation/ARCs/arc-0074</a>.
                      The endpoints described below are under active development and may change without notice.
                      Data is provided for informational purposes only and may not be accurate or complete. Use at your own risk.</p>
                      <p>Note: The current prototype server points to the VOI TestNet Network.</p>
                      <p>The full source and additional links are available at 
                      <a href="https://github.com/xarmian/arc72_indexer" target="_blank">https://github.com/xarmian/arc72_indexer</a></p>`,
      },
      servers: [
        {
          url: 'https://arc72-idx.nftnavigator.xyz',
          description: 'Prototype Server',
        },
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
                metadata: {
                  type: 'string',
                  description: 'The cached metadata of the NFT, should be JSON.'
                }
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
                firstToken: {
                  "$ref": "#/components/schemas/Token",
                  description: 'The first token in the collection, null if the collection is empty.'
                },
                globalState: {
                  type: 'array',
                  description: 'Array of global state key-value pairs'
                },
                isBlacklisted: {
                  type: 'boolean',
                  description: 'Whether the collection is blacklisted.'
                },
                creator: {
                  type: 'string',
                  description: 'The address of the creator of the collection.'
                },
              }
            },
            Listing: {
              type: 'object',
              properties: {
                transactionId: {
                  type: 'string',
                  description: 'The transaction ID of the listing'
                },
                mpContractId: {
                  type: 'string',
                  description: 'The ID of a Marketplace contract'
                },
                mpListingId: {
                  type: 'string',
                  description: 'The ID of a listing in the marketplace'
                },
                collectionId: {
                  type: 'string',
                  description: 'The contract ID of the collection being listed'
                },
                tokenId: {
                  type: 'string',
                  description: 'The ID of the token being listed'
                },
                seller: {
                  type: 'string',
                  description: 'The address of the seller'
                },
                price: {
                  type: 'integer',
                  description: 'The price of the listing'
                },
                currency: {
                  type: 'string',
                  description: 'The currency of the listing, 0 = Native Token, otherwise ASA or ARC-200 token ID'
                },
                createRound: {
                  type: 'integer',
                  description: 'The round the listing was created'
                },
                createTimestamp: {
                  type: 'integer',
                  description: 'The timestamp when the listing was created'
                },
                royalty: {
                  type: 'integer',
                  description: 'The royalty for the listing'
                },
              },
            },
            "Sale": {
              type: 'object',
              properties: {
                transactionId: {
                  type: 'string',
                  description: 'The transaction ID of the sale'
                },
                mpContractId: {
                  type: 'string',
                  description: 'The ID of a Marketplace contract'
                },
                mpListingId: {
                  type: 'string',
                  description: 'The ID of a listing in the marketplace'
                },
                collectionId: {
                  type: 'string',
                  description: 'The contract ID of the collection being sold'
                },
                tokenId: {
                  type: 'string',
                  description: 'The ID of the token being sold'
                },
                seller: {
                  type: 'string',
                  description: 'The address of the seller'
                },
                buyer: {
                  type: 'string',
                  description: 'The address of the buyer'
                },
                price: {
                  type: 'integer',
                  description: 'The price of the sale'
                },
                currency: {
                  type: 'string',
                  description: 'The currency of the sale, 0 = Native Token, otherwise ASA or ARC-200 token ID'
                },
                round: {
                  type: 'integer',
                  description: 'The round of the sale'
                },
                createTimestamp: {
                  type: 'integer',
                  description: 'The timestamp of the sale'
                },
                listing: {
                  "$ref": "#/components/schemas/Listing",
                  description: 'The listing of the sale'
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
 *       name: mint-min-round
 *       schema:
 *         type: integer
 *         description: Include results to collections minted on or after the given round.
 *     - in: query
 *       name: mint-min-round
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

/**
 * @swagger
 * /nft-indexer/v1/mp/listings:
 *  get:
 *   summary: Retrieves marketplace listings
 *   description: Fetch marketplace listing details based on query parameters (this is a NON-STANDARD endpoint)
 *   parameters:
 *     - in: query
 *       name: mpContractId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given Marketplace contractId
 *     - in: query
 *       name: mpListingId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given Marketplace listingId (requires mpContractId)
 *     - in: query
 *       name: collectionId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given collectionId
 *     - in: query
 *       name: tokenId
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the given tokenId (requires collectionId)
 *     - in: query
 *       name: seller
 *       schema:
 *         type: string
 *         description: Limit to only the listings with the given seller
 *     - in: query
 *       name: min-round
 *       schema:
 *         type: integer
 *         description: Include results to listings created on or after the given round.
 *     - in: query
 *       name: max-round
 *       schema:
 *         type: integer
 *         description: Include results to listings created on or before the given round.
 *     - in: query
 *       name: min-price
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the price greater than or equal to the given price
 *     - in: query
 *       name: max-price
 *       schema:
 *         type: integer
 *         description: Limit to only the listings with the price less than or equal to the given price
 *     - in: query
 *       name: currency
 *       schema:
 *         type: string
 *         description: Limit to only the listings with the given currency
 *     - in: query
 *       name: active
 *       schema:
 *         type: boolean
 *         description: Limit to only the active listings
 *     - in: query
 *       name: sold
 *       schema:
 *         type: boolean
 *         description: Limit to only sold listings
 *     - in: query
 *       name: deleted
 *       schema:
 *         type: boolean
 *         description: Limit to only deleted listings
 *     - in: query
 *       name: next
 *       schema:
 *         type: string
 *         description: Token for the next page of results. Use the next-token provided by the previous page of results.
 *   responses:
 *     200:
 *       description: A successful response
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               listings:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Listing'
 *               current-round:
 *                 type: integer
 *               next-token:
 *                 type: string
 *     400:
 *       description: Bad request
 *     500:
 *       description: Server error 
 */

/**
 * @swagger
 * /nft-indexer/v1/mp/sales:
 *  get:
 *   summary: Retrieves marketplace sales
 *   description: Fetch marketplace sales details based on query parameters (this is a NON-STANDARD endpoint)
 *   parameters:
 *     - in: query
 *       name: mpContractId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given Marketplace contractId
 *     - in: query
 *       name: mpListingId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given Marketplace listingId (requires mpContractId)
 *     - in: query
 *       name: collectionId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given collectionId
 *     - in: query
 *       name: tokenId
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the given tokenId (requires collectionId)
 *     - in: query
 *       name: seller
 *       schema:
 *         type: string
 *         description: Limit to only the sales with the given seller
 *     - in: query
 *       name: buyer
 *       schema:
 *         type: string
 *         description: Limit to only the sales with the given buyer
 *     - in: query
 *       name: min-round
 *       schema:
 *         type: integer
 *         description: Include results to listings created on or after the given round.
 *     - in: query
 *       name: max-round
 *       schema:
 *         type: integer
 *         description: Include results to listings created on or before the given round.
 *     - in: query
 *       name: min-price
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the price greater than or equal to the given price
 *     - in: query
 *       name: max-price
 *       schema:
 *         type: integer
 *         description: Limit to only the sales with the price less than or equal to the given price
 *     - in: query
 *       name: min-time
 *       schema:
 *         type: integer
 *         description: Limit to only the sales which occurred on or after the given timestamp
 *     - in: query
 *       name: max-time
 *       schema:
 *         type: integer
 *         description: Limit to only the sales which occurred on or before the given timestamp
 *     - in: query
 *       name: sort
 *       schema:
 *         type: string
 *         description: "Sort by a given field, currently supports 'round'. Use '-' to sort in descending order. Example: sort=-round. NOTE: next token does not work with this option."
 *     - in: query
 *       name: currency
 *       schema:
 *         type: string
 *         description: Limit to only the sales with the given currency
 *     - in: query
 *       name: next
 *       schema:
 *         type: string
 *         description: Token for the next page of results. Use the next-token provided by the previous page of results.
 *   responses:
 *     200:
 *       description: A successful response
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               listings:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Sale'
 *               current-round:
 *                 type: integer
 *               next-token:
 *                 type: string
 *     400:
 *       description: Bad request
 *     500:
 *       description: Server error 
 */
