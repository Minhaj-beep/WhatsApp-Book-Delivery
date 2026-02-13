import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  console.error('Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAdminUser() {
  try {
    const email = 'admin@example.com';
    const password = 'admin123';

    console.log('Creating admin user...');

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Admin User'
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log('User already exists, looking up...');

        const { data: users, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = users.users.find(u => u.email === email);
        if (existingUser) {
          console.log('Found existing user:', existingUser.id);

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', existingUser.id)
            .maybeSingle();

          if (!profile) {
            console.log('Creating profile for existing user...');
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: existingUser.id,
                full_name: 'Admin User',
                role: 'admin',
                phone: '919999999999'
              });

            if (insertError) throw insertError;
          } else {
            console.log('Profile already exists');

            if (profile.role !== 'admin') {
              console.log('Updating role to admin...');
              const { error: updateError } = await supabase
                .from('profiles')
                .update({ role: 'admin' })
                .eq('id', existingUser.id);

              if (updateError) throw updateError;
            }
          }

          console.log('\n✅ Admin user ready!');
          console.log('📧 Email:', email);
          console.log('🔑 Password: admin123');
          console.log('👤 Role: admin\n');
          return;
        }
      }
      throw authError;
    }

    console.log('User created:', authData.user.id);

    console.log('Creating profile...');
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: 'Admin User',
        role: 'admin',
        phone: '919999999999'
      });

    if (profileError) throw profileError;

    console.log('\n✅ Admin user created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password: admin123');
    console.log('👤 Role: admin\n');
    console.log('You can now log in to the admin panel.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdminUser();
