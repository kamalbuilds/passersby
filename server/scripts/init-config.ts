// Usage: tsx scripts/init-config.ts <admin-keypair.json> <attestor-pubkey> <skr-mint> [rpcUrl]
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { AccountRole, address, createKeyPairSignerFromBytes, createSolanaRpc, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { DEFAULT_DEVNET_RPC, DEFAULT_PROGRAM_ID, sendInstructions } from "../lib/chain";

async function main() {
  const [keyfile, attestor, skrMint, rpcUrl] = process.argv.slice(2);
  if (!keyfile || !attestor || !skrMint) throw new Error("usage: init-config <admin-keypair.json> <attestor> <skr-mint> [rpcUrl]");
  const admin = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(keyfile, "utf8"))));
  const rpc = createSolanaRpc(rpcUrl ?? DEFAULT_DEVNET_RPC);
  const programAddress = address(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const enc = getAddressEncoder();
  const [config] = await getProgramDerivedAddress({ programAddress, seeds: [new TextEncoder().encode("config")] });
  const loader = address("BPFLoaderUpgradeab1e11111111111111111111111");
  const [programData] = await getProgramDerivedAddress({ programAddress: loader, seeds: [enc.encode(programAddress)] });
  const data = Buffer.concat([
    createHash("sha256").update("global:init_config").digest().subarray(0, 8),
    Buffer.from(enc.encode(address(attestor))),
    Buffer.from(enc.encode(address(skrMint))),
  ]);
  const signature = await sendInstructions(rpc, admin, [
    {
      programAddress,
      accounts: [
        { address: admin.address, role: AccountRole.WRITABLE_SIGNER },
        { address: config, role: AccountRole.WRITABLE },
        { address: address("11111111111111111111111111111111"), role: AccountRole.READONLY },
        { address: programAddress, role: AccountRole.READONLY },
        { address: programData, role: AccountRole.READONLY },
      ],
      data,
    },
  ]);
  const acct = await rpc.getAccountInfo(config, { encoding: "base64", commitment: "confirmed" }).send();
  if (!acct.value) throw new Error("Config account missing after init_config");
  const d = Buffer.from(acct.value.data[0], "base64");
  const dec = getAddressDecoder();
  const b58 = (o: number) => dec.decode(d.subarray(o, o + 32));
  console.log(JSON.stringify({ signature, config, admin: b58(8), attestor: b58(40), skrMint: b58(72) }));
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
