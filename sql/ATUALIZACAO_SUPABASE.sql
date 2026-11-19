-- Maria Caru | Atualização de horários e disponibilidade por tamanho
-- Execute uma única vez no Supabase > SQL Editor.
-- Não apaga pedidos nem altera a estrutura da tabela public.pedidos.
--
-- IMPORTANTE:
-- Pedidos presenciais são identificados pelo status "presencial" E pela
-- sessão autenticada do administrador. Não usamos o texto do endereço como
-- critério, pois um cliente online poderia enviar o mesmo endereço.

create table if not exists public.configuracao_loja (
  id boolean primary key default true check (id = true),
  fechamento_manual boolean not null default false,
  horarios jsonb not null default '{
    "0":{"aberto":false,"inicio":"11:00","fim":"15:00"},
    "1":{"aberto":true,"inicio":"11:00","fim":"15:00"},
    "2":{"aberto":true,"inicio":"11:00","fim":"15:00"},
    "3":{"aberto":true,"inicio":"11:00","fim":"15:00"},
    "4":{"aberto":true,"inicio":"11:00","fim":"15:00"},
    "5":{"aberto":true,"inicio":"11:00","fim":"15:00"},
    "6":{"aberto":true,"inicio":"11:00","fim":"15:00"}
  }'::jsonb,
  atualizado_em timestamptz not null default now()
);

insert into public.configuracao_loja (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.produtos_disponibilidade_v2 (
  chave text primary key,
  disponivel boolean not null default true,
  atualizado_em timestamptz not null default now()
);

alter table public.configuracao_loja enable row level security;
alter table public.produtos_disponibilidade_v2 enable row level security;

drop policy if exists "Leitura publica da configuracao da loja" on public.configuracao_loja;
create policy "Leitura publica da configuracao da loja"
on public.configuracao_loja
for select to anon, authenticated
using (true);

drop policy if exists "Gestor administra configuracao da loja" on public.configuracao_loja;
create policy "Gestor administra configuracao da loja"
on public.configuracao_loja
for all to authenticated
using ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com')
with check ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com');

drop policy if exists "Leitura publica disponibilidade v2" on public.produtos_disponibilidade_v2;
create policy "Leitura publica disponibilidade v2"
on public.produtos_disponibilidade_v2
for select to anon, authenticated
using (true);

drop policy if exists "Gestor administra disponibilidade v2" on public.produtos_disponibilidade_v2;
create policy "Gestor administra disponibilidade v2"
on public.produtos_disponibilidade_v2
for all to authenticated
using ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com')
with check ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com');

grant select on public.configuracao_loja, public.produtos_disponibilidade_v2 to anon, authenticated;
grant insert, update, delete on public.configuracao_loja, public.produtos_disponibilidade_v2 to authenticated;

-- Validação no banco: impede pedido online com loja fechada ou item indisponível.
-- A exceção presencial só é aceita quando o pedido foi lançado pelo usuário
-- administrador autenticado e marcado pelo painel com status = "presencial".
create or replace function public.validar_pedido_maria_caru()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.configuracao_loja%rowtype;
  agora_local timestamp;
  dia_semana text;
  faixa jsonb;
  inicio_hora time;
  fim_hora time;
  item jsonb;
  nome_item text;
  tamanho_item text;
  chave_item text;
  disponivel_item boolean;
  email_autenticado text;
begin
  email_autenticado := lower(coalesce(auth.jwt() ->> 'email', ''));

  -- Pedido presencial: exige a sessão autenticada do administrador.
  -- O texto do endereço, sozinho, nunca libera a validação.
  if coalesce(new.status, '') = 'presencial'
     and email_autenticado = 'mariacaruloja@gmail.com' then
    return new;
  end if;

  select * into cfg
  from public.configuracao_loja
  where id = true;

  if not found then
    raise exception 'A loja ainda não foi configurada. Tente novamente em instantes.';
  end if;

  if cfg.fechamento_manual then
    raise exception 'A Maria Caru está temporariamente fechada. Tente novamente mais tarde.';
  end if;

  agora_local := now() at time zone 'America/Sao_Paulo';
  dia_semana := extract(dow from agora_local)::int::text;
  faixa := cfg.horarios -> dia_semana;

  if faixa is null or coalesce((faixa ->> 'aberto')::boolean, false) is false then
    raise exception 'A Maria Caru está fechada neste dia. Confira nossos horários no cardápio.';
  end if;

  inicio_hora := (faixa ->> 'inicio')::time;
  fim_hora := (faixa ->> 'fim')::time;

  if agora_local::time < inicio_hora or agora_local::time >= fim_hora then
    raise exception 'Estamos fora do horário de funcionamento. Confira os horários no cardápio.';
  end if;

  if jsonb_typeof(new.itens) = 'array' then
    for item in
      select value from jsonb_array_elements(new.itens)
    loop
      nome_item := lower(trim(coalesce(item ->> 'nome', '')));
      tamanho_item := upper(trim(coalesce(item ->> 'tamanho', '')));

      chave_item := case
        when nome_item = 'costela cozida' then 'costela-cozida'
        when nome_item in ('baião de dois', 'baiao de dois') then 'baiao-de-dois'
        when nome_item = 'estrogonofe' then 'estrogonofe'
        when nome_item = 'parmegiana' then 'parmegiana'
        when nome_item = 'marmita de calabresa acebolada' then 'calabresa'
        when nome_item in ('marmita de filé de frango', 'marmita de file de frango') then 'file-frango'
        when nome_item = 'marmita de omelete' then 'omelete'
        when nome_item = 'suco de abacaxi' then 'suco-abacaxi'
        when nome_item like 'refrigerante%' then 'refrigerantes'
        else null
      end;

      if chave_item is not null then
        chave_item := chave_item || '-' ||
          case when tamanho_item in ('P', 'M', 'G') then tamanho_item else 'unico' end;

        disponivel_item := true;
        select d.disponivel
        into disponivel_item
        from public.produtos_disponibilidade_v2 d
        where d.chave = chave_item;

        if coalesce(disponivel_item, true) is false then
          raise exception 'O item % (%) está esgotado. Atualize o cardápio e tente novamente.',
            nome_item, coalesce(tamanho_item, 'único');
        end if;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_pedido_maria_caru on public.pedidos;
create trigger trg_validar_pedido_maria_caru
before insert on public.pedidos
for each row
execute function public.validar_pedido_maria_caru();

-- Compatibilidade: as configurações antigas de disponibilidade são preservadas.
-- O painel atualizado deve gravar pedidos presenciais com status = "presencial".
-- Faça a primeira configuração dos horários e tamanhos pelo painel atualizado.
