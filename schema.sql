-- PostgreSQL schema for Marquee Manager. Run: psql "$DATABASE_URL" -f schema.sql
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, customer TEXT, phone TEXT,
  type TEXT, date DATE NOT NULL, shift TEXT, guests INTEGER, per_head NUMERIC(12,2),
  total NUMERIC(14,2) NOT NULL DEFAULT 0, advance NUMERIC(14,2) DEFAULT 0, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, role TEXT, phone TEXT, pay_type TEXT,
  salary NUMERIC(12,2), joined DATE, active TEXT DEFAULT 'Active', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS salaries (
  id SERIAL PRIMARY KEY, staff_name TEXT NOT NULL, date DATE NOT NULL, amount NUMERIC(12,2) NOT NULL,
  for_month TEXT, method TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY, category TEXT, description TEXT NOT NULL, date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT, qty INTEGER DEFAULT 1,
  unit_value NUMERIC(12,2), condition TEXT, purchased DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());

-- Upgrades for existing databases. Safe to run on every start.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS hall TEXT,
  ADD COLUMN IF NOT EXISTS booked_on DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS extra_guests INTEGER,
  ADD COLUMN IF NOT EXISTS extra_charges NUMERIC(14,2) DEFAULT 0;
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS repair_qty INTEGER,
  ADD COLUMN IF NOT EXISTS repair_note TEXT;
CREATE INDEX IF NOT EXISTS bookings_slot ON bookings (hall, date, shift);

-- Money received after the advance (balance payments on or after the event day).
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  date DATE NOT NULL, amount NUMERIC(14,2) NOT NULL, method TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now());

-- AC / chiller and other extras on the event day; expenses written automatically for asset purchases.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ac_units INTEGER,
  ADD COLUMN IF NOT EXISTS ac_rate NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS other_charges NUMERIC(14,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS asset_id TEXT;

-- Categories the user adds (kind = 'asset' for now).
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());

-- Rate charged per extra guest on the event day (defaults to the booking's per_head when empty).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_rate NUMERIC(12,2);
