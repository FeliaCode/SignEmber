//! EmberLimiter (Solana). One program, no admin, no upgrade authority after
//! deploy, no pause owned by us.
//!
//! The owner keeps USDC in their own token account and approves this owner's
//! allowance PDA as the SPL delegate once. The only instruction that moves
//! the owner's USDC is `spend`, and it can only send to a token account owned
//! by the agent that signed it, which must be the owner's registered agent.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("C6GmJ6m2sFVdzZTEvLsqzze1DseU2DrHd82jovhCMn8w");

#[cfg(feature = "mainnet")]
pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
#[cfg(not(feature = "mainnet"))]
pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

pub const ALLOWANCE_SEED: &[u8] = b"allowance";
pub const SECONDS_PER_DAY: i64 = 86_400;
/// Product ceiling on any owner's daily cap: $30 (USDC, 6 decimals).
pub const MAX_DAILY_CAP: u64 = 30_000_000;

#[program]
pub mod ember_limiter {
    use super::*;

    /// Owner only (the signer is the owner). Clears `revoked`.
    /// Keeps today's spend, so reconfiguring never resets the daily total.
    pub fn configure(ctx: Context<Configure>, agent: Pubkey, daily_cap: u64, per_tx_cap: u64) -> Result<()> {
        require!(agent != Pubkey::default(), LimiterError::ZeroAgent);
        require!(agent != ctx.accounts.owner.key(), LimiterError::AgentIsOwner);
        require!(per_tx_cap <= daily_cap, LimiterError::PerTxAboveDaily);
        require!(daily_cap <= MAX_DAILY_CAP, LimiterError::AboveMaxDaily);

        let a = &mut ctx.accounts.allowance;
        a.agent = agent;
        a.daily_cap = daily_cap;
        a.per_tx_cap = per_tx_cap;
        a.revoked = false;
        a.bump = ctx.bumps.allowance;
        emit!(Configured { owner: ctx.accounts.owner.key(), agent, daily_cap, per_tx_cap });
        Ok(())
    }

    /// Owner only. Irreversible until `configure`.
    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        let a = &mut ctx.accounts.allowance;
        a.agent = Pubkey::default();
        a.revoked = true;
        emit!(Revoked { owner: ctx.accounts.owner.key() });
        Ok(())
    }

    /// Agent only. Pulls `amount` from the owner's USDC account to the agent's
    /// USDC account. `payment_ref` = sha256(paymentId).
    pub fn spend(ctx: Context<Spend>, amount: u64, payment_ref: [u8; 32]) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        let agent = ctx.accounts.agent.key();
        let a = &mut ctx.accounts.allowance;

        // 1. caller is the registered, active agent
        require!(a.agent != Pubkey::default() && !a.revoked, LimiterError::NotActive);
        require_keys_eq!(agent, a.agent, LimiterError::NotAgent);
        // 2. 0 < amount <= perTxCap
        require!(amount > 0, LimiterError::ZeroAmount);
        require!(amount <= a.per_tx_cap, LimiterError::AbovePerTx);
        // 3. UTC day roll
        let today = Clock::get()?.unix_timestamp.div_euclid(SECONDS_PER_DAY);
        if today != a.day {
            a.day = today;
            a.spent_today = 0;
        }
        // 4. daily cap, state written before the transfer
        let next = a.spent_today.checked_add(amount).ok_or(LimiterError::AboveDaily)?;
        require!(next <= a.daily_cap, LimiterError::AboveDaily);
        a.spent_today = next;
        let spent_today = next;
        let bump = a.bump;

        // 5. transfer as the owner's delegate, then emit
        let seeds: &[&[u8]] = &[ALLOWANCE_SEED, owner.as_ref(), &[bump]];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.source.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.allowance.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        emit!(Spent { owner, agent, amount, payment_ref, spent_today });
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Allowance {
    /// per-owner agent wallet; only it may call spend
    pub agent: Pubkey,
    /// USDC base units (6 decimals)
    pub daily_cap: u64,
    pub per_tx_cap: u64,
    pub spent_today: u64,
    /// unix_timestamp / 86400 at last spend
    pub day: i64,
    pub revoked: bool,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Configure<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Allowance::INIT_SPACE,
        seeds = [ALLOWANCE_SEED, owner.key().as_ref()],
        bump,
    )]
    pub allowance: Account<'info, Allowance>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Revoke<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [ALLOWANCE_SEED, owner.key().as_ref()], bump = allowance.bump)]
    pub allowance: Account<'info, Allowance>,
}

#[derive(Accounts)]
pub struct Spend<'info> {
    pub agent: Signer<'info>,
    /// CHECK: only used as the PDA seed and matched against `source.owner`.
    pub owner: UncheckedAccount<'info>,
    #[account(mut, seeds = [ALLOWANCE_SEED, owner.key().as_ref()], bump = allowance.bump)]
    pub allowance: Account<'info, Allowance>,
    #[account(address = USDC_MINT @ LimiterError::WrongMint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub source: Account<'info, TokenAccount>,
    /// USDC can only land in a token account the signing agent owns.
    #[account(mut, token::mint = mint, token::authority = agent)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct Configured {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub daily_cap: u64,
    pub per_tx_cap: u64,
}

#[event]
pub struct Revoked {
    pub owner: Pubkey,
}

#[event]
pub struct Spent {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
    pub payment_ref: [u8; 32],
    pub spent_today: u64,
}

#[error_code]
pub enum LimiterError {
    #[msg("agent must not be the zero address")]
    ZeroAgent,
    #[msg("agent must not be the owner")]
    AgentIsOwner,
    #[msg("per-payment cap above daily cap")]
    PerTxAboveDaily,
    #[msg("allowance is not active")]
    NotActive,
    #[msg("caller is not the registered agent")]
    NotAgent,
    #[msg("amount must be above zero")]
    ZeroAmount,
    #[msg("amount above per-payment cap")]
    AbovePerTx,
    #[msg("amount above what is left today")]
    AboveDaily,
    #[msg("mint is not USDC")]
    WrongMint,
    #[msg("daily cap above the $30 maximum")]
    AboveMaxDaily,
}
