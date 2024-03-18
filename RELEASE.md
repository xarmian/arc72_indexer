## Release Notes

# 0.0.9 - 2024-03-18
* Backend
  * Add Marketplace Escrow Account to Marketplace Contract table (markets)
* API
  * Embed token object in /listings response
  * During /listings response, validate token.owner = listing.seller and token.approved = listing.escrow and omit invalid listings
* DB Changes -- added markets.escrowAddr column and index
# 0.0.8 - 2024-03-14
* API
  * Sort /sales response by Round
  * Add min-time and max-time to /listings endpoint, update swagger
# 0.0.7 - 2024-03-06
* API
  * Add `creator` address to /collections endpoint
  * Add `globalState` array to /collections endpoint
  * Add queryable parameter `creator` to /collections endpoint
  * Update api documentation
* Backend
  * Capture creator address from algorand indexer
  * Capture and decode global state from algorand indexer
  * Add --collections-metadata CLI argument to refresh.js to update only collection metadata for all collections in database
* DB Changes - added new columns and indexes
  * ALTER TABLE collections ADD COLUMN creator TEXT;
  * ALTER TABLE collections ADD COLUMN globalState TEXT;
  * CREATE INDEX idx_collections_createRound ON collections(createRound);
  * CREATE INDEX idx_collections_creator ON collections(creator);
  * CREATE INDEX idx_tokens_tokenId ON tokens(contractId, tokenId);
  * CREATE INDEX idx_tokens_owner ON tokens(owner);
  * CREATE INDEX idx_tokens_approved ON tokens(approved);
  * CREATE INDEX idx_tokens_mintRound ON tokens(mintRound);
  * DROP INDEX approved_idx;

# 0.0.6 - 2024-03-03
* Fix mint-min-round and mint-max-round for /collections endpoint
* Add `includes` query parameter to /collections endpoint
  * Comma-separated list of additional values to include in the response object
  * Currently only supports `unique-owners`
  * i.e. /collections/?includes=unique-owners
* Added `sold` (boolean) and `deleted` (boolean) query parameters to /listings endpoint
  * Returns listings that are sold/deleted or not sold/deleted
  * `/listings/?sold=false&deleted=false` is the same as `/listings/?active=true`

### v0.0.3
* Added `approved` query parameter to `/tokens` endpoint and `approved` parameter to token object
* Improved reliabilty of `owner` value on `/tokens` endpoint
* Improve description of project and link to repo in Swagger API Documentation
* Added this release notes document

### v0.0.2
* Initial public release