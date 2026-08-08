-- Legacy notifications.message turini fresh schema bilan xavfsiz moslashtirish.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM notifications
    WHERE LENGTH(message) > 255
  ) THEN
    RAISE EXCEPTION 'notifications.message contains values longer than 255 characters';
  END IF;
END
$$;

ALTER TABLE notifications
  ALTER COLUMN message TYPE VARCHAR(255)
  USING message::VARCHAR(255);
