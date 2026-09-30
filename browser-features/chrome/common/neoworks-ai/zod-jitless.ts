// SPDX-License-Identifier: MPL-2.0

// Zod (used by the ACP SDK inside the harness client) probes for eval with
// `new Function` on load, and debug Gecko aborts on eval with the system
// principal. Zod reads this global config before probing, so this module is
// imported ahead of the client.

const zodGlobal = globalThis as unknown as { __zod_globalConfig?: { jitless?: boolean } };
zodGlobal.__zod_globalConfig = { ...zodGlobal.__zod_globalConfig, jitless: true };
