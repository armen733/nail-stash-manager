UPDATE public.company_settings
SET contact_phone = '+1 (213) 563-10-90, +1 (424) 599-8214'
WHERE contact_phone IS NULL OR contact_phone = '';