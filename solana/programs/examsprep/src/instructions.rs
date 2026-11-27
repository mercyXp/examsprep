//! The five instructions. Each one lists the accounts it needs, then the code.
//!
//! Account order here is the order the Python API and the TypeScript tests
//! pass them in. If you reorder a field, update both clients.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::error::ExamsPrepError;
use crate::state::{
    Badge, BadgeConfig, PrizePool, BADGE_SEED, CONFIG_SEED, MAX_TOP_N, POOL_SEED, VAULT_SEED,
};

pub fn handle_initialize(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.bump = ctx.bumps.config;
    msg!(
        "ExamsPrep config ready. Authority is {}",
        config.authority
    );
    Ok(())
}

pub fn handle_award_badge(
    ctx: Context<AwardBadge>,
    kind: u8,
    subject: [u8; 32],
    detail: u32,
) -> Result<()> {
    // The signer check already proved this wallet signed. This proves it is
    // the wallet we stored at initialize, not some other signer.
    require_keys_eq!(
        ctx.accounts.authority.key(),
        ctx.accounts.config.authority,
        ExamsPrepError::Unauthorized
    );
    require!(kind <= 3, ExamsPrepError::BadBadgeKind);

    let badge = &mut ctx.accounts.badge;
    badge.student = ctx.accounts.student.key();
    badge.kind = kind;
    badge.subject = subject;
    badge.detail = detail;
    badge.awarded_at = Clock::get()?.unix_timestamp;
    badge.bump = ctx.bumps.badge;

    msg!(
        "Badge kind {} awarded to {}",
        kind,
        badge.student
    );
    Ok(())
}

pub fn handle_create_pool(
    ctx: Context<CreatePool>,
    pool_id: u64,
    period_start: i64,
    period_end: i64,
    top_n: u8,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.authority.key(),
        ctx.accounts.config.authority,
        ExamsPrepError::Unauthorized
    );
    require!(period_end > period_start, ExamsPrepError::BadPeriod);
    require!(top_n >= 1 && top_n <= MAX_TOP_N, ExamsPrepError::BadTopN);

    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.config.authority;
    pool.sponsor = Pubkey::default();
    pool.pool_id = pool_id;
    pool.mint = ctx.accounts.mint.key();
    pool.vault = ctx.accounts.vault.key();
    pool.period_start = period_start;
    pool.period_end = period_end;
    pool.top_n = top_n;
    pool.distributed = false;
    pool.total_funded = 0;
    pool.bump = ctx.bumps.pool;
    pool.vault_bump = ctx.bumps.vault;

    msg!("Prize pool {} opened for top {}", pool_id, top_n);
    Ok(())
}

pub fn handle_fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    require!(amount > 0, ExamsPrepError::ZeroAmount);
    require!(!ctx.accounts.pool.distributed, ExamsPrepError::AlreadyPaid);

    // The sponsor signs, so the token program will only move their tokens.
    // `transfer_checked` also checks the decimals, which stops a mismatch
    // between a 6-decimal USDC mint and a 9-decimal mint.
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.sponsor_token.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.sponsor.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.sponsor = ctx.accounts.sponsor.key();
    pool.total_funded = pool
        .total_funded
        .checked_add(amount)
        .ok_or(ExamsPrepError::InsufficientFunds)?;

    msg!("Pool {} funded with {} base units", pool.pool_id, amount);
    Ok(())
}

pub fn handle_pay_winners<'a>(ctx: Context<'a, PayWinners<'a>>, amounts: Vec<u64>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.authority.key(),
        ctx.accounts.config.authority,
        ExamsPrepError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.pool.authority,
        ctx.accounts.config.authority,
        ExamsPrepError::Unauthorized
    );
    require!(!ctx.accounts.pool.distributed, ExamsPrepError::AlreadyPaid);
    require!(
        !amounts.is_empty()
            && amounts.len() == ctx.remaining_accounts.len()
            && amounts.len() <= ctx.accounts.pool.top_n as usize,
        ExamsPrepError::BadWinners
    );

    let mut total: u64 = 0;
    for amount in amounts.iter() {
        require!(*amount > 0, ExamsPrepError::ZeroAmount);
        total = total
            .checked_add(*amount)
            .ok_or(ExamsPrepError::InsufficientFunds)?;
    }
    require!(
        total <= ctx.accounts.vault.amount,
        ExamsPrepError::InsufficientFunds
    );

    // These seeds are how the program proves it may sign for the pool PDA.
    // They must be the same seeds used when the pool account was created.
    let pool_id = ctx.accounts.pool.pool_id.to_le_bytes();
    let bump = ctx.accounts.pool.bump;
    let signer_seeds: &[&[u8]] = &[POOL_SEED, pool_id.as_ref(), &[bump]];

    for (index, amount) in amounts.iter().enumerate() {
        let destination = &ctx.remaining_accounts[index];
        require!(
            destination.key() != ctx.accounts.vault.key(),
            ExamsPrepError::BadTokenAccount
        );
        // Read the token account before the transfer. The borrow has to end
        // before the CPI, so this lives inside its own block.
        {
            let data = destination.try_borrow_data()?;
            let token_account = TokenAccount::try_deserialize_unchecked(&mut &data[..])?;
            require!(
                token_account.mint == ctx.accounts.pool.mint,
                ExamsPrepError::BadTokenAccount
            );
        }

        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: destination.clone(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[signer_seeds],
            ),
            *amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    ctx.accounts.pool.distributed = true;
    msg!(
        "Pool {} paid {} winner(s)",
        ctx.accounts.pool.pool_id,
        amounts.len()
    );
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + BadgeConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, BadgeConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(kind: u8, subject: [u8; 32])]
pub struct AwardBadge<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, BadgeConfig>,
    /// CHECK: The student wallet that receives the badge. It does not sign.
    /// The authority decides who earned it. The address is copied onto the badge.
    pub student: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Badge::INIT_SPACE,
        seeds = [BADGE_SEED, student.key().as_ref(), &[kind], subject.as_ref()],
        bump
    )]
    pub badge: Account<'info, Badge>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, BadgeConfig>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + PrizePool::INIT_SPACE,
        seeds = [POOL_SEED, &pool_id.to_le_bytes()],
        bump
    )]
    pub pool: Account<'info, PrizePool>,
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = pool,
        seeds = [VAULT_SEED, pool.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_SEED, &pool.pool_id.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, PrizePool>,
    #[account(constraint = mint.key() == pool.mint @ ExamsPrepError::BadTokenAccount)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = sponsor_token.mint == pool.mint @ ExamsPrepError::BadTokenAccount,
        constraint = sponsor_token.owner == sponsor.key() @ ExamsPrepError::BadTokenAccount,
    )]
    pub sponsor_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = pool.vault,
        constraint = vault.mint == pool.mint @ ExamsPrepError::BadTokenAccount,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PayWinners<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, BadgeConfig>,
    #[account(
        mut,
        seeds = [POOL_SEED, &pool.pool_id.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, PrizePool>,
    #[account(constraint = mint.key() == pool.mint @ ExamsPrepError::BadTokenAccount)]
    pub mint: Account<'info, Mint>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
