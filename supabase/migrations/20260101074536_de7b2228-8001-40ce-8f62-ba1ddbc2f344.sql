-- Create a public bucket for brand assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to brand assets
CREATE POLICY "Brand assets are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'brand-assets');

-- Allow authenticated users to upload brand assets (for admin use)
CREATE POLICY "Authenticated users can upload brand assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');