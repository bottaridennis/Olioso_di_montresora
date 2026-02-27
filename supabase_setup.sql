/* 
  Esegui questo SQL nel SQL Editor di Supabase per creare la tabella e le politiche di sicurezza.
*/

-- 1. Crea la tabella
CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact TEXT,
    title TEXT, -- Usato per "Moglie", "Marito", ecc.
    parent_id UUID REFERENCES family_members(id) ON DELETE CASCADE, -- ID del genitore (linea di sangue)
    spouse_id UUID REFERENCES family_members(id) ON DELETE SET NULL, -- ID del partner (se questo record è un coniuge)
    bio TEXT, -- Note biografiche o storiche
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Abilita Row Level Security (RLS)
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- 3. Crea politica: Tutti possono leggere i dati
CREATE POLICY "Public Access" ON family_members
    FOR SELECT USING (true);

-- 4. Crea politica: Solo gli utenti autenticati possono modificare i dati
CREATE POLICY "Admin CRUD" ON family_members
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);
