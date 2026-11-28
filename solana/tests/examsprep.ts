/**
 * Tests for the ExamsPrep program.
 *
 * `anchor test` starts a local validator, deploys this program, and runs
 * these cases. Nothing here touches devnet. The local mint stands in for
 * USDC: same SPL token rules, 6 decimals, but we can mint it ourselves.
 *
 * What each case is protecting:
 * - only the authority key can award a badge or pay a pool
 * - the same badge cannot be awarded twice
 * - a sponsor can lock tokens, and pay_winners sends them to the top-N
 * - a pool cannot be paid twice, overpaid, or paid to more people than top_n
 */

import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Examsprep } from "../target/types/examsprep";
import { expect } from "chai";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const KIND = {
  topic: 0,
  mock: 1,
  streak: 2,
  weekly: 3,
} as const;

function subject(byte: number): number[] {
  return Array.from(Buffer.alloc(32, byte));
}

function poolIdBuffer(poolId: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(poolId);
  return bytes;
}

describe("examsprep", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.examsprep as Program<Examsprep>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const authority = provider.wallet.publicKey;

  const [config] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  before(async () => {
    await program.methods
      .initialize()
      .accountsPartial({
        authority,
        config,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("awards each badge kind and rejects a second copy", async () => {
    const student = anchor.web3.Keypair.generate();
    const cases: Array<[number, number[], number]> = [
      [KIND.topic, subject(1), 4],
      [KIND.mock, subject(2), 82],
      [KIND.streak, subject(3), 5],
      [KIND.weekly, subject(4), 1],
    ];

    for (const [kind, topic, detail] of cases) {
      const [badge] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([kind]), Buffer.from(topic)],
        program.programId
      );
      await program.methods
        .awardBadge(kind, topic, detail)
        .accountsPartial({
          authority,
          config,
          student: student.publicKey,
          badge,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const stored = await program.account.badge.fetch(badge);
      expect(stored.student.toBase58()).to.equal(student.publicKey.toBase58());
      expect(stored.kind).to.equal(kind);
      expect(stored.detail).to.equal(detail);
      expect(Buffer.from(stored.subject)).to.deep.equal(Buffer.from(topic));
    }

    const [firstBadge] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.topic]), Buffer.from(subject(1))],
      program.programId
    );
    try {
      await program.methods
        .awardBadge(KIND.topic, subject(1), 4)
        .accountsPartial({
          authority,
          config,
          student: student.publicKey,
          badge: firstBadge,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("awarding the same badge twice should fail");
    } catch (error) {
      expect(String(error)).to.match(/already in use/i);
    }
  });

  it("rejects a badge from a wallet that is not the authority", async () => {
    const stranger = anchor.web3.Keypair.generate();
    const student = anchor.web3.Keypair.generate();
    const signature = await connection.requestAirdrop(stranger.publicKey, 1_000_000_000);
    await connection.confirmTransaction(signature, "confirmed");

    const topic = subject(9);
    const [badge] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.topic]), Buffer.from(topic)],
      program.programId
    );

    try {
      await program.methods
        .awardBadge(KIND.topic, topic, 1)
        .accountsPartial({
          authority: stranger.publicKey,
          config,
          student: student.publicKey,
          badge,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      expect.fail("a stranger should not award a badge");
    } catch (error) {
      expect(String(error)).to.match(/Unauthorized|unauthorized/i);
    }
  });

  it("lets a sponsor fund a pool and pays the top-N once", async () => {
    const poolId = 7n;
    const mint = await createMint(connection, payer, authority, null, 6);
    const [pool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolIdBuffer(poolId)],
      program.programId
    );
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer()],
      program.programId
    );

    await program.methods
      .createPool(new anchor.BN(poolId.toString()), new anchor.BN(1_700_000_000), new anchor.BN(1_700_086_400), 2)
      .accountsPartial({
        authority,
        config,
        mint,
        pool,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const sponsor = anchor.web3.Keypair.generate();
    const airdrop = await connection.requestAirdrop(sponsor.publicKey, 1_000_000_000);
    await connection.confirmTransaction(airdrop, "confirmed");
    const sponsorToken = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      sponsor.publicKey
    );
    await mintTo(connection, payer, mint, sponsorToken.address, payer, 5_000_000);

    await program.methods
      .fundPool(new anchor.BN(3_000_000))
      .accountsPartial({
        sponsor: sponsor.publicKey,
        pool,
        mint,
        sponsorToken: sponsorToken.address,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([sponsor])
      .rpc();

    const funded = await program.account.prizePool.fetch(pool);
    expect(funded.totalFunded.toNumber()).to.equal(3_000_000);
    expect(funded.sponsor.toBase58()).to.equal(sponsor.publicKey.toBase58());
    expect(funded.distributed).to.equal(false);

    const winnerA = anchor.web3.Keypair.generate();
    const winnerB = anchor.web3.Keypair.generate();
    const winnerAToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, winnerA.publicKey);
    const winnerBToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, winnerB.publicKey);

    await program.methods
      .payWinners([new anchor.BN(2_000_000), new anchor.BN(1_000_000)])
      .accountsPartial({
        authority,
        config,
        pool,
        mint,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: winnerAToken.address, isSigner: false, isWritable: true },
        { pubkey: winnerBToken.address, isSigner: false, isWritable: true },
      ])
      .rpc();

    const paid = await program.account.prizePool.fetch(pool);
    expect(paid.distributed).to.equal(true);
    expect(Number((await getAccount(connection, winnerAToken.address)).amount)).to.equal(2_000_000);
    expect(Number((await getAccount(connection, winnerBToken.address)).amount)).to.equal(1_000_000);
    expect(Number((await getAccount(connection, vault)).amount)).to.equal(0);

    try {
      await program.methods
        .payWinners([new anchor.BN(1)])
        .accountsPartial({
          authority,
          config,
          pool,
          mint,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: winnerAToken.address, isSigner: false, isWritable: true }])
        .rpc();
      expect.fail("a settled pool should not pay again");
    } catch (error) {
      expect(String(error)).to.match(/AlreadyPaid|already paid/i);
    }
  });

  it("rejects payouts that exceed top N, the escrow, or come from a stranger", async () => {
    const poolId = 8n;
    const mint = await createMint(connection, payer, authority, null, 6);
    const [pool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolIdBuffer(poolId)],
      program.programId
    );
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer()],
      program.programId
    );

    await program.methods
      .createPool(new anchor.BN(poolId.toString()), new anchor.BN(10), new anchor.BN(20), 1)
      .accountsPartial({
        authority,
        config,
        mint,
        pool,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const sponsorToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, authority);
    await mintTo(connection, payer, mint, sponsorToken.address, payer, 1_000_000);
    await program.methods
      .fundPool(new anchor.BN(500_000))
      .accountsPartial({
        sponsor: authority,
        pool,
        mint,
        sponsorToken: sponsorToken.address,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const extraA = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      anchor.web3.Keypair.generate().publicKey
    );
    const extraB = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      anchor.web3.Keypair.generate().publicKey
    );

    try {
      await program.methods
        .payWinners([new anchor.BN(1), new anchor.BN(1)])
        .accountsPartial({
          authority,
          config,
          pool,
          mint,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: extraA.address, isSigner: false, isWritable: true },
          { pubkey: extraB.address, isSigner: false, isWritable: true },
        ])
        .rpc();
      expect.fail("top_n is 1, so two winners should fail");
    } catch (error) {
      expect(String(error)).to.match(/BadWinners|winner list/i);
    }

    try {
      await program.methods
        .payWinners([new anchor.BN(9_000_000)])
        .accountsPartial({
          authority,
          config,
          pool,
          mint,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: extraA.address, isSigner: false, isWritable: true }])
        .rpc();
      expect.fail("paying more than the escrow should fail");
    } catch (error) {
      expect(String(error)).to.match(/InsufficientFunds|enough tokens/i);
    }

    const stranger = anchor.web3.Keypair.generate();
    const airdrop = await connection.requestAirdrop(stranger.publicKey, 1_000_000_000);
    await connection.confirmTransaction(airdrop, "confirmed");
    try {
      await program.methods
        .payWinners([new anchor.BN(100_000)])
        .accountsPartial({
          authority: stranger.publicKey,
          config,
          pool,
          mint,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: extraA.address, isSigner: false, isWritable: true }])
        .signers([stranger])
        .rpc();
      expect.fail("a stranger should not pay the pool");
    } catch (error) {
      expect(String(error)).to.match(/Unauthorized|unauthorized/i);
    }
  });

  it("rejects a zero-value fund and a pool whose period is backwards", async () => {
    const poolId = 9n;
    const mint = await createMint(connection, payer, authority, null, 6);
    const [pool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolIdBuffer(poolId)],
      program.programId
    );
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .createPool(new anchor.BN(poolId.toString()), new anchor.BN(50), new anchor.BN(40), 1)
        .accountsPartial({
          authority,
          config,
          mint,
          pool,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("a backwards period should fail");
    } catch (error) {
      expect(String(error)).to.match(/BadPeriod|end after/i);
    }

    await program.methods
      .createPool(new anchor.BN(poolId.toString()), new anchor.BN(40), new anchor.BN(50), 1)
      .accountsPartial({
        authority,
        config,
        mint,
        pool,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const sponsorToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, authority);
    try {
      await program.methods
        .fundPool(new anchor.BN(0))
        .accountsPartial({
          sponsor: authority,
          pool,
          mint,
          sponsorToken: sponsorToken.address,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("funding zero should fail");
    } catch (error) {
      expect(String(error)).to.match(/ZeroAmount|greater than zero/i);
    }
  });

  async function openRewardPool(poolId: bigint, topN = 3) {
    const mint = await createMint(connection, payer, authority, null, 6);
    const [pool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolIdBuffer(poolId)],
      program.programId
    );
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer()],
      program.programId
    );
    const now = 1_700_000_000;
    await program.methods
      .createRewardPool(new anchor.BN(poolId.toString()), new anchor.BN(now), new anchor.BN(now + 86_400), topN)
      .accountsPartial({
        authority,
        config,
        mint,
        pool,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    return { mint, pool, vault };
  }

  async function fundRewardPool(
    poolId: bigint,
    mint: anchor.web3.PublicKey,
    pool: anchor.web3.PublicKey,
    vault: anchor.web3.PublicKey,
    amount: number
  ) {
    const sponsorToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, authority);
    await mintTo(connection, payer, mint, sponsorToken.address, payer, amount);
    await program.methods
      .fundRewardPool(new anchor.BN(amount))
      .accountsPartial({
        sponsor: authority,
        pool,
        mint,
        sponsorToken: sponsorToken.address,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    return sponsorToken;
  }

  it("initializes config once and rejects a second initialize_config", async () => {
    const stored = await program.account.badgeConfig.fetch(config);
    expect(stored.authority.toBase58()).to.equal(authority.toBase58());
    try {
      await program.methods
        .initializeConfig()
        .accountsPartial({
          authority,
          config,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("config can only be initialized once");
    } catch (error) {
      expect(String(error)).to.match(/already in use/i);
    }
  });

  it("creates a reward pool", async () => {
    const poolId = 11n;
    const { pool, mint } = await openRewardPool(poolId, 3);
    const stored = await program.account.prizePool.fetch(pool);
    expect(stored.poolId.toString()).to.equal(poolId.toString());
    expect(stored.mint.toBase58()).to.equal(mint.toBase58());
    expect(stored.topN).to.equal(3);
    expect(stored.closed).to.equal(false);
    expect(stored.totalClaimed.toString()).to.equal("0");
  });

  it("funds a reward pool with the pool mint", async () => {
    const poolId = 12n;
    const { pool, mint, vault } = await openRewardPool(poolId);
    await fundRewardPool(poolId, mint, pool, vault, 2_500_000);
    const stored = await program.account.prizePool.fetch(pool);
    expect(stored.totalFunded.toNumber()).to.equal(2_500_000);
    expect(Number((await getAccount(connection, vault)).amount)).to.equal(2_500_000);
  });

  it("records an achievement for the authority only", async () => {
    const student = anchor.web3.Keypair.generate();
    const topic = subject(11);
    const [achievement] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.weekly]), Buffer.from(topic)],
      program.programId
    );
    await program.methods
      .recordAchievement(KIND.weekly, topic, 1, new anchor.BN(12), new anchor.BN(2_500_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        achievement,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    const stored = await program.account.badge.fetch(achievement);
    expect(stored.student.toBase58()).to.equal(student.publicKey.toBase58());
    expect(stored.kind).to.equal(KIND.weekly);
    expect(stored.poolId.toString()).to.equal("12");
    expect(stored.amount.toNumber()).to.equal(2_500_000);
    expect(Buffer.from(stored.subject)).to.deep.equal(Buffer.from(topic));
  });

  it("lets the authority claim a recorded achievement once", async () => {
    const poolId = 13n;
    const { pool, mint, vault } = await openRewardPool(poolId);
    await fundRewardPool(poolId, mint, pool, vault, 2_000_000);
    const student = anchor.web3.Keypair.generate();
    const topic = subject(13);
    const [achievement] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.weekly]), Buffer.from(topic)],
      program.programId
    );
    const [receipt] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), pool.toBuffer(), student.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .recordAchievement(KIND.weekly, topic, 1, new anchor.BN(poolId.toString()), new anchor.BN(2_000_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        achievement,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, student.publicKey);
    await program.methods
      .claimReward(KIND.weekly, topic, new anchor.BN(2_000_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        pool,
        achievement,
        receipt,
        mint,
        vault,
        destination: destination.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    expect(Number((await getAccount(connection, destination.address)).amount)).to.equal(2_000_000);
    expect(Number((await getAccount(connection, vault)).amount)).to.equal(0);
    const claimed = await program.account.claimReceipt.fetch(receipt);
    expect(claimed.student.toBase58()).to.equal(student.publicKey.toBase58());
    expect(claimed.amount.toNumber()).to.equal(2_000_000);
    const updated = await program.account.prizePool.fetch(pool);
    expect(updated.totalClaimed.toNumber()).to.equal(2_000_000);

    try {
      await program.methods
        .claimReward(KIND.weekly, topic, new anchor.BN(2_000_000))
        .accountsPartial({
          authority,
          config,
          student: student.publicKey,
          pool,
          achievement,
          receipt,
          mint,
          vault,
          destination: destination.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("the same student cannot claim a pool twice");
    } catch (error) {
      expect(String(error)).to.match(/already in use/i);
    }
  });

  it("rejects an achievement from a wallet that is not the authority", async () => {
    const stranger = anchor.web3.Keypair.generate();
    const airdrop = await connection.requestAirdrop(stranger.publicKey, 1_000_000_000);
    await connection.confirmTransaction(airdrop, "confirmed");
    const student = anchor.web3.Keypair.generate();
    const topic = subject(21);
    const [achievement] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.topic]), Buffer.from(topic)],
      program.programId
    );
    try {
      await program.methods
        .recordAchievement(KIND.topic, topic, 1, new anchor.BN(0), new anchor.BN(0))
        .accountsPartial({
          authority: stranger.publicKey,
          config,
          student: student.publicKey,
          achievement,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      expect.fail("a stranger should not record an achievement");
    } catch (error) {
      expect(String(error)).to.match(/Unauthorized|unauthorized/i);
    }
  });

  it("rejects a fund and a claim that name a different mint", async () => {
    const poolId = 14n;
    const { pool, mint, vault } = await openRewardPool(poolId);
    await fundRewardPool(poolId, mint, pool, vault, 1_000_000);
    const wrongMint = await createMint(connection, payer, authority, null, 6);
    const wrongToken = await getOrCreateAssociatedTokenAccount(connection, payer, wrongMint, authority);
    await mintTo(connection, payer, wrongMint, wrongToken.address, payer, 1_000_000);
    try {
      await program.methods
        .fundRewardPool(new anchor.BN(1))
        .accountsPartial({
          sponsor: authority,
          pool,
          mint: wrongMint,
          sponsorToken: wrongToken.address,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("funding with another mint should fail");
    } catch (error) {
      expect(String(error)).to.match(/InvalidMint|does not match this reward pool/i);
    }

    const student = anchor.web3.Keypair.generate();
    const topic = subject(14);
    const [achievement] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.weekly]), Buffer.from(topic)],
      program.programId
    );
    const [receipt] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), pool.toBuffer(), student.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .recordAchievement(KIND.weekly, topic, 1, new anchor.BN(poolId.toString()), new anchor.BN(100_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        achievement,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, student.publicKey);
    try {
      await program.methods
        .claimReward(KIND.weekly, topic, new anchor.BN(100_000))
        .accountsPartial({
          authority,
          config,
          student: student.publicKey,
          pool,
          achievement,
          receipt,
          mint: wrongMint,
          vault,
          destination: destination.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("claiming with another mint should fail");
    } catch (error) {
      expect(String(error)).to.match(/InvalidMint|does not match this reward pool/i);
    }
  });

  it("rejects a claim larger than the vault balance", async () => {
    const poolId = 15n;
    const { pool, mint, vault } = await openRewardPool(poolId);
    await fundRewardPool(poolId, mint, pool, vault, 100_000);
    const student = anchor.web3.Keypair.generate();
    const topic = subject(15);
    const [achievement] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.weekly]), Buffer.from(topic)],
      program.programId
    );
    const [receipt] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), pool.toBuffer(), student.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .recordAchievement(KIND.weekly, topic, 1, new anchor.BN(poolId.toString()), new anchor.BN(500_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        achievement,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, student.publicKey);
    try {
      await program.methods
        .claimReward(KIND.weekly, topic, new anchor.BN(500_000))
        .accountsPartial({
          authority,
          config,
          student: student.publicKey,
          pool,
          achievement,
          receipt,
          mint,
          vault,
          destination: destination.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("a claim above the vault balance should fail");
    } catch (error) {
      expect(String(error)).to.match(/InsufficientFunds|enough tokens/i);
    }
  });

  it("rejects pool creation, a claim, and closing by the wrong authority", async () => {
    const stranger = anchor.web3.Keypair.generate();
    const airdrop = await connection.requestAirdrop(stranger.publicKey, 2_000_000_000);
    await connection.confirmTransaction(airdrop, "confirmed");

    const poolId = 16n;
    const mint = await createMint(connection, payer, authority, null, 6);
    const [pool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolIdBuffer(poolId)],
      program.programId
    );
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer()],
      program.programId
    );
    try {
      await program.methods
        .createRewardPool(new anchor.BN(poolId.toString()), new anchor.BN(10), new anchor.BN(20), 1)
        .accountsPartial({
          authority: stranger.publicKey,
          config,
          mint,
          pool,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      expect.fail("a stranger should not create a pool");
    } catch (error) {
      expect(String(error)).to.match(/Unauthorized|unauthorized/i);
    }

    const opened = await openRewardPool(poolId);
    await fundRewardPool(poolId, opened.mint, opened.pool, opened.vault, 400_000);
    const student = anchor.web3.Keypair.generate();
    const topic = subject(16);
    const [achievement] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.weekly]), Buffer.from(topic)],
      program.programId
    );
    const [receipt] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), opened.pool.toBuffer(), student.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .recordAchievement(KIND.weekly, topic, 1, new anchor.BN(poolId.toString()), new anchor.BN(100_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        achievement,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    const destination = await getOrCreateAssociatedTokenAccount(connection, payer, opened.mint, student.publicKey);
    try {
      await program.methods
        .claimReward(KIND.weekly, topic, new anchor.BN(100_000))
        .accountsPartial({
          authority: stranger.publicKey,
          config,
          student: student.publicKey,
          pool: opened.pool,
          achievement,
          receipt,
          mint: opened.mint,
          vault: opened.vault,
          destination: destination.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      expect.fail("a stranger should not claim");
    } catch (error) {
      expect(String(error)).to.match(/Unauthorized|unauthorized/i);
    }

    const sponsorToken = await getOrCreateAssociatedTokenAccount(connection, payer, opened.mint, authority);
    try {
      await program.methods
        .closeRewardPool()
        .accountsPartial({
          authority: stranger.publicKey,
          config,
          pool: opened.pool,
          mint: opened.mint,
          vault: opened.vault,
          destination: sponsorToken.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([stranger])
        .rpc();
      expect.fail("a stranger should not close the pool");
    } catch (error) {
      expect(String(error)).to.match(/Unauthorized|unauthorized/i);
    }
  });

  it("closes a pool and returns the unclaimed balance to the sponsor", async () => {
    const poolId = 17n;
    const { pool, mint, vault } = await openRewardPool(poolId);
    const sponsorToken = await fundRewardPool(poolId, mint, pool, vault, 900_000);
    const student = anchor.web3.Keypair.generate();
    const topic = subject(17);
    const [achievement] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge"), student.publicKey.toBuffer(), Buffer.from([KIND.weekly]), Buffer.from(topic)],
      program.programId
    );
    const [receipt] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), pool.toBuffer(), student.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .recordAchievement(KIND.weekly, topic, 1, new anchor.BN(poolId.toString()), new anchor.BN(400_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        achievement,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, student.publicKey);
    await program.methods
      .claimReward(KIND.weekly, topic, new anchor.BN(400_000))
      .accountsPartial({
        authority,
        config,
        student: student.publicKey,
        pool,
        achievement,
        receipt,
        mint,
        vault,
        destination: destination.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .closeRewardPool()
      .accountsPartial({
        authority,
        config,
        pool,
        mint,
        vault,
        destination: sponsorToken.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const closed = await program.account.prizePool.fetch(pool);
    expect(closed.closed).to.equal(true);
    expect(Number((await getAccount(connection, vault)).amount)).to.equal(0);
    // The sponsor funded 900_000 and the student took 400_000, so 500_000 comes back.
    // mintTo put 900_000 in the sponsor account and fund moved all of it out.
    expect(Number((await getAccount(connection, sponsorToken.address)).amount)).to.equal(500_000);
  });
});
