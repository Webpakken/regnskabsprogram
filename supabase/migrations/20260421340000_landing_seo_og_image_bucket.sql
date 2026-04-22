-- Offentligt tilgængelige OG-/SEO-billeder (WhatsApp, crawlers). Kun superadmin uploader.

insert into storage.buckets (id, name, public)
values ('landing-seo', 'landing-seo', true)
on conflict (id) do nothing;

create policy "Public read landing seo objects"
on storage.objects for select
using (bucket_id = 'landing-seo');

create policy "Superadmin insert landing seo objects"
on storage.objects for insert
with check (
  bucket_id = 'landing-seo'
  and name like 'og/%'
  and exists (
    select 1 from public.platform_staff
    where user_id = auth.uid() and role = 'superadmin'
  )
);

create policy "Superadmin update landing seo objects"
on storage.objects for update
using (
  bucket_id = 'landing-seo'
  and exists (
    select 1 from public.platform_staff
    where user_id = auth.uid() and role = 'superadmin'
  )
)
with check (
  bucket_id = 'landing-seo'
  and name like 'og/%'
  and exists (
    select 1 from public.platform_staff
    where user_id = auth.uid() and role = 'superadmin'
  )
);

create policy "Superadmin delete landing seo objects"
on storage.objects for delete
using (
  bucket_id = 'landing-seo'
  and exists (
    select 1 from public.platform_staff
    where user_id = auth.uid() and role = 'superadmin'
  )
);
