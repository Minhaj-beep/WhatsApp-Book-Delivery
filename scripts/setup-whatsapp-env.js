#!/usr/bin/env node

console.log('\n=== WhatsApp Integration Setup ===\n');
console.log('Please run these commands in your terminal to configure Twilio credentials:\n');
console.log('supabase secrets set WHATSAPP_PROVIDER_API_KEY=process.env.WHATSAPP_PROVIDER_API_KEY');
console.log('supabase secrets set WHATSAPP_PROVIDER_API_SECRET=process.env.WHATSAPP_PROVIDER_API_SECRET');
console.log('supabase secrets set WHATSAPP_PHONE_NUMBER_ID=whatsapp:+14155238886');
console.log('\n=== Important: Fix Twilio Sandbox Configuration ===\n');
console.log('Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
console.log('Click "Sandbox settings" tab');
console.log('\nChange "When a message comes in" URL to:');
console.log('https://mpzbjarolsbbsuvzbsya.supabase.co/functions/v1/whatsapp-webhook');
console.log('\nMethod: POST');
console.log('\nClick "Save" and try sending "1001" again!\n');
