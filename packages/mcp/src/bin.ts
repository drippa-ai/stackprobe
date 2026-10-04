#!/usr/bin/env node
// Runs the stackprobe MCP server over stdio. Scans are kept in ~/.stackprobe/scans.db,
// or in the file named by STACKPROBE_DB.
import { NodeNet } from '@drippa/stackprobe-core/node';
import { defaultDatabasePath, SqliteStore } from '@drippa/stackprobe-store-sqlite';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';

const store = new SqliteStore(process.env.STACKPROBE_DB || defaultDatabasePath());
const server = createServer({ store, net: new NodeNet() });
await server.connect(new StdioServerTransport());
