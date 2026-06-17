-- Bilago: nye bilag skal som udgangspunkt være "ikke betalt". Brugeren afkrydser
-- som betalt når regningen faktisk er betalt. Betalingsstatus er nu afkoblet fra
-- bilagstype og gælder alle bilag (kvitteringer såvel som regninger).
-- Eksisterende rækker røres ikke — kun standardværdien for nye uploads ændres.
alter table public.vouchers alter column payment_status set default 'unpaid';
