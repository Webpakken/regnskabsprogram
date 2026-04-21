-- Faktura/kundemails: From-navn sættes ved udsendelse fra virksomhedens navn, ikke fra platform SMTP-formularen.
update public.platform_smtp_profiles
set from_name = null
where id = 'transactional';
