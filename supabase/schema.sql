-- ============================================
-- 财运体质测试 · Supabase 初始化脚本
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 密钥表
create table if not exists public.cards (
  id bigint generated always as identity primary key,
  code text unique not null,
  max_uses int not null default 3,        -- 每个密钥可测试次数
  used_count int not null default 0,      -- 已使用次数
  created_at timestamptz not null default now()
);

-- 启用 RLS：前端匿名用户无法直接读写表（防止枚举密钥/篡改数据）
alter table public.cards enable row level security;

-- 原子扣减函数：验证密钥并 +1，返回 JSON 结果
-- 前端通过 supabase.rpc('use_card', { p_code: 'CF-XXXX-XXXX-XXXX' }) 调用
create or replace function public.use_card(p_code text)
returns json
language plpgsql
security definer
as $$
declare
  v_card record;
begin
  select * into v_card
  from public.cards
  where code = upper(trim(p_code));

  if not found then
    return json_build_object('ok', false, 'message', '密钥无效，请检查输入或联系客服');
  end if;

  if v_card.used_count >= v_card.max_uses then
    return json_build_object('ok', false, 'message', '该密钥已用完，请更换新密钥');
  end if;

  update public.cards
  set used_count = used_count + 1
  where id = v_card.id;

  return json_build_object(
    'ok', true,
    'remaining', v_card.max_uses - v_card.used_count - 1
  );
end;
$$;

-- 只允许匿名用户调用该函数，表本身不可访问
grant execute on function public.use_card(text) to anon;

-- （可选）管理查询：查看密钥使用情况
-- select code, used_count, max_uses, created_at from public.cards order by id desc limit 20;
