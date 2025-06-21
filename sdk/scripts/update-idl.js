#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script to update the embedded IDL from the target folder
 * Run this after building the Anchor program
 */

const targetIdlPath = path.join(__dirname, '../../../target/idl/hook_amm.json');
const sdkIdlPath = path.join(__dirname, '../src/idl.ts');

try {
  // Read the IDL from target folder
  const idlContent = fs.readFileSync(targetIdlPath, 'utf8');
  const idl = JSON.parse(idlContent);
  
  // Generate TypeScript file content
  const tsContent = `import { Idl } from '@coral-xyz/anchor';

export const IDL: Idl = ${JSON.stringify(idl, null, 2)};`;
  
  // Write to SDK
  fs.writeFileSync(sdkIdlPath, tsContent);
  
  console.log('✅ IDL updated successfully');
  console.log(`   From: ${targetIdlPath}`);
  console.log(`   To: ${sdkIdlPath}`);
  
} catch (error) {
  console.error('❌ Error updating IDL:', error.message);
  console.log('\nMake sure to:');
  console.log('1. Run "anchor build" first');
  console.log('2. Check that target/idl/hook_amm.json exists');
  process.exit(1);
}