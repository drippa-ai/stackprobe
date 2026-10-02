// Node-only entry point: `@drippa/stackprobe-core/node`. The main entry never does I/O.
export type { NodeNetOptions } from './net.ts';
export { isPrivateAddress, NodeNet, USER_AGENT } from './net.ts';
