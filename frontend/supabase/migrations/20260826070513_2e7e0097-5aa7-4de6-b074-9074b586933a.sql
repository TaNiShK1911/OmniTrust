CREATE TYPE public.app_role AS ENUM ('buyer','seller');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'buyer',
  demo_scenario text NOT NULL DEFAULT 'delivered',
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_own_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL DEFAULT '',
  list_price numeric(12,2) NOT NULL,
  price_floor numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  stock int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON public.products FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products ON DELETE RESTRICT,
  quantity int NOT NULL DEFAULT 1,
  max_turns int NOT NULL DEFAULT 4,
  turn_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  buyer_target numeric(12,2) NOT NULL,
  agreed_unit_price numeric(12,2),
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.negotiations TO authenticated;
GRANT ALL ON public.negotiations TO service_role;
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "negotiations_own_all" ON public.negotiations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  negotiation_id uuid REFERENCES public.negotiations ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity int NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created',
  escrow_status text NOT NULL DEFAULT 'none',
  escrow_ref text,
  settlement_ref text,
  refund_ref text,
  refund_amount numeric(12,2),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_own_all" ON public.orders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders ON DELETE CASCADE,
  tracking_id text NOT NULL UNIQUE,
  carrier text NOT NULL DEFAULT 'OmniTrust Mock 3PL',
  status text NOT NULL DEFAULT 'registered',
  condition text NOT NULL DEFAULT 'intact',
  last_event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipments TO authenticated;
GRANT ALL ON public.shipments TO service_role;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipments_own_all" ON public.shipments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  reason text NOT NULL DEFAULT 'DAMAGED_GOODS',
  decision text,
  penalty_pct numeric(5,2),
  refund_amount numeric(12,2),
  confidence numeric(5,2),
  refund_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disputes_own_all" ON public.disputes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders ON DELETE CASCADE,
  negotiation_id uuid REFERENCES public.negotiations ON DELETE CASCADE,
  category text NOT NULL,
  event_type text NOT NULL,
  actor text NOT NULL,
  entity text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'success',
  latency_ms int,
  request_id text,
  decision text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_own_select" ON public.audit_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "audit_own_insert" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_audit_order ON public.audit_events(order_id, created_at);
CREATE INDEX idx_orders_user ON public.orders(user_id, created_at DESC);
CREATE INDEX idx_negotiations_user ON public.negotiations(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_negotiations_updated BEFORE UPDATE ON public.negotiations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_disputes_updated BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    CASE WHEN NEW.raw_user_meta_data->>'role' = 'seller' THEN 'seller'::public.app_role ELSE 'buyer'::public.app_role END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.products (sku, name, category, description, list_price, price_floor, stock) VALUES
('OMNI-CNC-001','Precision CNC Bearing Set','industrial','Hardened steel bearing set, 50-unit industrial pack.',60000.00,48000.00,40),
('OMNI-PCB-002','Edge IoT Controller Board','electronics','ARM-based controller board with secure element.',2500.00,2000.00,500),
('OMNI-BAT-003','LiFePO4 Battery Module 5kWh','energy','Grid-tie storage module, IP65 enclosure.',140000.00,112000.00,25),
('OMNI-SEN-004','Industrial Vibration Sensor','electronics','IEPE accelerometer with 4-20mA output.',8200.00,6600.00,300),
('OMNI-ROB-005','6-Axis Robotic Arm (Payload 5kg)','robotics','Collaborative arm with force feedback.',480000.00,395000.00,8),
('OMNI-PKG-006','Anti-Static Shipping Crate','logistics','Reusable ESD-safe crate, 60x40x40cm.',3400.00,2700.00,650),
('OMNI-OPT-007','Machine Vision Lens 25mm','optics','Low-distortion C-mount lens for inspection lines.',14500.00,11800.00,120),
('OMNI-MTR-008','Brushless Servo Motor 750W','industrial','Absolute encoder, 3000 rpm rated.',26000.00,21000.00,90),
('OMNI-CBL-009','Shielded Fieldbus Cable 100m','industrial','PROFINET-rated shielded cable spool.',9800.00,7900.00,210),
('OMNI-GTW-010','Secure Telemetry Gateway','electronics','LTE + Ethernet gateway with HMAC event signing.',31000.00,25500.00,60);