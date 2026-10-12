use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::{types::FailedTransactionMetadata, LiteSVM};
use passersby::{accounts, instruction, PassersbyError, ATTEST_PREFIX};
use solana_sdk::{
    clock::Clock,
    ed25519_instruction::new_ed25519_instruction_with_signature,
    instruction::{Instruction, InstructionError},
    program_option::COption,
    program_pack::Pack,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    transaction::{Transaction, TransactionError},
};
use spl_associated_token_account::get_associated_token_address;

const DAY: i64 = 86_400;
const T0: i64 = 100 * DAY + 3_600;
const SYSVAR_IX: Pubkey = solana_sdk::sysvar::instructions::ID;

fn code(e: PassersbyError) -> u32 {
    6000 + e as u32
}

fn custom(f: &FailedTransactionMetadata) -> Option<u32> {
    match &f.err {
        TransactionError::InstructionError(_, InstructionError::Custom(c)) => Some(*c),
        _ => None,
    }
}

fn set_clock(svm: &mut LiteSVM, ts: i64) {
    let mut c = svm.get_sysvar::<Clock>();
    c.unix_timestamp = ts;
    svm.set_sysvar(&c);
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ixs: &[Instruction],
) -> Result<(), FailedTransactionMetadata> {
    svm.expire_blockhash();
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), &[payer], svm.latest_blockhash());
    svm.send_transaction(tx).map(|_| ())
}

fn token_balance(svm: &LiteSVM, ta: &Pubkey) -> Option<u64> {
    let a = svm.get_account(ta)?;
    if a.data.is_empty() {
        return None;
    }
    Some(spl_token::state::Account::unpack(&a.data).ok()?.amount)
}

fn put_account(svm: &mut LiteSVM, addr: Pubkey, data: Vec<u8>) {
    svm.set_account(
        addr,
        solana_sdk::account::Account {
            lamports: svm.minimum_balance_for_rent_exemption(data.len()),
            data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn set_token_account(svm: &mut LiteSVM, addr: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64) {
    let mut data = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account::pack(
        spl_token::state::Account {
            mint,
            owner,
            amount,
            delegate: COption::None,
            state: spl_token::state::AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    put_account(svm, addr, data);
}

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    attestor: Keypair,
    mint: Pubkey,
    config: Pubkey,
}

fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[passersby::ID.as_ref()], &solana_sdk::bpf_loader_upgradeable::ID).0
}

fn uninitialized() -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(passersby::ID, "../../target/deploy/passersby.so")
        .expect("run `anchor build` first");
    set_clock(&mut svm, T0);
    let admin = Keypair::new();
    let attestor = Keypair::new();
    let loader = solana_sdk::bpf_loader_upgradeable::ID;
    let elf = std::fs::read("../../target/deploy/passersby.so").unwrap();
    let mut data = Vec::new();
    data.extend_from_slice(&3u32.to_le_bytes());
    data.extend_from_slice(&0u64.to_le_bytes());
    data.push(1);
    data.extend_from_slice(admin.pubkey().as_ref());
    data.extend_from_slice(&elf);
    svm.set_account(program_data_pda(), solana_sdk::account::Account {
        lamports: svm.minimum_balance_for_rent_exemption(data.len()), data,
        owner: loader, executable: false, rent_epoch: 0,
    }).unwrap();
    let mut data = 2u32.to_le_bytes().to_vec();
    data.extend_from_slice(program_data_pda().as_ref());
    svm.set_account(passersby::ID, solana_sdk::account::Account {
        lamports: svm.minimum_balance_for_rent_exemption(data.len()), data,
        owner: loader, executable: true, rent_epoch: 0,
    }).unwrap();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();

    let mint = Pubkey::new_unique();
    let mut data = vec![0u8; spl_token::state::Mint::LEN];
    spl_token::state::Mint::pack(
        spl_token::state::Mint {
            mint_authority: COption::None,
            supply: 1_000_000_000_000,
            decimals: 6,
            is_initialized: true,
            freeze_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    put_account(&mut svm, mint, data);

    let config = Pubkey::find_program_address(&[b"config"], &passersby::ID).0;
    Env { svm, admin, attestor, mint, config }
}

fn init_ix(e: &Env, admin: Pubkey) -> Instruction {
    Instruction {
        program_id: passersby::ID,
        accounts: accounts::InitConfig {
            admin, config: e.config, system_program: system_program::ID,
            program: passersby::ID, program_data: program_data_pda(),
        }
            .to_account_metas(None),
        data: instruction::InitConfig { attestor: e.attestor.pubkey(), skr_mint: e.mint }.data(),
    }
}

fn setup() -> Env {
    let mut e = uninitialized();
    let ix = init_ix(&e, e.admin.pubkey());
    send(&mut e.svm, &e.admin, &[ix]).unwrap();
    e
}

#[test]
fn config_initialization_rejects_non_upgrade_authority() {
    let mut e = uninitialized();
    let attacker = Keypair::new();
    e.svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();
    let ix = init_ix(&e, attacker.pubkey());
    let result = send(&mut e.svm, &attacker, &[ix]);
    let f = result.expect_err("attacker initialized the global trust root");
    assert_eq!(custom(&f), Some(code(PassersbyError::NotAdmin)), "{:?}", f.err);
    assert!(e.svm.get_account(&e.config).is_none());
    let ix = init_ix(&e, e.admin.pubkey());
    send(&mut e.svm, &e.admin, &[ix]).unwrap();
}

struct Party {
    id: Pubkey,
    wallet: Keypair,
    tier: u8,
}

fn party(e: &mut Env, seeker: bool) -> Party {
    let wallet = Keypair::new();
    e.svm.airdrop(&wallet.pubkey(), 10_000_000_000).unwrap();
    // seeker identity is an SGT mint, wallet-tier identity is the wallet itself
    let id = if seeker { Pubkey::new_unique() } else { wallet.pubkey() };
    Party { id, wallet, tier: seeker as u8 }
}

/// Returns (lo, hi) ordered byte-wise by identity.
fn sorted(a: Party, b: Party) -> (Party, Party) {
    if a.id.as_ref() < b.id.as_ref() {
        (a, b)
    } else {
        (b, a)
    }
}

fn pair(e: &mut Env, a_seeker: bool, b_seeker: bool) -> (Party, Party) {
    let a = party(e, a_seeker);
    let b = party(e, b_seeker);
    sorted(a, b)
}

#[derive(Clone)]
struct Rec {
    lo: Pubkey,
    hi: Pubkey,
    lo_wallet: Pubkey,
    hi_wallet: Pubkey,
    lo_tier: u8,
    hi_tier: u8,
    day: u32,
    seen_at: i64,
}

fn rec(lo: &Party, hi: &Party, seen_at: i64) -> Rec {
    Rec {
        lo: lo.id,
        hi: hi.id,
        lo_wallet: lo.wallet.pubkey(),
        hi_wallet: hi.wallet.pubkey(),
        lo_tier: lo.tier,
        hi_tier: hi.tier,
        day: (seen_at / DAY) as u32,
        seen_at,
    }
}

fn attest_msg(r: &Rec) -> Vec<u8> {
    let mut m = ATTEST_PREFIX.to_vec();
    for k in [&r.lo, &r.hi, &r.lo_wallet, &r.hi_wallet] {
        m.extend_from_slice(k.as_ref());
    }
    m.push(r.lo_tier);
    m.push(r.hi_tier);
    m.extend_from_slice(&r.day.to_le_bytes());
    m.extend_from_slice(&r.seen_at.to_le_bytes());
    m
}

fn ed_ix(signer: &Keypair, msg: &[u8]) -> Instruction {
    let sig = signer.sign_message(msg);
    let sig_bytes: [u8; 64] = sig.as_ref().try_into().unwrap();
    new_ed25519_instruction_with_signature(msg, &sig_bytes, &signer.pubkey().to_bytes())
}

fn profile_pda(id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"profile", id.as_ref()], &passersby::ID).0
}

fn encounter_pda(lo: &Pubkey, hi: &Pubkey, day: u32) -> Pubkey {
    Pubkey::find_program_address(&[b"encounter", lo.as_ref(), hi.as_ref(), &day.to_le_bytes()], &passersby::ID).0
}

fn record_ix(e: &Env, payer: &Pubkey, r: &Rec) -> Instruction {
    Instruction {
        program_id: passersby::ID,
        accounts: accounts::RecordEncounter {
            payer: *payer,
            config: e.config,
            lo_profile: profile_pda(&r.lo),
            hi_profile: profile_pda(&r.hi),
            encounter: encounter_pda(&r.lo, &r.hi, r.day),
            instructions: SYSVAR_IX,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::RecordEncounter {
            lo: r.lo,
            hi: r.hi,
            lo_wallet: r.lo_wallet,
            hi_wallet: r.hi_wallet,
            lo_tier: r.lo_tier,
            hi_tier: r.hi_tier,
            day: r.day,
            seen_at: r.seen_at,
        }
        .data(),
    }
}

/// Attestor signs exactly `r`, relayer submits `r`.
fn record(e: &mut Env, r: &Rec) -> Result<(), FailedTransactionMetadata> {
    let att = e.attestor.insecure_clone();
    record_signed_by(e, r, &att, r)
}

/// `signer` signs the message for `signed`; the instruction carries `r`.
fn record_signed_by(e: &mut Env, r: &Rec, signer: &Keypair, signed: &Rec) -> Result<(), FailedTransactionMetadata> {
    let relayer = Keypair::new();
    e.svm.airdrop(&relayer.pubkey(), 10_000_000_000).unwrap();
    let ed = ed_ix(signer, &attest_msg(signed));
    let ix = record_ix(e, &relayer.pubkey(), r);
    send(&mut e.svm, &relayer, &[ed, ix])
}

fn load<T: AccountDeserialize>(e: &Env, addr: &Pubkey) -> T {
    let a = e.svm.get_account(addr).expect("account missing");
    T::try_deserialize(&mut a.data.as_slice()).unwrap()
}

fn profile(e: &Env, id: &Pubkey) -> passersby::Profile {
    load(e, &profile_pda(id))
}

#[test]
fn happy_path_records_encounter_and_both_profiles() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, true, true);
    let r = rec(&lo, &hi, T0);
    record(&mut e, &r).unwrap();

    let enc: passersby::Encounter = load(&e, &encounter_pda(&lo.id, &hi.id, r.day));
    assert_eq!((enc.lo, enc.hi), (lo.id, hi.id));
    assert_eq!((enc.lo_wallet, enc.hi_wallet), (lo.wallet.pubkey(), hi.wallet.pubkey()));
    assert_eq!((enc.day, enc.first_seen, enc.verified), (100, T0, true));

    for p in [&lo, &hi] {
        let s = profile(&e, &p.id);
        assert_eq!(s.identity, p.id);
        assert_eq!(s.wallet, p.wallet.pubkey());
        assert_eq!((s.tier, s.encounters, s.verified_encounters), (1, 1, 1));
        assert_eq!((s.streak, s.last_day, s.waves_received), (1, 100, 0));
    }
}

#[test]
fn wallet_tier_encounter_is_unverified() {
    let mut e = setup();
    for (a, b) in [(true, false), (false, true), (false, false)] {
        let (lo, hi) = pair(&mut e, a, b);
        let r = rec(&lo, &hi, T0);
        record(&mut e, &r).unwrap();
        let enc: passersby::Encounter = load(&e, &encounter_pda(&lo.id, &hi.id, r.day));
        assert!(!enc.verified, "tiers {a} {b}");
        let s = profile(&e, &lo.id);
        assert_eq!((s.encounters, s.verified_encounters), (1, 0));
    }
}

#[test]
fn duplicate_same_pair_same_day_fails() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, true, true);
    record(&mut e, &rec(&lo, &hi, T0)).unwrap();
    // later the same day, different seen_at: same PDA
    let r = record(&mut e, &rec(&lo, &hi, T0 + 600)).unwrap_err();
    assert!(r.meta.logs.iter().any(|l| l.contains("already in use")), "{:?}", r.meta.logs);
    let s = profile(&e, &lo.id);
    assert_eq!((s.encounters, s.streak), (1, 1));
}

#[test]
fn next_day_succeeds_and_streak_is_two_then_gap_resets() {
    let mut e = setup();
    let a = party(&mut e, true);
    let b = party(&mut e, true);
    let c = party(&mut e, true);
    let d = party(&mut e, true);
    let (a_id, b_id, c_id, d_id) = (a.id, b.id, c.id, d.id);
    let (a_w, b_w, c_w, d_w) = (a.wallet.pubkey(), b.wallet.pubkey(), c.wallet.pubkey(), d.wallet.pubkey());
    let mk = |x: &Party, y: &Party, t: i64| {
        let (x2, y2) = if x.id.as_ref() < y.id.as_ref() { (x, y) } else { (y, x) };
        rec(x2, y2, t)
    };

    record(&mut e, &mk(&a, &b, T0)).unwrap();
    assert_eq!(profile(&e, &a_id).streak, 1);

    // day 101
    set_clock(&mut e.svm, T0 + DAY);
    record(&mut e, &mk(&a, &c, T0 + DAY)).unwrap();
    let pa = profile(&e, &a_id);
    assert_eq!((pa.streak, pa.last_day, pa.encounters), (2, 101, 2));
    assert_eq!(profile(&e, &c_id).streak, 1);
    assert_eq!(profile(&e, &b_id).streak, 1);
    assert_eq!(profile(&e, &a_id).wallet, a_w);

    // same pair on the new day is allowed (one per pair per day)
    record(&mut e, &mk(&a, &b, T0 + DAY)).unwrap();
    // second encounter on the same day does not bump the streak
    let pa = profile(&e, &a_id);
    assert_eq!((pa.streak, pa.encounters), (2, 3));
    assert_eq!(profile(&e, &b_id).streak, 2);

    // day 104: gap resets to 1
    set_clock(&mut e.svm, T0 + 4 * DAY);
    record(&mut e, &mk(&a, &d, T0 + 4 * DAY)).unwrap();
    let pa = profile(&e, &a_id);
    assert_eq!((pa.streak, pa.last_day, pa.encounters), (1, 104, 4));
    let _ = (b_w, c_w, d_w, d_id);
}

#[test]
fn wrong_attestor_fails() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, true, true);
    let r = rec(&lo, &hi, T0);
    let rogue = Keypair::new();
    let f = record_signed_by(&mut e, &r, &rogue, &r).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::WrongAttestor)), "{:?}", f.err);
    assert!(e.svm.get_account(&encounter_pda(&lo.id, &hi.id, r.day)).is_none());
}

#[test]
fn unsorted_pair_fails() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, true, true);
    // swap: hi passed as lo
    let r = rec(&hi, &lo, T0);
    let f = record(&mut e, &r).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::UnsortedPair)), "{:?}", f.err);
    // equal identities are not strictly sorted either
    let r = rec(&lo, &lo, T0);
    let f = record(&mut e, &r).unwrap_err();
    assert!(custom(&f).is_some());
}

#[test]
fn attestation_for_different_claim_fails() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, false, false);
    let signed = rec(&lo, &hi, T0);

    // attestor saw two wallet-tier users; relayer claims both seeker to fake a verified encounter
    let mut forged = signed.clone();
    forged.lo_tier = 1;
    forged.hi_tier = 1;
    let att = e.attestor.insecure_clone();
    let f = record_signed_by(&mut e, &forged, &att, &signed).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::WrongMessage)), "{:?}", f.err);

    // swapped wallet
    let mut forged = signed.clone();
    forged.hi_wallet = Pubkey::new_unique();
    let f = record_signed_by(&mut e, &forged, &att, &signed).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::WrongMessage)), "{:?}", f.err);

    // different seen_at inside the same day
    let mut forged = signed.clone();
    forged.seen_at += 60;
    let f = record_signed_by(&mut e, &forged, &att, &signed).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::WrongMessage)), "{:?}", f.err);
    assert!(e.svm.get_account(&encounter_pda(&lo.id, &hi.id, signed.day)).is_none());
}

#[test]
fn day_and_clock_bounds_enforced() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, true, true);

    let mut r = rec(&lo, &hi, T0);
    r.day += 1;
    let f = record(&mut e, &r).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::DayMismatch)), "{:?}", f.err);

    let f = record(&mut e, &rec(&lo, &hi, T0 - DAY - 1)).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::SeenAtOutOfRange)), "{:?}", f.err);
    let f = record(&mut e, &rec(&lo, &hi, T0 + DAY + 1)).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::SeenAtOutOfRange)), "{:?}", f.err);

    // boundary: exactly one day back is accepted
    record(&mut e, &rec(&lo, &hi, T0 - DAY)).unwrap();
}

#[test]
fn missing_or_misdirected_ed25519_fails() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, true, true);
    let r = rec(&lo, &hi, T0);
    let relayer = Keypair::new();
    e.svm.airdrop(&relayer.pubkey(), 10_000_000_000).unwrap();

    let ix = record_ix(&e, &relayer.pubkey(), &r);
    let f = send(&mut e.svm, &relayer, &[ix]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::MissingEd25519)), "{:?}", f.err);

    // ed25519 ix present but a no-op sits between it and record_encounter
    let att = e.attestor.insecure_clone();
    let ed = ed_ix(&att, &attest_msg(&r));
    let pad = solana_sdk::system_instruction::transfer(&relayer.pubkey(), &relayer.pubkey(), 1);
    let ix = record_ix(&e, &relayer.pubkey(), &r);
    let f = send(&mut e.svm, &relayer, &[ed, pad, ix]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::MissingEd25519)), "{:?}", f.err);

    // offsets pointing at instruction 0 instead of u16::MAX
    let mut ed = ed_ix(&att, &attest_msg(&r));
    for off in [4usize, 8, 14] {
        ed.data[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
    }
    let ix = record_ix(&e, &relayer.pubkey(), &r);
    let f = send(&mut e.svm, &relayer, &[ed, ix]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::BadEd25519)), "{:?}", f.err);
}

struct Waveable {
    lo: Party,
    hi: Party,
    day: u32,
}

fn waveable(e: &mut Env) -> Waveable {
    let (lo, hi) = pair(e, true, true);
    let r = rec(&lo, &hi, T0);
    record(e, &r).unwrap();
    set_token_account(&mut e.svm, get_associated_token_address(&lo.wallet.pubkey(), &e.mint), e.mint, lo.wallet.pubkey(), 50_000_000);
    set_token_account(&mut e.svm, get_associated_token_address(&hi.wallet.pubkey(), &e.mint), e.mint, hi.wallet.pubkey(), 7_000_000);
    Waveable { lo, hi, day: r.day }
}

fn wave_ix(e: &Env, w: &Waveable, signer: &Pubkey, receiver: &Party, amount: u64) -> Instruction {
    Instruction {
        program_id: passersby::ID,
        accounts: accounts::Wave {
            signer: *signer,
            config: e.config,
            encounter: encounter_pda(&w.lo.id, &w.hi.id, w.day),
            skr_mint: e.mint,
            signer_token: get_associated_token_address(signer, &e.mint),
            receiver: receiver.wallet.pubkey(),
            receiver_token: get_associated_token_address(&receiver.wallet.pubkey(), &e.mint),
            receiver_profile: profile_pda(&receiver.id),
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::Wave { amount }.data(),
    }
}

#[test]
fn wave_transfers_exact_amount_and_counts_receipt() {
    let mut e = setup();
    let w = waveable(&mut e);
    let lo_ata = get_associated_token_address(&w.lo.wallet.pubkey(), &e.mint);
    let hi_ata = get_associated_token_address(&w.hi.wallet.pubkey(), &e.mint);

    // lo waves 5 SKR at hi
    let ix = wave_ix(&e, &w, &w.lo.wallet.pubkey(), &w.hi, 5_000_000);
    send(&mut e.svm, &w.lo.wallet, &[ix]).unwrap();
    assert_eq!(token_balance(&e.svm, &lo_ata), Some(45_000_000));
    assert_eq!(token_balance(&e.svm, &hi_ata), Some(12_000_000));
    assert_eq!(profile(&e, &w.hi.id).waves_received, 1);
    assert_eq!(profile(&e, &w.lo.id).waves_received, 0);

    // hi waves 1 base unit back at lo
    let ix = wave_ix(&e, &w, &w.hi.wallet.pubkey(), &w.lo, 1);
    send(&mut e.svm, &w.hi.wallet, &[ix]).unwrap();
    assert_eq!(token_balance(&e.svm, &hi_ata), Some(11_999_999));
    assert_eq!(token_balance(&e.svm, &lo_ata), Some(45_000_001));
    assert_eq!(profile(&e, &w.lo.id).waves_received, 1);

    // twice more from lo: counter accumulates
    for _ in 0..2 {
        let ix = wave_ix(&e, &w, &w.lo.wallet.pubkey(), &w.hi, 10_000_000);
        send(&mut e.svm, &w.lo.wallet, &[ix]).unwrap();
    }
    assert_eq!(profile(&e, &w.hi.id).waves_received, 3);
    assert_eq!(token_balance(&e.svm, &hi_ata), Some(31_999_999));
}

#[test]
fn wave_creates_receiver_token_account_when_missing() {
    let mut e = setup();
    let (lo, hi) = pair(&mut e, true, true);
    record(&mut e, &rec(&lo, &hi, T0)).unwrap();
    set_token_account(&mut e.svm, get_associated_token_address(&lo.wallet.pubkey(), &e.mint), e.mint, lo.wallet.pubkey(), 9_000_000);
    let hi_ata = get_associated_token_address(&hi.wallet.pubkey(), &e.mint);
    assert!(e.svm.get_account(&hi_ata).is_none());
    let w = Waveable { lo, hi, day: (T0 / DAY) as u32 };
    let ix = wave_ix(&e, &w, &w.lo.wallet.pubkey(), &w.hi, 3_000_000);
    send(&mut e.svm, &w.lo.wallet, &[ix]).unwrap();
    assert_eq!(token_balance(&e.svm, &hi_ata), Some(3_000_000));
}

#[test]
fn wave_by_third_party_fails() {
    let mut e = setup();
    let w = waveable(&mut e);
    let stranger = party(&mut e, true);
    set_token_account(&mut e.svm, get_associated_token_address(&stranger.wallet.pubkey(), &e.mint), e.mint, stranger.wallet.pubkey(), 20_000_000);
    let stranger_ata = get_associated_token_address(&stranger.wallet.pubkey(), &e.mint);
    let hi_ata = get_associated_token_address(&w.hi.wallet.pubkey(), &e.mint);

    for target in [&w.hi, &w.lo] {
        let ix = wave_ix(&e, &w, &stranger.wallet.pubkey(), target, 1_000_000);
        let f = send(&mut e.svm, &stranger.wallet, &[ix]).unwrap_err();
        assert_eq!(custom(&f), Some(code(PassersbyError::NotParticipant)), "{:?}", f.err);
    }
    assert_eq!(token_balance(&e.svm, &stranger_ata), Some(20_000_000));
    assert_eq!(token_balance(&e.svm, &hi_ata), Some(7_000_000));
    assert_eq!(profile(&e, &w.hi.id).waves_received, 0);
}

#[test]
fn wave_zero_amount_and_wrong_receiver_fail() {
    let mut e = setup();
    let w = waveable(&mut e);
    let ix = wave_ix(&e, &w, &w.lo.wallet.pubkey(), &w.hi, 0);
    let f = send(&mut e.svm, &w.lo.wallet, &[ix]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::InvalidAmount)), "{:?}", f.err);

    // lo tries to route the wave to an unrelated wallet whose profile exists
    let (x, y) = pair(&mut e, true, true);
    record(&mut e, &rec(&x, &y, T0)).unwrap();
    let ix = wave_ix(&e, &w, &w.lo.wallet.pubkey(), &x, 1_000_000);
    let f = send(&mut e.svm, &w.lo.wallet, &[ix]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::WrongReceiver)), "{:?}", f.err);

    // lo waves at itself
    let ix = wave_ix(&e, &w, &w.lo.wallet.pubkey(), &w.lo, 1_000_000);
    let f = send(&mut e.svm, &w.lo.wallet, &[ix]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::WrongReceiver)), "{:?}", f.err);
}

#[test]
fn set_attestor_is_admin_only_and_rotates_trust() {
    let mut e = setup();
    let new_att = Keypair::new();
    let cfg = e.config;
    let set = |signer: &Pubkey| Instruction {
        program_id: passersby::ID,
        accounts: accounts::SetAttestor { admin: *signer, config: cfg }.to_account_metas(None),
        data: instruction::SetAttestor { attestor: new_att.pubkey() }.data(),
    };
    let stranger = party(&mut e, true);
    let f = send(&mut e.svm, &stranger.wallet, &[set(&stranger.wallet.pubkey())]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::NotAdmin)), "{:?}", f.err);
    let admin = e.admin.insecure_clone();
    send(&mut e.svm, &admin, &[set(&admin.pubkey())]).unwrap();

    let (lo, hi) = pair(&mut e, true, true);
    let r = rec(&lo, &hi, T0);
    let f = record(&mut e, &r).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::WrongAttestor)), "{:?}", f.err);
    record_signed_by(&mut e, &r, &new_att, &r).unwrap();
}

#[test]
fn config_initialization_rejects_substituted_program_data() {
    let mut e = uninitialized();
    let attacker = Keypair::new();
    e.svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();
    let fake = Pubkey::new_unique();
    let mut account = e.svm.get_account(&program_data_pda()).unwrap();
    account.data[13..45].copy_from_slice(attacker.pubkey().as_ref());
    e.svm.set_account(fake, account).unwrap();
    let mut ix = init_ix(&e, attacker.pubkey());
    ix.accounts[4].pubkey = fake;
    let f = send(&mut e.svm, &attacker, &[ix]).unwrap_err();
    assert_eq!(custom(&f), Some(code(PassersbyError::NotAdmin)), "{:?}", f.err);
    assert!(e.svm.get_account(&e.config).is_none());
}
