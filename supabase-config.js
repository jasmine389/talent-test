// Supabase 配置
const SUPABASE_URL = 'https://sezvjgokrkibojnnhfyx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sjhBl2F6mAY3PlmJaQkQ9g_daK4YwNt';

let supabaseClient = null;

if (typeof supabase !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
} else {
  console.info('[财运测试] Supabase 未配置，密码验证使用本地降级模式');
}

function getSupabaseClient() {
  return supabaseClient;
}
