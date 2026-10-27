-- Persist provider-confirmed capture time separately from payment creation time.
-- Existing rows intentionally remain NULL until a capture event is observed.
ALTER TABLE "Payment" ADD COLUMN "capturedAt" DATETIME;
