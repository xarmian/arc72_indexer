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
* Token Endpoint: https://arc72-idx.nftnavigator.xyz/nft-indexer/v1/tokens
* Transfers Endpoint: https://arc72-idx.nftnavigator.xyz/nft-indexer/v1/transfers

Additional Links:
* API Documentation (Swagger) - https://arc72-idx.nftnavigator.xyz/api-docs
* ARC72 NFT Stats (for testing) - https://arc72-idx.nftnavigator.xyz/stats

### Initialize Database
NOTE: SQLite3 is required to initialize the database. To install SQLite3 with APT package manager:
```
sudo apt-get install sqlite3
```

To initialize the database in the `db` folder:
```
npm run init-db
```

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
or use the environment variable API_SERVER_PORT, i.e.
```
API_SERVER_PORT=5101 npm run api
```

### Docker Deployment
```
docker-compose -f docker-compose-backend.yml up -d
docker-compose -f docker-compose-api.yml up -d
```

### Utilizing alternate Indexer and Node
By default the indexer utilizes the public Voi Indexer and Algod endpoints.
This can be modified using the following environment variables:

- `ALGOD_HOST` - AVM Node URL
- `ALGOD_TOKEN` - AVM Node access Token
- `INDEXER_HOST` - AVM Indexer URL
- `INDEXER_TOKEN` - AVM Indexer Token

These environment variables may be added to the Backend container compose file (docker-compose-backend.yml)
to scrape data from an alternative indexer and node, or can be pointed to a different chain altogether. 

NOTE: If changing the chain, make sure to delete or rename `/db/db.sqlite` and re-initialize the database!

### Things To Do
* Replace database backend (PostreSQL?)
* Improve API server logging
* Use a follower node instead of the public node

### Resources
* ARC-72 Specification - https://arc.algorand.foundation/ARCs/arc-0072
* ARC-74 Indexer Specification - https://arc.algorand.foundation/ARCs/arc-0074
