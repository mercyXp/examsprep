//! ExamsPrep on Solana.
//!
//! This program does two jobs for the exam-prep app:
//!
//! 1. **Achievement badges.** A badge is a small account that says "this wallet
//!    earned this thing." Students cannot create their own badges. Only the
//!    ExamsPrep backend keypair (the *authority*) can.
//! 2. **Leaderboard prize pools.** A sponsor locks USDC (or any SPL token) in
//!    an escrow account. Later the same authority names the top students and
//!    the program pays them from that escrow.
//!
//! Words you will see a lot, explained once:
//!
//! - A **program** is the deployed code. It has no private memory. All data
//!   lives in **accounts** that the transaction passes in.
//! - A **PDA** (program-derived address) is an account address that is computed
//!   from seeds and this program's id. No human has the private key. The
//!   program can still sign for it, which is how the escrow can send USDC.
//! - The **authority** is one public key stored in the config account. The
//!   matching secret key stays on the API server, in an environment variable.
//!   It is not the program keypair in `keys/`.
//!
//! Badge kinds (the `kind` byte stored on each badge):
//!
//! | Byte | Meaning |
//! | --- | --- |
//! | 0 | Topic mastered (every published lesson in a module is complete) |
//! | 1 | Mock exam passed |
//! | 2 | Study streak |
//! | 3 | Weekly leaderboard top-N |
//!
//! The API hashes the human subject (for example `computing:IT212`) to 32
//! bytes before calling `award_badge`. That hash is part of the badge address,
//! so the same student can hold many badges without them colliding.

pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH");

#[program]
pub mod examsprep {
    use super::*;

    /// Creates the one config account and records who the authority is.
    ///
    /// Whoever signs this transaction becomes the only wallet that can award
    /// badges and pay winners. Run it once per deployment, with the backend key.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::handle_initialize(ctx)
    }

    /// Writes one badge for `student`. Fails if that badge already exists.
    pub fn award_badge(
        ctx: Context<AwardBadge>,
        kind: u8,
        subject: [u8; 32],
        detail: u32,
    ) -> Result<()> {
        instructions::handle_award_badge(ctx, kind, subject, detail)
    }

    /// Opens an empty prize pool. Funding is a separate step so a sponsor
    /// can lock USDC without holding the authority key.
    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: u64,
        period_start: i64,
        period_end: i64,
        top_n: u8,
    ) -> Result<()> {
        instructions::handle_create_pool(ctx, pool_id, period_start, period_end, top_n)
    }

    /// Moves `amount` of the pool's token from the sponsor into the escrow.
    /// `amount` is in base units. USDC uses 6 decimals, so 1 USDC is 1_000_000.
    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        instructions::handle_fund_pool(ctx, amount)
    }

    /// Pays the winner token accounts from the escrow and locks the pool.
    ///
    /// `amounts[i]` is paid to `remaining_accounts[i]`. The authority chooses
    /// the winners. Anyone can read the transaction afterwards and see exactly
    /// who was paid.
    pub fn pay_winners<'a>(ctx: Context<'a, PayWinners<'a>>, amounts: Vec<u64>) -> Result<()> {
        instructions::handle_pay_winners(ctx, amounts)
    }
}
