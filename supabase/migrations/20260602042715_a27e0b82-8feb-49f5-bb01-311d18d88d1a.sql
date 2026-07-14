-- Create public 'productos' storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read access for product images
CREATE POLICY "Public read productos images"
ON storage.objects FOR SELECT
USING (bucket_id = 'productos');

-- Authenticated users can upload product images
CREATE POLICY "Authenticated upload productos images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'productos');

-- Authenticated users can update product images
CREATE POLICY "Authenticated update productos images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'productos');

-- Authenticated users can delete product images
CREATE POLICY "Authenticated delete productos images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'productos');
