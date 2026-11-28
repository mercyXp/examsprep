//! Errors a transaction can return. The text in `msg` is what explorers show.

use anchor_lang::prelude::*;

#[error_code]
pub enum ExamsPrepError {
    #[msg("Only the ExamsPrep backend authority can do that.")]
    Unauthorized,

    #[msg("Badge kind must be 0, 1, 2, or 3.")]
    BadBadgeKind,

    #[msg("The prize period must end after it starts.")]
    BadPeriod,

    #[msg("Top N must be between 1 and 10.")]
    BadTopN,

    #[msg("Amount must be greater than zero.")]
    ZeroAmount,

    #[msg("This pool has already paid its winners.")]
    AlreadyPaid,

    #[msg("The winner list is empty, does not match the amounts, or exceeds top N.")]
    BadWinners,

    #[msg("The reward vault does not hold enough tokens for that payout.")]
    InsufficientFunds,

    #[msg("A token account is missing, or it does not belong to the expected wallet.")]
    BadTokenAccount,

    #[msg("The mint does not match this reward pool.")]
    InvalidMint,

    #[msg("This pool is closed.")]
    PoolClosed,

    #[msg("Claims have already started, so this pool cannot be funded or batch-paid.")]
    ClaimsStarted,

    #[msg("That achievement is not an entitlement for this reward pool.")]
    AchievementMismatch,

    #[msg("The claim amount does not match the amount recorded on the achievement.")]
    BadAmount,
}
