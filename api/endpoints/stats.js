export const statsEndpoint = async (req, res, db) => {
    db.db.all(`SELECT 
        c.contractId, 
        c.totalSupply, 
        c.createRound,
        COUNT(t.transactionId) AS totalTransfers, 
        COUNT(DISTINCT t.toAddr) AS uniqueOwners,
        (SELECT COUNT(*) FROM tokens WHERE contractId = c.contractId AND mintRound IS NOT NULL) AS totalMinted
    FROM 
        collections c
    LEFT JOIN 
        transfers t ON c.contractId = t.contractId
    GROUP BY 
        c.contractId`, [], (err, rows) => {

    if (err) {
        res.status(500).json({ message: 'Error querying the database' });
        return;
    }

    // create an html table of stats and write to page
    let html = `<head>
                    <title>VoiNet ARC72 NFT Stats</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            color: #333;
                            background-color: #f5f5f5;
                        }

                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin: 20px 0;
                            font-size: 0.9em;
                            min-width: 400px;
                            box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
                        }

                        table thead tr {
                            background-color: #009879;
                            color: #ffffff;
                            text-align: left;
                        }

                        table th, table td {
                            padding: 12px 15px;
                            text-align: left;
                        }

                        table tbody tr {
                            border-bottom: 1px solid #dddddd;
                        }

                        table tbody tr:nth-of-type(even) {
                            background-color: #f3f3f3;
                        }

                        table tbody tr:last-of-type {
                            border-bottom: 2px solid #009879;
                        }
                    </style>
                </head>
                <h1>VoiNet ARC72 NFT Stats</h1>`;

    html += `<table>
            <tr>
                <th>Contract ID</th>
                <th>Created</th>
                <th>Total Supply</th>
                <th>Tokens Minted</th>
                <th>Total Transfers</th>
                <th>Unique Owners</th>
            </tr>
            ${rows.map((collection) => {
                return `
                    <tr>
                        <td><a href='https://voi.observer/explorer/application/${collection.contractId}/transactions' target='_blank'>${collection.contractId}</a></td>
                        <td><a href='https://voi.observer/explorer/block/${collection.createRound}' target='_blank'>${collection.createRound}</td>
                        <td>${collection.totalSupply}</a></td>
                        <td><a href='/nft-indexer/v1/tokens/?contractId=${collection.contractId}' target='_blank'>${collection.totalMinted}</a></td>
                        <td><a href='/nft-indexer/v1/transfers/?contractId=${collection.contractId}' target='_blank'>${collection.totalTransfers}</a></td>
                        <td>${collection.uniqueOwners}</td>
                    </tr>
                `;
            }).join('')}
        </table>`;

        // get last sync round
        db.db.get(`SELECT value FROM info WHERE key='syncRound'`, [], (err, row) => {
            const syncRound = Number(row.value);
            html += `<p>Last sync round: ${syncRound}</p>`;
            res.send(html);
        });
    });

}
