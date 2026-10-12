import { test } from "node:test";
import assert from "node:assert/strict";
import { isSgtMint, SGT_GROUP, TOKEN_2022 } from "./sgt";

const MINT = "D2ehKLUQApN8ZxcANjwuTJC7bk7BMJn2voofXy17tCrs";
const AUTHORITY = "5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj";
function rpc(mint: Record<string, unknown>, owner = TOKEN_2022 as string) {
  return { getAccountInfo: (key: string) => ({ send: async () => ({ value: {
    owner: key === SGT_GROUP ? TOKEN_2022 : owner,
    data: { parsed: { type: "mint", info: key === SGT_GROUP
      ? { extensions: [{ extension: "tokenGroup", state: { updateAuthority: AUTHORITY } }] }
      : mint } },
  } }) }) } as unknown as Parameters<typeof isSgtMint>[0];
}

test("SGT rejects forged pointers and requires the authenticated member extension", async () => {
  const fake = { mintAuthority: AUTHORITY, extensions: [
    { extension: "groupMemberPointer", state: { authority: AUTHORITY, memberAddress: SGT_GROUP } },
    { extension: "metadataPointer", state: { authority: AUTHORITY } },
  ] };
  assert.equal(await isSgtMint(rpc(fake), MINT), false);
  const member = { mintAuthority: AUTHORITY, extensions: [
    { extension: "tokenGroupMember", state: { group: SGT_GROUP, mint: MINT } },
  ] };
  assert.equal(await isSgtMint(rpc(member), MINT), true);
  assert.equal(await isSgtMint(rpc(member, "11111111111111111111111111111111"), MINT), false);
  assert.equal(await isSgtMint(rpc({ ...member, mintAuthority: MINT }), MINT), false);
  assert.equal(await isSgtMint(rpc({ ...member, extensions: [
    { extension: "tokenGroupMember", state: { group: MINT } },
  ] }), MINT), false);
});
