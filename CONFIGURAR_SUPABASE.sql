-- Maria Caru: políticas de acesso para a tabela public.pedidos
-- Execute no SQL Editor do Supabase depois de criar o usuário administrador.

-- Clientes podem inserir pedidos (a política de INSERT já foi criada na etapa anterior).
-- Somente o e-mail administrador pode consultar, atualizar e excluir pedidos.
drop policy if exists "Gestor pode visualizar pedidos" on public.pedidos;
create policy "Gestor pode visualizar pedidos"
on public.pedidos for select to authenticated
using ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com');

drop policy if exists "Gestor pode atualizar pedidos" on public.pedidos;
create policy "Gestor pode atualizar pedidos"
on public.pedidos for update to authenticated
using ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com')
with check ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com');

drop policy if exists "Gestor pode excluir pedidos" on public.pedidos;
create policy "Gestor pode excluir pedidos"
on public.pedidos for delete to authenticated
using ((auth.jwt() ->> 'email') = 'mariacaruloja@gmail.com');

grant select, insert, update, delete on table public.pedidos to anon, authenticated;
grant usage, select on sequence public.pedidos_id_seq to anon, authenticated;
