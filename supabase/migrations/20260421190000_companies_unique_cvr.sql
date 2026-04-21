-- Én konto pr. CVR: unik når CVR er sat (normaliseret trim + lower for konsistens).

-- Tom/blank CVR behandles som ingen CVR
update public.companies
set cvr = null
where cvr is not null and length(trim(both from cvr)) = 0;

-- Fjern duplikater: behold ældste virksomhed pr. normaliseret CVR (cascade sletter barn-data på de andre)
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(both from cvr))
      order by created_at asc, id asc
    ) as rn
  from public.companies
  where cvr is not null and length(trim(both from cvr)) > 0
)
delete from public.companies c
using ranked r
where c.id = r.id and r.rn > 1;

create unique index companies_cvr_unique
on public.companies (lower(trim(both from cvr)))
where cvr is not null and length(trim(both from cvr)) > 0;
