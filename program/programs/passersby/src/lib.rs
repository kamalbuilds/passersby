use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as IX_SYSVAR_ID,
};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("H15pvqJFh7isY3fMX4oZe2ezZ8xjM4RZmv2uemQhv1g2");

pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");
pub const ATTEST_PREFIX: &[u8] = b"passersby:v1";
pub const ATTEST_LEN: usize = 12 + 32 * 4 + 1 + 1 + 4 + 8;
pub const SECONDS_PER_DAY: i64 = 86_400;
pub const TIER_WALLET: u8 = 0;
pub const TIER_SEEKER: u8 = 1;

#[program]
pub mod passersby {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, attestor: Pubkey, skr_mint: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.attestor = attestor;
        c.skr_mint = skr_mint;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_attestor(ctx: Context<SetAttestor>, attestor: Pubkey) -> Result<()> {
        ctx.accounts.config.attestor = attestor;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn record_encounter(
        ctx: Context<RecordEncounter>,
        lo: Pubkey,
        hi: Pubkey,
        lo_wallet: Pubkey,
        hi_wallet: Pubkey,
        lo_tier: u8,
        hi_tier: u8,
        day: u32,
        seen_at: i64,
    ) -> Result<()> {
        require!(lo.as_ref() < hi.as_ref(), PassersbyError::UnsortedPair);
        require!(lo_wallet != hi_wallet, PassersbyError::SameWallet);
        require!(
            lo_tier <= TIER_SEEKER && hi_tier <= TIER_SEEKER,
            PassersbyError::BadTier
        );
        require!(seen_at >= 0, PassersbyError::BadTimestamp);
        require!(
            seen_at / SECONDS_PER_DAY == day as i64,
            PassersbyError::DayMismatch
        );
        let now = Clock::get()?.unix_timestamp;
        let skew = now
            .checked_sub(seen_at)
            .and_then(i64::checked_abs)
            .ok_or(PassersbyError::MathOverflow)?;
        require!(skew <= SECONDS_PER_DAY, PassersbyError::SeenAtOutOfRange);

        let mut expected = [0u8; ATTEST_LEN];
        expected[..12].copy_from_slice(ATTEST_PREFIX);
        expected[12..44].copy_from_slice(lo.as_ref());
        expected[44..76].copy_from_slice(hi.as_ref());
        expected[76..108].copy_from_slice(lo_wallet.as_ref());
        expected[108..140].copy_from_slice(hi_wallet.as_ref());
        expected[140] = lo_tier;
        expected[141] = hi_tier;
        expected[142..146].copy_from_slice(&day.to_le_bytes());
        expected[146..154].copy_from_slice(&seen_at.to_le_bytes());
        verify_attestation(
            &ctx.accounts.instructions.to_account_info(),
            &ctx.accounts.config.attestor,
            &expected,
        )?;

        let verified = lo_tier == TIER_SEEKER && hi_tier == TIER_SEEKER;
        let e = &mut ctx.accounts.encounter;
        e.lo = lo;
        e.hi = hi;
        e.lo_wallet = lo_wallet;
        e.hi_wallet = hi_wallet;
        e.day = day;
        e.verified = verified;
        e.first_seen = seen_at;
        e.bump = ctx.bumps.encounter;

        touch_profile(
            &mut ctx.accounts.lo_profile,
            lo,
            lo_wallet,
            lo_tier,
            day,
            verified,
            ctx.bumps.lo_profile,
        )?;
        touch_profile(
            &mut ctx.accounts.hi_profile,
            hi,
            hi_wallet,
            hi_tier,
            day,
            verified,
            ctx.bumps.hi_profile,
        )
    }

    pub fn wave(ctx: Context<Wave>, amount: u64) -> Result<()> {
        require!(amount >= 1, PassersbyError::InvalidAmount);
        let e = &ctx.accounts.encounter;
        let signer = ctx.accounts.signer.key();
        let (receiver_wallet, receiver_identity) = if signer == e.lo_wallet {
            (e.hi_wallet, e.hi)
        } else if signer == e.hi_wallet {
            (e.lo_wallet, e.lo)
        } else {
            return err!(PassersbyError::NotParticipant);
        };
        require_keys_eq!(ctx.accounts.receiver.key(), receiver_wallet, PassersbyError::WrongReceiver);
        require_keys_eq!(
            ctx.accounts.receiver_profile.identity,
            receiver_identity,
            PassersbyError::WrongReceiver
        );

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.signer_token.to_account_info(),
                    mint: ctx.accounts.skr_mint.to_account_info(),
                    to: ctx.accounts.receiver_token.to_account_info(),
                    authority: ctx.accounts.signer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.skr_mint.decimals,
        )?;

        let p = &mut ctx.accounts.receiver_profile;
        p.waves_received = p
            .waves_received
            .checked_add(1)
            .ok_or(PassersbyError::MathOverflow)?;
        Ok(())
    }
}

fn touch_profile(
    p: &mut Profile,
    identity: Pubkey,
    wallet: Pubkey,
    tier: u8,
    day: u32,
    verified: bool,
    bump: u8,
) -> Result<()> {
    if p.encounters == 0 {
        p.identity = identity;
        p.bump = bump;
    }
    p.wallet = wallet;
    p.tier = tier;
    p.encounters = p.encounters.checked_add(1).ok_or(PassersbyError::MathOverflow)?;
    if verified {
        p.verified_encounters = p
            .verified_encounters
            .checked_add(1)
            .ok_or(PassersbyError::MathOverflow)?;
    }
    if p.encounters == 1 || day > p.last_day.saturating_add(1) {
        p.streak = 1;
        p.last_day = day;
    } else if day == p.last_day.saturating_add(1) {
        p.streak = p.streak.checked_add(1).ok_or(PassersbyError::MathOverflow)?;
        p.last_day = day;
    }
    Ok(())
}

/// The instruction immediately before this one must be a single-signature
/// Ed25519 verify whose signer is `attestor` and whose message is `expected`.
/// The runtime verifies the signature; we bind it to the right key and bytes.
fn verify_attestation(
    ix_sysvar: &AccountInfo,
    attestor: &Pubkey,
    expected: &[u8; ATTEST_LEN],
) -> Result<()> {
    let cur = load_current_index_checked(ix_sysvar)? as usize;
    require!(cur > 0, PassersbyError::MissingEd25519);
    let ix = load_instruction_at_checked(cur - 1, ix_sysvar)?;
    require!(
        ix.program_id == ED25519_PROGRAM_ID,
        PassersbyError::MissingEd25519
    );
    let d = &ix.data;
    // header: num_signatures u8, padding u8, then one 14-byte offsets struct
    require!(d.len() >= 16, PassersbyError::BadEd25519);
    require!(d[0] == 1, PassersbyError::BadEd25519);
    let rd = |i: usize| -> u16 { u16::from_le_bytes([d[i], d[i + 1]]) };
    let sig_ix = rd(4);
    let pk_off = rd(6) as usize;
    let pk_ix = rd(8);
    let msg_off = rd(10) as usize;
    let msg_len = rd(12) as usize;
    let msg_ix = rd(14);
    require!(
        sig_ix == u16::MAX && pk_ix == u16::MAX && msg_ix == u16::MAX,
        PassersbyError::BadEd25519
    );
    let pk_end = pk_off.checked_add(32).ok_or(PassersbyError::BadEd25519)?;
    let msg_end = msg_off
        .checked_add(msg_len)
        .ok_or(PassersbyError::BadEd25519)?;
    let pk = d.get(pk_off..pk_end).ok_or(PassersbyError::BadEd25519)?;
    let msg = d.get(msg_off..msg_end).ok_or(PassersbyError::BadEd25519)?;
    require!(pk == attestor.as_ref(), PassersbyError::WrongAttestor);
    require!(msg == expected.as_slice(), PassersbyError::WrongMessage);
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub attestor: Pubkey,
    pub skr_mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub identity: Pubkey,
    pub wallet: Pubkey,
    pub tier: u8,
    pub encounters: u32,
    pub verified_encounters: u32,
    pub streak: u16,
    pub last_day: u32,
    pub waves_received: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Encounter {
    pub lo: Pubkey,
    pub hi: Pubkey,
    pub lo_wallet: Pubkey,
    pub hi_wallet: Pubkey,
    pub day: u32,
    pub verified: bool,
    pub first_seen: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAttestor<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ PassersbyError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(lo: Pubkey, hi: Pubkey, lo_wallet: Pubkey, hi_wallet: Pubkey, lo_tier: u8, hi_tier: u8, day: u32)]
pub struct RecordEncounter<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed, payer = payer, space = 8 + Profile::INIT_SPACE,
        seeds = [b"profile", lo.as_ref()], bump
    )]
    pub lo_profile: Account<'info, Profile>,
    #[account(
        init_if_needed, payer = payer, space = 8 + Profile::INIT_SPACE,
        seeds = [b"profile", hi.as_ref()], bump
    )]
    pub hi_profile: Account<'info, Profile>,
    #[account(
        init, payer = payer, space = 8 + Encounter::INIT_SPACE,
        seeds = [b"encounter", lo.as_ref(), hi.as_ref(), &day.to_le_bytes()], bump
    )]
    pub encounter: Account<'info, Encounter>,
    /// CHECK: address-constrained to the instructions sysvar
    #[account(address = IX_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Wave<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = skr_mint)]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [b"encounter", encounter.lo.as_ref(), encounter.hi.as_ref(), &encounter.day.to_le_bytes()],
        bump = encounter.bump
    )]
    pub encounter: Account<'info, Encounter>,
    pub skr_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut, token::mint = skr_mint, token::authority = signer,
        token::token_program = token_program
    )]
    pub signer_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: compared against the encounter's counterparty wallet in the handler
    pub receiver: UncheckedAccount<'info>,
    #[account(
        init_if_needed, payer = signer,
        associated_token::mint = skr_mint, associated_token::authority = receiver,
        associated_token::token_program = token_program
    )]
    pub receiver_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut, seeds = [b"profile", receiver_profile.identity.as_ref()], bump = receiver_profile.bump
    )]
    pub receiver_profile: Account<'info, Profile>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum PassersbyError {
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Identities must be sorted byte-wise with lo < hi")]
    UnsortedPair,
    #[msg("The two wallets of an encounter must differ")]
    SameWallet,
    #[msg("Tier must be 0 (wallet) or 1 (seeker)")]
    BadTier,
    #[msg("seen_at must be non-negative")]
    BadTimestamp,
    #[msg("day must equal seen_at / 86400")]
    DayMismatch,
    #[msg("seen_at is more than one day from the clock")]
    SeenAtOutOfRange,
    #[msg("Previous instruction is not an Ed25519 verify")]
    MissingEd25519,
    #[msg("Malformed Ed25519 instruction")]
    BadEd25519,
    #[msg("Attestation not signed by the configured attestor")]
    WrongAttestor,
    #[msg("Attestation message does not match the encounter")]
    WrongMessage,
    #[msg("Only the admin may do this")]
    NotAdmin,
    #[msg("Wave amount must be at least 1")]
    InvalidAmount,
    #[msg("Signer is not a party to this encounter")]
    NotParticipant,
    #[msg("Receiver accounts do not match the other party of the encounter")]
    WrongReceiver,
}
