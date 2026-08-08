-- Legacy friendships.status nullability holatini fresh schema bilan moslashtirish.

ALTER TABLE friendships
  ALTER COLUMN status SET NOT NULL;
