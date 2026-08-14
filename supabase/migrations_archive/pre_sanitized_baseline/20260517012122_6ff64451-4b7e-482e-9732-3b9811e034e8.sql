
-- 1. Add costo_unitario
ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC NOT NULL DEFAULT 0;

-- Allow admins to update insumos (for cost editing)
DROP POLICY IF EXISTS insumos_admin_modify ON public.insumos;
CREATE POLICY insumos_admin_modify ON public.insumos
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. Cost function
CREATE OR REPLACE FUNCTION public.calcular_costo_trago(p_producto_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(r.cantidad * i.costo_unitario), 0)
  FROM public.recetas r
  JOIN public.insumos i ON i.id = r.insumo_id
  WHERE r.producto_id = p_producto_id;
$$;

-- 3. Repopulate recetas for target products
DO $$
DECLARE
  -- insumos
  ron_blanco UUID := '01b81185-8e71-4089-8dbe-5ace119d9a3d';
  limon UUID := 'aae00913-f1c6-441b-b95d-0a7e0b72c583';
  azucar UUID := '00f04ffa-c08f-4cd3-8403-bf1f56edfccd';
  menta UUID := 'b9b2fefc-778c-4244-a9c2-70d31eec0578';
  hielo_cubo UUID := 'c893a86c-2a4c-4cc8-bbd1-ba8ee1c752ae';
  ginger UUID := 'f4be5f3f-b9be-4ca0-ab61-f47901359d69';
  curacao UUID := '6a89bb96-4d06-4346-ad6d-9fb72a1d01ae';
  vodka UUID := '27c973eb-7e90-44ae-a554-2a72904904cc';
  ron_coco UUID := 'cde027c0-f9ad-4dc3-8da2-23fbff1fece7';
  pulpa_coco UUID := 'f5df5b85-4978-4220-aba9-00d46cc132ab';
  hielo_frappe UUID := '6e69d243-0a14-42f3-a703-b815c27144aa';
  leche UUID := '8257e05f-1bfd-4141-b36f-f3c2ea64b5fa';

  -- mojitos productos
  m_cubano UUID := 'd8a38ae8-6953-460c-b87b-62f5cce53b45';
  m_blue UUID := '2b1523da-6dc0-40a4-a06e-c083c1d05cc2';
  m_black UUID := '2987409b-c39c-4525-a01b-f22b9657ba44';
  m_coco UUID := 'a8966375-4146-4ab2-b0ca-97e2d15c042f';
  m_cubano_sa UUID := '17638343-2245-48bf-aef1-ec734c268136';
  m_coco_sa UUID := '20b26a41-ee12-4338-b883-4fd8950ef86a';

  -- frutas: (producto_mojito, producto_mojito_sa, producto_colada, producto_colada_sa, pulpa)
  frutas TEXT[][] := ARRAY[
    ARRAY['911784fc-d336-4005-8e52-b909c6bb6aa5','856bbd5d-99db-474d-9a05-b69fd416ccfb','32715060-8142-4e8f-8bdd-77481acd84eb','e7f079fa-43ee-4c76-a393-68f79198c5bb','e19e3b9e-c213-42ea-a95f-3426588076ef'], -- frambuesa
    ARRAY['9863482b-b615-4d96-9c00-f158f6bd0693','13e97d94-2a29-4ccc-a996-f73d0eec203a','e1399271-ce72-49e5-a7ab-f5f2543ed7f7','788c9d5f-23fa-4120-945e-792ee819e3a8','4156c850-a6f6-4d8a-afb5-04127a15fd0f'], -- frutilla
    ARRAY['4b2ab16e-7ada-496b-b0b2-d5fe3c0a8d2e','603082f0-24ce-4c57-8a5f-1edcebf2eedb','41fd42cb-4a7f-469b-bfa1-91a4aef6273a','5d7f2eca-a37d-469d-a286-0acf408816a7','0ae7ea54-083f-4799-b574-756b927c5b55'], -- berries
    ARRAY['cd47bdae-4972-4c80-917b-7738b0fd7ac7','e6e68009-96a3-495f-8bc8-7a5d1f6bd197','cc1472b6-bcc0-424a-af21-07403e258512','65d3240d-92b8-48df-8c2c-c3c359d25d57','52fd2a96-a756-4670-b871-6afb3a47b4fa'], -- mango
    ARRAY['81058649-24d8-4f9f-84cb-82814cb2aa1d','f5d13ba3-d52e-4f9c-876e-6c1819e5ba0d','9fb067bb-6ce8-468f-895c-19e68fec7b41','574ab36b-36ef-44e9-bb56-50e0437dc4a4','e88c89ee-e952-4f86-a341-cae926a1fca1'], -- maracuya
    ARRAY['b46bc735-3ba8-4232-8260-e63c924d1617','2ea9f41d-028a-4da2-ab7b-5554dbb4694e','8a678530-2b34-41b0-b2b1-ae0f7049ccae','352c0052-5f63-46e1-9040-b5968371747b','760e5675-5dcf-4aed-a3f5-02b18ca13b41'], -- piña
    ARRAY['25f02542-ee17-49e8-bfed-ef108c25226d','d317ed82-c7a4-47f2-823f-329092d14d45','73be1247-5feb-4102-ab50-576b5ab64c6d','7a54d30a-9fae-4c68-b9e1-38673b74c3a2','f70f26d5-ba13-450b-872e-a75fa005cf26']  -- chirimoya
  ];

  target_products UUID[];
  i INT;
  p_mojito UUID; p_mojito_sa UUID; p_colada UUID; p_colada_sa UUID; pulpa UUID;
BEGIN
  -- Collect all affected product IDs
  target_products := ARRAY[m_cubano, m_blue, m_black, m_coco, m_cubano_sa, m_coco_sa];
  FOR i IN 1..array_length(frutas,1) LOOP
    target_products := target_products || ARRAY[
      frutas[i][1]::uuid, frutas[i][2]::uuid, frutas[i][3]::uuid, frutas[i][4]::uuid
    ];
  END LOOP;

  -- Wipe existing recetas for these products
  DELETE FROM public.recetas WHERE producto_id = ANY(target_products);

  -- Mojito Cubano
  INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
    (m_cubano, ron_blanco, 100),(m_cubano, limon, 100),(m_cubano, azucar, 130),
    (m_cubano, menta, 3),(m_cubano, hielo_cubo, 13),(m_cubano, ginger, 650);

  -- Mojito Blue
  INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
    (m_blue, ron_blanco, 100),(m_blue, limon, 150),(m_blue, azucar, 130),
    (m_blue, menta, 3),(m_blue, curacao, 150),(m_blue, hielo_cubo, 13),(m_blue, ginger, 500);

  -- Mojito Black
  INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
    (m_black, vodka, 150),(m_black, limon, 150),(m_black, azucar, 130),
    (m_black, menta, 3),(m_black, hielo_cubo, 13),(m_black, ginger, 500);

  -- Mojito Coco
  INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
    (m_coco, ron_coco, 100),(m_coco, limon, 100),(m_coco, azucar, 130),
    (m_coco, menta, 3),(m_coco, pulpa_coco, 125),(m_coco, hielo_cubo, 13),(m_coco, ginger, 500);

  -- Mojito Cubano S/A
  INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
    (m_cubano_sa, limon, 100),(m_cubano_sa, azucar, 130),(m_cubano_sa, menta, 3),
    (m_cubano_sa, hielo_cubo, 13),(m_cubano_sa, ginger, 650);

  -- Mojito Coco S/A
  INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
    (m_coco_sa, limon, 100),(m_coco_sa, azucar, 130),(m_coco_sa, menta, 3),
    (m_coco_sa, pulpa_coco, 125),(m_coco_sa, hielo_cubo, 13),(m_coco_sa, ginger, 500);

  -- Frutas loop
  FOR i IN 1..array_length(frutas,1) LOOP
    p_mojito    := frutas[i][1]::uuid;
    p_mojito_sa := frutas[i][2]::uuid;
    p_colada    := frutas[i][3]::uuid;
    p_colada_sa := frutas[i][4]::uuid;
    pulpa       := frutas[i][5]::uuid;

    -- Mojito frutal c/alcohol
    INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
      (p_mojito, ron_blanco, 100),(p_mojito, limon, 100),(p_mojito, azucar, 130),
      (p_mojito, menta, 3),(p_mojito, pulpa, 75),(p_mojito, hielo_cubo, 13),(p_mojito, ginger, 500);

    -- Mojito frutal S/A
    INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
      (p_mojito_sa, limon, 100),(p_mojito_sa, azucar, 130),(p_mojito_sa, menta, 3),
      (p_mojito_sa, pulpa, 75),(p_mojito_sa, hielo_cubo, 13),(p_mojito_sa, ginger, 600);

    -- Colada c/alcohol
    INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
      (p_colada, ron_blanco, 100),(p_colada, azucar, 130),(p_colada, pulpa, 200),
      (p_colada, hielo_frappe, 600),(p_colada, leche, 500);

    -- Colada S/A
    INSERT INTO public.recetas (producto_id, insumo_id, cantidad) VALUES
      (p_colada_sa, azucar, 130),(p_colada_sa, pulpa, 200),
      (p_colada_sa, hielo_frappe, 700),(p_colada_sa, leche, 500);
  END LOOP;
END $$;
