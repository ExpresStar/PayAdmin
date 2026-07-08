#!/usr/bin/env node
// setup-admin-passwords.js
// Generate bcrypt hashes for admin passwords

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://lnlzrfubxeiocdtcgtgg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // Ganti dengan service role key

const sb = createClient(supabaseUrl, supabaseKey);

const ADMINS = [
  { email: 'baobei908@918pay.local', password: 'bobi908' },
  { email: 'operator908@918pay.local', password: 'bobi908' }
];

async function hashPasswords() {
  console.log('🔐 Hashing admin passwords...\n');
  
  for (const admin of ADMINS) {
    try {
      const hash = await bcrypt.hash(admin.password, 10);
      console.log(`✅ ${admin.email}`);
      console.log(`   Password: ${admin.password}`);
      console.log(`   Hash: ${hash}\n`);

      // Update di database
      const { error } = await sb
        .from('admin_users')
        .update({ password_hash: hash })
        .eq('email', admin.email);

      if (error) {
        console.error(`❌ Error updating ${admin.email}:`, error.message);
      } else {
        console.log(`   ✓ Database updated\n`);
      }
    } catch (err) {
      console.error(`❌ Error hashing password for ${admin.email}:`, err.message);
    }
  }

  console.log('✅ Setup complete!');
  console.log('\n📝 SIMPAN PASSWORD INI DI TEMPAT AMAN:');
  ADMINS.forEach(a => {
    console.log(`   ${a.email}: ${a.password}`);
  });
  process.exit(0);
}

hashPasswords().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
