## ARC-72 Indexer Prototype for the AVM (Algorand Virtual Machine)

### Includes:
* Block follower to extract token information and transfers from the blockchain
and write the applicable data to a SQLite3 database
* API front end to accept and respond to requests
* API Documentation using SwaggerUI

### Production Links
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
