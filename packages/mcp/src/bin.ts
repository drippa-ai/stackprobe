#!/usr/bin/env node
// Runs the stackprobe MCP server over stdio. Scans are kept in ~/.stackprobe/scans.db,
// or in the file named by STACKPROBE_DB. With TYPESAFE_API_KEY set, Jev helps classify surfaces.
import { NodeNet } from '@drippa/stackprobe-core/node';
import { deciderFromEnv } from '@drippa/stackprobe-decider-typesafe';
import { defaultDatabasePath, SqliteStore } from '@drippa/stackprobe-store-sqlite';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';

const store = new SqliteStore(process.env.STACKPROBE_DB || defaultDatabasePath());
const decider = deciderFromEnv();
const server = createServer({ store, net: new NodeNet(), ...(decider ? { decider } : {}) });
await server.connect(new StdioServerTransport());
