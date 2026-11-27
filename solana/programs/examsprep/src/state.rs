//! The accounts this program stores on-chain.
//!
//! `InitSpace` asks Anchor to add up the field sizes so we rent the right
//! number of bytes. The extra 8 bytes added at `init` are Anchor's account
//! discriminator (a tag so one account type cannot be passed off as another).

use anchor_lang::prelude::*;

/// Seed strings. Changing one of these changes every derived address.
pub const CONFIG_SEED: &[u8] = b"config";
pub const BADGE_SEED: &[u8] = b"badge";
pub const POOL_SEED: &[u8] = b"pool";
pub const VAULT_SEED: &[u8] = b"vault";

/// The highest `top_n` a pool may pay. Keeps the payout transaction small.
pub const MAX_TOP_N: u8 = 10;

/// One config account for the whole program. Address seeds: `["config"]`.
#[account]
#[derive(InitSpace)]
pub struct BadgeConfig {
    /// The only key allowed to award badges, open pools, and pay winners.
    pub authority: Pubkey,
    /// Bump seed so the program can find this PDA again.
    pub bump: u8,
}

/// One badge. Address seeds: `["badge", student, kind, subject_hash]`.
///
/// Creating the account *is* the badge. There is no separate "mint".
/// If the account exists, the badge is real. If it does not, it is not.
#[account]
#[derive(InitSpace)]
pub struct Badge {
    pub student: Pubkey,
    /// 0 topic, 1 mock exam, 2 streak, 3 weekly leaderboard. See lib.rs.
    pub kind: u8,
    /// SHA-256 of the subject string the API uses (module, quiz, or week).
    pub subject: [u8; 32],
    /// Extra number: lesson count, score percent, streak days, or rank.
    pub detail: u32,
    /// Unix time (seconds) when the authority awarded it.
    pub awarded_at: i64,
    pub bump: u8,
}

/// A leaderboard prize pool. Address seeds: `["pool", pool_id as 8 little-endian bytes]`.
///
/// The tokens themselves are not stored in this account. They sit in `vault`,
/// a token account that this pool PDA owns. Nobody can move them except
/// `pay_winners`, which the program signs for.
#[account]
#[derive(InitSpace)]
pub struct PrizePool {
    pub authority: Pubkey,
    /// Last sponsor who added tokens. The default (all zeros) means "not funded yet".
    pub sponsor: Pubkey,
    /// Number chosen by the API. It is part of the address, so it cannot change.
    pub pool_id: u64,
    /// Which token this pool holds. On devnet this is USDC's mint.
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub period_start: i64,
    pub period_end: i64,
    pub top_n: u8,
    /// Set to true by `pay_winners`. A second payout is rejected.
    pub distributed: bool,
    /// Running total of tokens sent in by sponsors, in base units.
    pub total_funded: u64,
    pub bump: u8,
    pub vault_bump: u8,
}
