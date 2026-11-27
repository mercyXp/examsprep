/**
 * Print the program id and the config PDA.
 * Pool and badge addresses depend on the pool id and the student, so they
 * are derived later by the API. The config account is the one `initialize` creates.
 */

import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

console.log(`Program id:     ${PROGRAM_ID.toBase58()}`);
console.log(`Config PDA:     ${config.toBase58()}`);
console.log(`Devnet USDC:    ${USDC_MINT.toBase58()}`);
console.log("Cluster:        devnet (https://api.devnet.solana.com)");
