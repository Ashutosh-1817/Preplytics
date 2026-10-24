// One-time cleanup for accounts with fake or placeholder emails (e.g. demo@demo.com), which
// is what causes the daily "Delivery incomplete" bounce mails.
//
//   node scripts/cleanupEmails.js            -> dry run: only lists what it would change
//   node scripts/cleanupEmails.js --apply    -> turns email reminders OFF for those accounts
//   node scripts/cleanupEmails.js --delete   -> (with --apply) deletes them completely instead
//
// Accounts with real addresses are left alone. They simply have to verify their email once
// (a code is sent at their next login) before reminder emails resume.

import mongoose from 'mongoose';
import config from '../src/config/env.js';
import User from '../src/models/User.model.js';
import { assessEmailDomain } from '../src/utils/emailChecks.js';

const apply = process.argv.includes('--apply');
const remove = process.argv.includes('--delete');

await mongoose.connect(config.mongoUri);

const users = await User.find({}).select('_id name email emailVerified emailNotificationsEnabled');
const fake = [];

for (const user of users) {
  const result = await assessEmailDomain(user.email);
  if (!result.ok) fake.push({ user, why: result.reason });
}

console.log(`\nChecked ${users.length} accounts. Fake or undeliverable addresses: ${fake.length}\n`);
for (const { user, why } of fake) console.log(`  ${user.email.padEnd(36)} ${user.name}  (${why})`);

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to turn their email reminders off (or --apply --delete to remove them).');
} else if (remove) {
  const ids = fake.map((f) => f.user._id);
  const res = await User.deleteMany({ _id: { $in: ids } });
  console.log(`\nDeleted ${res.deletedCount} accounts. (Their goals and notes stay in the database; delete them from Atlas if you want a fully clean state.)`);
} else {
  const ids = fake.map((f) => f.user._id);
  const res = await User.updateMany({ _id: { $in: ids } }, { $set: { emailNotificationsEnabled: false } });
  console.log(`\nTurned email reminders off for ${res.modifiedCount} accounts. The bounce mails will stop.`);
}

await mongoose.disconnect();