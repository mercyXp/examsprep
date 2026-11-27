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

    #[msg("The escrow does not hold enough tokens for those payouts.")]
    InsufficientFunds,

    #[msg("A token account is missing, or it is for a different mint than this pool.")]
    BadTokenAccount,
}
