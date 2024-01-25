## ARC-72 NFT Indexer Prototype for the AVM (Algorand Virtual Machine)

### NOTICE
This application is provided without guarantee or warranty.
This is an ALPHA prototype of an ARC-72 NFT Indexer for AVM based networks
based on the ARC-74 specification found here:

https://arc.algorand.foundation/ARCs/arc-0074

### Includes:
* Block follower to extract token information and transfers from the blockchain
and write the applicable data to a SQLite3 database
* API front end to accept and respond to requests
* API Documentation using SwaggerUI

### Production Links
Production services below are deployed for the VoiNet network.
This includes a block follower and indexer API.

API Endpoints:
* Token Endpoint: https://arc72-idx.voirewards.com/nft-indexer/v1/tokens
* Transfers Endpoint: https://arc72-idx.voirewards.com/nft-indexer/v1/transfers

Additional Links:
* API Documentation (Swagger) - https://arc72-idx.voirewards.com/api-docs
* ARC72 NFT Stats (for testing) - https://arc72-idx.voirewards.com/stats

### Self Deployment Instructions
To operate the block-follower and populate the SQLite database:
```
npm i
npm run backend
```

To launch the API web service:
```
npm i
npm run api
```

The API server will launch by default on port 3000, i.e. http://localhost:3000.
To use an alternate port for the API server, pass the -p argument, such as:
```
npm run api -- -p 5101
```

### Things To Do
* Docker deployment
* Replace database backend (PostreSQL?)
* Improve API server logging
* Use a follower node instead of the public node

### Resources
* ARC-72 Specification - https://arc.algorand.foundation/ARCs/arc-0072
* ARC-74 Indexer Specification - https://arc.algorand.foundation/ARCs/arc-0074
