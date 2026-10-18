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
