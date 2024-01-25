import algosdk from "algosdk";

const ALGOD = {
    API_KEY: "",
    URL: "https://testnet-api.voi.nodly.io",
    PORT: 443,
};

const INDEXER = {
    API_KEY: "",
    URL: "https://testnet-idx.voi.nodly.io",
    PORT: 443,
}

export const algodClient = new algosdk.Algodv2({"X-Algo-API-Token": ALGOD.API_KEY}, ALGOD.URL, ALGOD.PORT);
export const indexerClient = new algosdk.Indexer(INDEXER.API_KEY, INDEXER.URL, INDEXER.PORT);
export const zeroAddress = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

// function to convert hex to bytes, modeled after ethers arrayify function
export function bytesFromHex(hex) {
    hex = hex.replace(/^0x/i, "");
    hex = hex.length % 2 ? "0" + hex : hex;
    return Buffer.from(hex, "hex");
}

export async function isARC72(contract) {
    try {
        const sim = await contract.supportsInterface(bytesFromHex("0x4e22a3ba"));
        if (sim.success) {
            return sim.returnValue;
        }
        return false;
    }
    catch(err) {
        return false;
    }
}

export async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function output(msg, clear = false) {
    if (clear) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
    }
    process.stdout.write(msg);
}
