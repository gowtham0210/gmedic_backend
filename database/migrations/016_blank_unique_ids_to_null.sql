-- Registration numbers and GSTINs are unique. A blank one was saved as '' (which only one row may
-- hold) instead of NULL (which any number may), so editing a second doctor or hospital without one
-- failed. The admin controllers now store blanks as NULL; this repairs rows saved before that.
UPDATE doctors SET registration_number = NULL WHERE TRIM(registration_number) = '';
UPDATE hospitals SET registration_number = NULL WHERE TRIM(registration_number) = '';
UPDATE hospitals SET gstin = NULL WHERE TRIM(gstin) = '';
