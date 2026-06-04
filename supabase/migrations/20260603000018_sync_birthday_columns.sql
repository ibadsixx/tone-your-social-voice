CREATE OR REPLACE FUNCTION sync_birthday_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  y int;
  m int;
  d int;
BEGIN
  -- birthday changed → sync birth_date and birth_year
  IF NEW.birthday IS DISTINCT FROM OLD.birthday THEN
    IF NEW.birthday IS NOT NULL THEN
      NEW.birth_date := make_date(2000, EXTRACT(MONTH FROM NEW.birthday)::int, EXTRACT(DAY FROM NEW.birthday)::int);
      NEW.birth_year := EXTRACT(YEAR FROM NEW.birthday)::int;
    ELSE
      NEW.birth_date := NULL;
      NEW.birth_year := NULL;
    END IF;
    RETURN NEW;

  -- birth_date changed → sync birthday (preserve year from birth_year or birthday)
  ELSIF NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
    IF NEW.birth_date IS NOT NULL THEN
      y := COALESCE(NEW.birth_year, OLD.birth_year, EXTRACT(YEAR FROM OLD.birthday)::int, 2000);
      NEW.birthday := make_date(y, EXTRACT(MONTH FROM NEW.birth_date)::int, EXTRACT(DAY FROM NEW.birth_date)::int);
    ELSE
      NEW.birthday := NULL;
    END IF;
    IF NEW.birth_year IS NULL AND NEW.birthday IS NOT NULL THEN
      NEW.birth_year := EXTRACT(YEAR FROM NEW.birthday)::int;
    END IF;
    RETURN NEW;

  -- birth_year changed → sync birthday (preserve month/day from birth_date or birthday)
  ELSIF NEW.birth_year IS DISTINCT FROM OLD.birth_year THEN
    IF NEW.birth_year IS NOT NULL THEN
      m := EXTRACT(MONTH FROM COALESCE(NEW.birth_date, OLD.birth_date, OLD.birthday, '2000-01-01'::date))::int;
      d := EXTRACT(DAY FROM COALESCE(NEW.birth_date, OLD.birth_date, OLD.birthday, '2000-01-01'::date))::int;
      NEW.birthday := make_date(NEW.birth_year, m, d);
    ELSE
      NEW.birthday := NULL;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_birthday_columns_trigger
  BEFORE UPDATE OF birthday, birth_date, birth_year ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_birthday_columns();
