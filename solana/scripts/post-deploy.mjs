/**
 * After a devnet deploy: initialize config, and create the demo USDC pool
 * if it does not exist yet. Funding is best-effort. The sponsor needs devnet
 * USDC in their associated token account, which the public SOL faucet does
 * not provide.
 *
 * The authority key signs these transactions. It is not the program keypair.
 */

const fs = require("fs");
const anchor = require("@anchor-lang/core");
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const DEMO_POOL_ID = 20261128n;

function loadKeypair(path) {
  const secret = JSON.parse(fs.readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function poolIdBuffer(poolId) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(poolId);
  return bytes;
}

function associatedTokenAddress(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

async function main() {
  const authorityPath = process.env.AUTHORITY_KEYPAIR;
  if (!authorityPath) {
    throw new Error("Set AUTHORITY_KEYPAIR to the backend authority key file.");
  }
  const authority = loadKeypair(authorityPath);
  const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), {
    commitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync("target/idl/examsprep.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  if (await connection.getAccountInfo(config)) {
    console.log("Config account already exists.");
  } else {
    await program.methods
      .initializeConfig()
      .accountsPartial({
        authority: authority.publicKey,
        config,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Initialized config.");
  }

  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), poolIdBuffer(DEMO_POOL_ID)],
    PROGRAM_ID
  );
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), pool.toBuffer()], PROGRAM_ID);
  if (await connection.getAccountInfo(pool)) {
    console.log("Demo USDC reward pool already exists.");
  } else {
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createRewardPool(
        new anchor.BN(DEMO_POOL_ID.toString()),
        new anchor.BN(now),
        new anchor.BN(now + 30 * 24 * 60 * 60),
        3
      )
      .accountsPartial({
        authority: authority.publicKey,
        config,
        mint: USDC_MINT,
        pool,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Created the devnet USDC reward pool.");
  }

  let fundStatus = "not funded";
  const sponsorPath = process.env.SPONSOR_KEYPAIR || "";
  if (sponsorPath && fs.existsSync(sponsorPath)) {
    const sponsor = loadKeypair(sponsorPath);
    const sponsorToken = associatedTokenAddress(sponsor.publicKey, USDC_MINT);
    const account = await connection.getAccountInfo(sponsorToken);
    if (!account) {
      fundStatus = "sponsor has no USDC token account yet";
    } else {
      const balance = await connection.getTokenAccountBalance(sponsorToken);
      const baseUnits = Number(balance.value.amount);
      if (baseUnits <= 0) {
        fundStatus = "sponsor USDC balance is 0";
      } else {
        const amount = Math.min(baseUnits, 1_000_000);
        await program.methods
          .fundRewardPool(new anchor.BN(amount))
          .accountsPartial({
            sponsor: sponsor.publicKey,
            pool,
            mint: USDC_MINT,
            sponsorToken,
            vault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([sponsor])
          .rpc();
        fundStatus = `funded ${amount} base units`;
      }
    }
  }

  console.log("");
  console.log(`Program id:       ${PROGRAM_ID.toBase58()}`);
  console.log(`Deploy signature: ${process.env.DEPLOY_SIGNATURE || "(see the deploy log above)"}`);
  console.log(`Config PDA:       ${config.toBase58()}`);
  console.log(`Demo pool id:     ${DEMO_POOL_ID.toString()}`);
  console.log(`Pool PDA:         ${pool.toBase58()}`);
  console.log(`Vault PDA:        ${vault.toBase58()}`);
  console.log(`Devnet USDC mint: ${USDC_MINT.toBase58()}`);
  console.log(`Fund status:      ${fundStatus}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
