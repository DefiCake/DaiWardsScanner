import dotenv from "dotenv";
dotenv.config();

import { providers, Contract, EventFilter, Event } from "ethers";
import fs from "fs-extra";
import path from "path";
import DAI_ABI from "./DAI_ABI.json";

if (!process.env.RPC_ENDPOINT) throw new Error(`RPC_ENDPOINT env var needed`);
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const DAI_ADDRESS = process.env.DAI_ADDRESS || "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // Mainnet DAI address
const START_BLOCK = parseInt(process.env.START_BLOCK || "8928158"); // Mainnet DAI contract creation block

const RELY_FUNCTION_SIG = "0x65fae35e00000000000000000000000000000000000000000000000000000000"; // This is how rely(address guy) calls are logged
const DENY_FUNCTION_SIG = "0x9c52a7f100000000000000000000000000000000000000000000000000000000"; // This is how deny(address guy) calls are logged

const main = async () => {
  const provider = new providers.JsonRpcProvider(RPC_ENDPOINT);
  const dai = new Contract(DAI_ADDRESS, DAI_ABI, provider);

  const filter: EventFilter = {
    address: DAI_ADDRESS,
    topics: [[RELY_FUNCTION_SIG, DENY_FUNCTION_SIG]], // topic[0] equals rely OR deny signature
  };

  let events: Event[] = [];

  console.log(`\t> Fetching RELY / DENY events, this could take a while`);

  const latestBlock = await provider.getBlockNumber();
  const offset = 500000;

  /**
   * Unfortunately we need to split the query into tranches to avoid nodes from suffocating
   */
  let startBlock = START_BLOCK;
  while (startBlock < latestBlock) {
    const endBlock = Math.min(startBlock + offset, latestBlock);
    console.log(`\t> fetching from block ${startBlock} to block ${endBlock}`);
    const tranchedEvents = await dai.queryFilter(filter, startBlock, endBlock);
    events.push(...tranchedEvents);
    startBlock = endBlock + 1;
  }

  let listOfWards: string[] = [];
  for (const event of events) {
    const functionCall = event.topics[0];
    const address = event.topics[2];

    if (functionCall === RELY_FUNCTION_SIG) {
      listOfWards.push(address);
    } else if (functionCall === DENY_FUNCTION_SIG) {
      listOfWards = listOfWards.filter((item) => item != address);
    } else {
      console.warn(`Invalid topic[0] detected`);
    }
  }

  listOfWards = listOfWards.map((bytes32Address) => "0x" + bytes32Address.slice(26));
  fs.writeFileSync(path.resolve(__dirname, "./LIST.md"), Buffer.from(listOfWards.join("\n")));
};

let error: Error | undefined;

main()
  .then(() => process.exit(0))
  .catch((e) => {
    error = e;
    console.error(e);
  })
  .finally(() => {
    if (error) process.exit(1);
    else process.exit(0);
  });
